import FullCalendarPlugin from '../../main';
import { Notice, requestUrl } from 'obsidian';
import { t } from '../i18n/i18n';
import { AWBucket, AWEvent } from './api';
import { OFCEvent } from '../../types';
import { moment as obsidianMoment } from 'obsidian';
import { executeFSM, FlattenedEvent } from './fsm';

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

  if (!settings.enabled) return;
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
      buckets = JSON.parse(bucketsResponse.text) as Record<string, AWBucket>;
    }

    const bucketIdsToFetch = new Set<string>();
    for (const b of Object.values(buckets)) {
      if (
        b.type === 'currentwindow' ||
        b.type === 'web.tab.current' ||
        b.type === 'afk' ||
        b.id.includes('window') ||
        b.id.includes('web') ||
        b.id.includes('afk')
      ) {
        bucketIdsToFetch.add(b.id);
      }
    }

    let startTime = new Date(
      settings.lastSyncTime > 0 ? settings.lastSyncTime : Date.now() - 24 * 60 * 60 * 1000
    );
    let endTime = new Date();

    if (settings.syncStrategy === 'custom') {
      if (settings.customDateStart) startTime = new Date(settings.customDateStart);
      if (settings.customDateEnd) endTime = new Date(settings.customDateEnd);
    }

    const startTimeISO = startTime.toISOString();
    const endTimeISO = endTime.toISOString();

    const fetchEvents = async (bucketId: string): Promise<AWEvent[]> => {
      const resp = await requestUrl(
        `${settings.apiUrl}/api/0/buckets/${bucketId}/events?start=${startTimeISO}&end=${endTimeISO}`
      );
      return resp.json as AWEvent[];
    };

    const flatEvents: FlattenedEvent[] = [];
    for (const bId of bucketIdsToFetch) {
      const bObj = buckets[bId] || Object.values(buckets).find(b => b.id === bId);
      if (!bObj) continue;

      const isWeb = bObj.type === 'web.tab.current' || bObj.id.includes('web');
      const isAfk = bObj.type === 'afk' || bObj.id.includes('afk');

      let fidelity = 1;
      if (isWeb) fidelity = 2;
      if (isAfk) fidelity = 3;

      const events = await fetchEvents(bId);
      for (const e of events) {
        if (isAfk && e.data?.status === 'not-afk') {
          continue;
        }

        flatEvents.push({
          startMs: new Date(e.timestamp).getTime(),
          endMs: new Date(e.timestamp).getTime() + e.duration * 1000,
          fidelity,
          bucketType: bObj.type,
          data: e.data || {}
        });
      }
    }

    const profiles = settings.profiles || [];
    const finalBlocks = executeFSM(flatEvents, profiles);

    let addedCount = 0;
    for (const block of finalBlocks) {
      const startMoment = moment(block.startMs);
      const endMoment = moment(block.endMs);

      let outputTitle = block.profile.titleTemplate || '{app}';

      const dataDurationMap = new Map<
        string,
        { duration: number; data: Record<string, unknown> }
      >();
      const titleEvidenceSplinters =
        block.primaryEvidenceSplinters.length > 0
          ? block.primaryEvidenceSplinters
          : block.splintersInside;

      for (const s of titleEvidenceSplinters) {
        const dur = Math.min(s.endMs, block.endMs) - Math.max(s.startMs, block.startMs);
        const key = JSON.stringify(s.data);
        const existing = dataDurationMap.get(key) || { duration: 0, data: s.data };
        existing.duration += dur;
        dataDurationMap.set(key, existing);
      }

      let majorData: Record<string, unknown> = {};
      let maxDur = -1;
      for (const val of dataDurationMap.values()) {
        if (val.duration > maxDur) {
          maxDur = val.duration;
          majorData = val.data;
        }
      }

      for (const key of Object.keys(majorData)) {
        const v = majorData[key];
        const strVal = typeof v === 'string' ? v : v ? JSON.stringify(v) : '';
        outputTitle = outputTitle.replaceAll(`{${key}}`, strVal);
      }

      outputTitle = outputTitle.replace(/\{[^}]+\}/g, '').trim();
      if (!outputTitle || outputTitle === '-' || outputTitle === '|') {
        outputTitle = block.profile.name;
      }

      const ofcEvent: OFCEvent = {
        type: 'single',
        title: outputTitle,
        category: block.profile.color,
        subCategory: block.profile.name,
        date: startMoment.format('YYYY-MM-DD'),
        endDate: null,
        allDay: false,
        startTime: startMoment.format('HH:mm'),
        endTime: endMoment.format('HH:mm'),
        display: 'auto'
      };

      await plugin.cache.addEvent(settings.targetCalendarId, ofcEvent);
      addedCount++;
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
