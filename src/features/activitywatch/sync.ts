import FullCalendarPlugin from '../../main';
import { Notice, requestUrl } from 'obsidian';
import { t } from '../i18n/i18n';
import { AWBucket, AWEvent } from './api';
import { OFCEvent } from '../../types';
import { moment as obsidianMoment } from 'obsidian';
import { executeFSM, FinalBlock, FlattenedEvent } from './fsm';

const moment = obsidianMoment as unknown as typeof import('moment');
const CONTINUITY_LOOKBACK_MS = 60 * 60 * 1000;
const CONTINUITY_BUFFER_MS = 60 * 1000;

type DerivedAWBlock = {
  startMs: number;
  endMs: number;
  title: string;
  profileColor: string;
  profileName: string;
};

type PriorCalendarEvent = {
  sessionId: string;
  event: OFCEvent;
  startMs: number;
  endMs: number;
};

export interface SyncOptions {
  overrideStart?: Date;
  overrideEnd?: Date;
  suppressNotices?: boolean;
}

function parseTimedSingleEventRange(event: OFCEvent): { startMs: number; endMs: number } | null {
  if (event.type !== 'single' || event.allDay) return null;
  if (!event.startTime || !event.endTime) return null;

  const startMoment = moment(`${event.date} ${event.startTime}`, 'YYYY-MM-DD HH:mm', true);
  const endBaseDate = event.endDate || event.date;
  const endMoment = moment(`${endBaseDate} ${event.endTime}`, 'YYYY-MM-DD HH:mm', true);

  if (!startMoment.isValid() || !endMoment.isValid()) return null;

  const startMs = startMoment.valueOf();
  let endMs = endMoment.valueOf();
  if (endMs <= startMs) {
    endMs += 24 * 60 * 60 * 1000;
  }

  return { startMs, endMs };
}

function deriveOutputTitle(block: FinalBlock): string {
  let outputTitle = block.profile.titleTemplate || '{app}';

  const dataDurationMap = new Map<string, { duration: number; data: Record<string, unknown> }>();
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

  return outputTitle;
}

async function deriveActivityWatchBlocks(
  apiUrl: string,
  buckets: Record<string, AWBucket>,
  bucketIdsToFetch: Set<string>,
  profiles: NonNullable<FullCalendarPlugin['settings']['activityWatch']['profiles']>,
  startTime: Date,
  endTime: Date
): Promise<DerivedAWBlock[]> {
  if (endTime.getTime() <= startTime.getTime()) {
    return [];
  }

  const startTimeISO = startTime.toISOString();
  const endTimeISO = endTime.toISOString();

  const fetchEvents = async (bucketId: string): Promise<AWEvent[]> => {
    const resp = await requestUrl(
      `${apiUrl}/api/0/buckets/${bucketId}/events?start=${startTimeISO}&end=${endTimeISO}`
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

  const finalBlocks = executeFSM(flatEvents, profiles);
  return finalBlocks.map(block => ({
    startMs: block.startMs,
    endMs: block.endMs,
    title: deriveOutputTitle(block),
    profileColor: block.profile.color,
    profileName: block.profile.name
  }));
}

async function findLastCalendarEventBeforeSync(
  plugin: FullCalendarPlugin,
  targetCalendarId: string,
  lastSyncTimeMs: number
): Promise<PriorCalendarEvent | null> {
  if (lastSyncTimeMs <= 0) return null;

  const calendarInstance = plugin.providerRegistry.getInstance(targetCalendarId);
  if (!calendarInstance) return null;

  const rangeStart = new Date(lastSyncTimeMs - CONTINUITY_LOOKBACK_MS);
  const rangeEnd = new Date(lastSyncTimeMs);

  const providerEvents = await calendarInstance.getEvents({ start: rangeStart, end: rangeEnd });
  const candidates = providerEvents
    .map(([event]) => {
      const range = parseTimedSingleEventRange(event);
      if (!range) return null;
      return { event, ...range };
    })
    .filter((val): val is { event: OFCEvent; startMs: number; endMs: number } => val !== null)
    .filter(candidate => candidate.startMs <= lastSyncTimeMs + CONTINUITY_BUFFER_MS)
    .sort((a, b) => b.endMs - a.endMs || b.startMs - a.startMs);

  for (const candidate of candidates) {
    const globalIdentifier = plugin.providerRegistry.getGlobalIdentifier(
      candidate.event,
      targetCalendarId
    );
    if (!globalIdentifier) continue;

    const sessionId = await plugin.providerRegistry.getSessionId(globalIdentifier);
    if (!sessionId) continue;

    return {
      sessionId,
      event: candidate.event,
      startMs: candidate.startMs,
      endMs: candidate.endMs
    };
  }

  return null;
}

async function extendEventEndIfNeeded(
  plugin: FullCalendarPlugin,
  eventId: string,
  newEndMs: number
): Promise<boolean> {
  const details = plugin.cache.store.getEventDetails(eventId);
  if (!details) return false;

  const existingRange = parseTimedSingleEventRange(details.event);
  if (!existingRange) return false;
  if (newEndMs <= existingRange.endMs) return false;

  const event = details.event;
  if (event.type !== 'single' || event.allDay || !event.startTime) {
    return false;
  }

  const endMoment = moment(newEndMs);
  const newEndDate = endMoment.format('YYYY-MM-DD');
  const updatedEvent: OFCEvent = {
    ...event,
    endTime: endMoment.format('HH:mm'),
    endDate: newEndDate !== event.date ? newEndDate : null
  };

  return plugin.cache.updateEventWithId(eventId, updatedEvent);
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
    if (!options?.suppressNotices) {
      new Notice(
        t('settings.activityWatch.sync.targetNotFoundOrReadOnly', {
          calendarId: settings.targetCalendarId
        })
      );
    }
    return;
  }

  if (!options?.suppressNotices) {
    new Notice(t('settings.activityWatch.sync.fetchingData'));
  }

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

    if (options?.overrideStart) startTime = options.overrideStart;
    if (options?.overrideEnd) endTime = options.overrideEnd;

    const profiles = settings.profiles || [];
    const isCustomStrategy = settings.syncStrategy === 'custom';

    let extendedContinuity: {
      title: string;
      anchorEndMs: number;
      extendedEndMs: number;
    } | null = null;

    if (
      !isCustomStrategy &&
      settings.lastSyncTime > 0 &&
      calendarInstance.getCapabilities().canEdit
    ) {
      const priorEvent = await findLastCalendarEventBeforeSync(
        plugin,
        settings.targetCalendarId,
        settings.lastSyncTime
      );

      if (priorEvent) {
        const verificationBlocks = await deriveActivityWatchBlocks(
          settings.apiUrl,
          buckets,
          bucketIdsToFetch,
          profiles,
          new Date(priorEvent.startMs - CONTINUITY_BUFFER_MS),
          new Date(priorEvent.endMs + CONTINUITY_BUFFER_MS)
        );

        const hasExactTitleInVerification = verificationBlocks.some(
          block => block.title === priorEvent.event.title
        );

        if (hasExactTitleInVerification) {
          const continuityBlocks = await deriveActivityWatchBlocks(
            settings.apiUrl,
            buckets,
            bucketIdsToFetch,
            profiles,
            new Date(priorEvent.startMs),
            endTime
          );

          const continuousBlock = continuityBlocks.find(
            block =>
              block.title === priorEvent.event.title &&
              block.startMs <= priorEvent.endMs + CONTINUITY_BUFFER_MS &&
              block.endMs >= priorEvent.endMs - CONTINUITY_BUFFER_MS
          );

          if (continuousBlock) {
            const didExtend = await extendEventEndIfNeeded(
              plugin,
              priorEvent.sessionId,
              continuousBlock.endMs
            );
            if (didExtend) {
              extendedContinuity = {
                title: continuousBlock.title,
                anchorEndMs: priorEvent.endMs,
                extendedEndMs: continuousBlock.endMs
              };
            }
          }
        }
      }
    }

    const finalBlocks = await deriveActivityWatchBlocks(
      settings.apiUrl,
      buckets,
      bucketIdsToFetch,
      profiles,
      startTime,
      endTime
    );

    let addedCount = 0;
    for (const block of finalBlocks) {
      if (
        extendedContinuity &&
        block.title === extendedContinuity.title &&
        block.startMs <= extendedContinuity.extendedEndMs + CONTINUITY_BUFFER_MS &&
        block.endMs >= extendedContinuity.anchorEndMs - CONTINUITY_BUFFER_MS
      ) {
        continue;
      }

      const startMoment = moment(block.startMs);
      const endMoment = moment(block.endMs);

      const ofcEvent: OFCEvent = {
        type: 'single',
        title: block.title,
        category: block.profileColor,
        subCategory: block.profileName,
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

    if (!options?.suppressNotices) {
      new Notice(t('settings.activityWatch.sync.addedEvents', { count: addedCount.toString() }));
    }
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (!options?.suppressNotices) {
        new Notice(t('settings.activityWatch.sync.failedWithError', { message: err.message }));
      }
      console.error('ActivityWatch sync error:', err);
    } else {
      if (!options?.suppressNotices) {
        new Notice(t('settings.activityWatch.sync.failed'));
      }
    }
  }
}
