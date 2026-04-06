import FullCalendarPlugin from '../../main';
import { Notice, requestUrl } from 'obsidian';
import { t } from '../i18n/i18n';
import { AWBucket, AWEvent } from './api';
import { OFCEvent } from '../../types';
import { moment as obsidianMoment } from 'obsidian';

const moment = obsidianMoment as unknown as typeof import('moment');

export interface SyncOptions {
  overrideStart?: Date;
  overrideEnd?: Date;
}

export async function syncActivityWatch(
  plugin: FullCalendarPlugin,
  options?: SyncOptions
): Promise<void> {
  const settings = plugin.settings.activityWatch;

  if (!settings.enabled) {
    return;
  }

  if (!settings.targetCalendarId) {
    new Notice(t('settings.activityWatch.sync.targetNotSet'));
    return;
  }

  const calendarInstance = plugin.providerRegistry.getInstance(settings.targetCalendarId);
  if (!calendarInstance || !calendarInstance.getCapabilities()?.canCreate) {
    new Notice(
      t('settings.activityWatch.sync.targetNotFoundOrReadOnly', {
        calendarId: settings.targetCalendarId
      })
    );
    return;
  }

  new Notice(t('settings.activityWatch.sync.fetchingData'));

  try {
    const bucketsResponse = await requestUrl(`${settings.apiUrl}/api/0/buckets`);
    if (bucketsResponse.status !== 200) {
      throw new Error(
        t('settings.activityWatch.sync.failedFetchBuckets', {
          status: bucketsResponse.status.toString()
        })
      );
    }

    let buckets: Record<string, AWBucket>;
    try {
      buckets = bucketsResponse.json as Record<string, AWBucket>;
    } catch {
      // Fallback for some obsidian versions
      buckets = JSON.parse(bucketsResponse.text) as Record<string, AWBucket>;
    }

    const allBucketValues = Object.values(buckets);
    const bucketIdsToFetch = new Set<string>();

    for (const rule of settings.rules) {
      for (const b of allBucketValues) {
        // Retain aliases for backward compatibility with 'window' and 'web'
        if (rule.bucketType === 'window' && b.type === 'currentwindow') {
          bucketIdsToFetch.add(b.id);
        } else if (rule.bucketType === 'web' && b.type === 'web.tab.current') {
          bucketIdsToFetch.add(b.id);
        } else if (b.type === rule.bucketType || b.id.includes(rule.bucketType)) {
          bucketIdsToFetch.add(b.id);
        }
      }
    }

    // Calculate start time: settings.lastSyncTime or 24 hours ago if 0
    let startTime = new Date(settings.lastSyncTime);
    if (settings.lastSyncTime === 0) {
      startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    }

    let endTime = new Date();

    if (settings.syncStrategy === 'custom') {
      if (settings.customDateStart) {
        startTime = new Date(settings.customDateStart);
      }
      if (settings.customDateEnd) {
        endTime = new Date(settings.customDateEnd);
      }
    }

    const startTimeISO = startTime.toISOString();
    const endTimeISO = endTime.toISOString();

    const fetchEvents = async (bucketId: string): Promise<AWEvent[]> => {
      const resp = await requestUrl(
        `${settings.apiUrl}/api/0/buckets/${bucketId}/events?start=${startTimeISO}&end=${endTimeISO}`
      );
      return resp.json as AWEvent[]; // returns AWEvent[]
    };

    const allEvents: { event: AWEvent; sourceBucket: AWBucket }[] = [];

    for (const bId of bucketIdsToFetch) {
      const bucketObj = buckets[bId] || Object.values(buckets).find(b => b.id === bId);
      if (!bucketObj) continue;

      const events = await fetchEvents(bId);
      allEvents.push(...events.map(e => ({ event: e, sourceBucket: bucketObj })));
    }

    // Sort chronologically
    allEvents.sort(
      (a, b) => new Date(a.event.timestamp).getTime() - new Date(b.event.timestamp).getTime()
    );

    // 1. Categorization Phase
    interface MappedEvent {
      startMs: number;
      endMs: number;
      category: string;
      subCategory: string;
      title: string;
    }

    const mappedEvents: MappedEvent[] = [];

    for (const wrappedEvent of allEvents) {
      const ev = wrappedEvent.event;
      const bucket = wrappedEvent.sourceBucket;

      // Find matching rule
      for (const rule of settings.rules) {
        let bucketMatches = false;
        if (rule.bucketType === 'window' && bucket.type === 'currentwindow') bucketMatches = true;
        else if (rule.bucketType === 'web' && bucket.type === 'web.tab.current')
          bucketMatches = true;
        else if (bucket.type === rule.bucketType || bucket.id.includes(rule.bucketType))
          bucketMatches = true;

        if (!bucketMatches) continue;

        let compareString = '';
        if (rule.matchField && ev.data[rule.matchField]) {
          const fieldData = ev.data[rule.matchField];
          compareString = typeof fieldData === 'string' ? fieldData : JSON.stringify(fieldData);
        } else {
          // Auto fallback trying the most common fields
          const baseData =
            ev.data.app || ev.data.url || ev.data.project || ev.data.file || ev.data.title || '';
          compareString = typeof baseData === 'string' ? baseData : JSON.stringify(baseData);
        }

        if (!compareString) continue;

        let isMatch = false;

        if (rule.useRegex) {
          try {
            const regex = new RegExp(rule.matchPattern, 'i');
            isMatch = regex.test(compareString);
          } catch {
            console.warn('ActivityWatch sync: invalid regex pattern', rule.matchPattern);
          }
        } else {
          isMatch = compareString.toLowerCase().includes(rule.matchPattern.toLowerCase());
        }

        if (isMatch) {
          // Apply template using generic property swaps via Object.keys iteration
          let title = rule.titleTemplate;
          for (const key of Object.keys(ev.data)) {
            const val = ev.data[key];
            const strVal = typeof val === 'string' ? val : val ? JSON.stringify(val) : '';
            title = title.replaceAll(`{${key}}`, strVal);
          }
          title = title.trim();

          mappedEvents.push({
            startMs: new Date(ev.timestamp).getTime(),
            endMs: new Date(ev.timestamp).getTime() + ev.duration * 1000,
            category: rule.category,
            subCategory: rule.subCategory || '',
            title: title || compareString
          });
          break; // Stop at first rule match
        }
      }
    }

    // 2. Merging Phase
    const mergedEvents: MappedEvent[] = [];
    const toleranceMs = settings.mergeToleranceMinutes * 60 * 1000;

    for (const current of mappedEvents) {
      if (mergedEvents.length === 0) {
        mergedEvents.push({ ...current });
        continue;
      }

      const prev = mergedEvents[mergedEvents.length - 1];

      // Merge condition: same category/subcat/title AND time gap <= tolerance
      const isSameType =
        prev.category === current.category &&
        prev.subCategory === current.subCategory &&
        prev.title === current.title;
      const gapMs = current.startMs - prev.endMs;

      if (isSameType && gapMs <= toleranceMs) {
        // Merge them
        prev.endMs = Math.max(prev.endMs, current.endMs);
      } else {
        // Drop events shorter than 1 minute if they are completely isolated,
        // to avoid calendar clutter from random 10-second alt-tabs.
        if (current.endMs - current.startMs >= 60000 || settings.mergeToleranceMinutes === 0) {
          mergedEvents.push({ ...current });
        }
      }
    }

    // 3. Cache Injection Phase
    let addedCount = 0;
    for (const merged of mergedEvents) {
      // Skip events lasting less than 1 minute after merging
      if (merged.endMs - merged.startMs < 60000) continue;

      const startMoment = moment(merged.startMs);
      const endMoment = moment(merged.endMs);

      const ofcEvent: OFCEvent = {
        type: 'single',
        title: merged.title,
        category: merged.category,
        subCategory: merged.subCategory,
        date: startMoment.format('YYYY-MM-DD'),
        endDate: null,
        allDay: false,
        startTime: startMoment.format('HH:mm'),
        endTime: endMoment.format('HH:mm'),
        display: 'auto'
      };

      await plugin.cache.addEvent(settings.targetCalendarId, ofcEvent);
      addedCount++;

      // Prevent concurrent write races to Obsidian's file metadata cache
      await new Promise(r => setTimeout(r, 150));
    }

    if (settings.syncStrategy !== 'custom') {
      settings.lastSyncTime = endTime.getTime();
      await plugin.saveSettings();
    }

    new Notice(t('settings.activityWatch.sync.addedEvents', { count: addedCount.toString() }));
  } catch (err: unknown) {
    if (err instanceof Error) {
      new Notice(t('settings.activityWatch.sync.failedWithError', { message: err.message }));
      console.error('ActivityWatch sync error:', err);
    } else {
      new Notice(t('settings.activityWatch.sync.failed'));
    }
  }
}
