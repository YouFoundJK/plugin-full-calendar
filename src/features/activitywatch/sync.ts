import FullCalendarPlugin from '../../main';
import { Notice, requestUrl } from 'obsidian';
import { t } from '../i18n/i18n';
import { AWBucket, AWEvent } from './api';
import { OFCEvent } from '../../types';
import { moment as obsidianMoment } from 'obsidian';
import { executeFSM, FinalBlock, FlattenedEvent } from './fsm';

const moment = obsidianMoment as unknown as typeof import('moment');
const CONTINUITY_BUFFER_MS = 60 * 1000;
const LOOKBACK_SAFETY_BUFFER_MINS = 5;

type DerivedAWBlock = {
  startMs: number;
  endMs: number;
  title: string;
  profileColor: string;
  profileName: string;
};

type PriorCalendarEvent = {
  sessionId: string | null;
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

function computeLookbackDurationMs(
  profiles: NonNullable<FullCalendarPlugin['settings']['activityWatch']['profiles']>
): number {
  const maxActivationThresholdMins = profiles.reduce(
    (max, profile) => Math.max(max, profile.activationThresholdMins || 0),
    0
  );
  const maxSoftBreakLimitMins = profiles.reduce(
    (max, profile) => Math.max(max, profile.softBreakLimitMins || 0),
    0
  );

  return (
    (maxActivationThresholdMins + maxSoftBreakLimitMins + LOOKBACK_SAFETY_BUFFER_MINS) * 60 * 1000
  );
}

function isSameProfileBlock(existing: PriorCalendarEvent, block: DerivedAWBlock): boolean {
  return (
    existing.event.subCategory === block.profileName &&
    existing.event.category === block.profileColor
  );
}

function normalizeContinuityTitle(title: string | null | undefined): string {
  return (title || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function isSameContinuityBlock(existing: PriorCalendarEvent, block: DerivedAWBlock): boolean {
  return (
    isSameProfileBlock(existing, block) &&
    normalizeContinuityTitle(existing.event.title) === normalizeContinuityTitle(block.title)
  );
}

async function getCalendarEventsInRange(
  plugin: FullCalendarPlugin,
  targetCalendarId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<PriorCalendarEvent[]> {
  if (rangeEnd.getTime() <= rangeStart.getTime()) return [];

  const calendarInstance = plugin.providerRegistry.getInstance(targetCalendarId);
  if (!calendarInstance) return [];

  const providerEvents = await calendarInstance.getEvents({ start: rangeStart, end: rangeEnd });
  const candidates: PriorCalendarEvent[] = [];

  for (const [event] of providerEvents) {
    const eventRange = parseTimedSingleEventRange(event);
    if (!eventRange) continue;

    if (eventRange.endMs < rangeStart.getTime() - CONTINUITY_BUFFER_MS) continue;
    if (eventRange.startMs > rangeEnd.getTime() + CONTINUITY_BUFFER_MS) continue;

    const globalIdentifier = plugin.providerRegistry.getGlobalIdentifier(event, targetCalendarId);
    const sessionId = globalIdentifier
      ? await plugin.providerRegistry.getSessionId(globalIdentifier)
      : null;

    candidates.push({
      sessionId,
      event,
      startMs: eventRange.startMs,
      endMs: eventRange.endMs
    });
  }

  return candidates.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
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

function findSwallowingExistingEvent(
  existingEvents: PriorCalendarEvent[],
  block: DerivedAWBlock
): PriorCalendarEvent | null {
  return (
    existingEvents.find(
      existing =>
        isSameContinuityBlock(existing, block) &&
        existing.startMs <= block.startMs + CONTINUITY_BUFFER_MS &&
        existing.endMs >= block.endMs - CONTINUITY_BUFFER_MS
    ) || null
  );
}

function findExtendableExistingEvent(
  existingEvents: PriorCalendarEvent[],
  block: DerivedAWBlock
): PriorCalendarEvent | null {
  const extendableCandidates = existingEvents.filter(
    existing =>
      isSameContinuityBlock(existing, block) &&
      existing.endMs >= block.startMs - CONTINUITY_BUFFER_MS &&
      existing.startMs <= block.endMs + CONTINUITY_BUFFER_MS &&
      block.endMs > existing.endMs + CONTINUITY_BUFFER_MS
  );

  if (extendableCandidates.length === 0) {
    return null;
  }

  return extendableCandidates.reduce((latest, candidate) =>
    candidate.endMs > latest.endMs ? candidate : latest
  );
}

function recoverSessionIdFromStore(
  plugin: FullCalendarPlugin,
  targetCalendarId: string,
  block: DerivedAWBlock
): string | null {
  const matches = plugin.cache.store
    .getAllEvents()
    .filter(stored => {
      if (stored.calendarId !== targetCalendarId) return false;

      const range = parseTimedSingleEventRange(stored.event);
      if (!range) return false;

      const sameProfile =
        stored.event.subCategory === block.profileName &&
        stored.event.category === block.profileColor;
      const sameTitle =
        normalizeContinuityTitle(stored.event.title) === normalizeContinuityTitle(block.title);
      const overlaps =
        range.endMs >= block.startMs - CONTINUITY_BUFFER_MS &&
        range.startMs <= block.endMs + CONTINUITY_BUFFER_MS;

      return sameProfile && sameTitle && overlaps;
    })
    .sort((a, b) => {
      const aRange = parseTimedSingleEventRange(a.event);
      const bRange = parseTimedSingleEventRange(b.event);
      return (bRange?.endMs || 0) - (aRange?.endMs || 0);
    });

  return matches[0]?.id || null;
}

function materializeBlockAsEvent(block: DerivedAWBlock): OFCEvent {
  const startMoment = moment(block.startMs);
  const endMoment = moment(block.endMs);

  return {
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
}

async function createOrUpdateBlock(
  plugin: FullCalendarPlugin,
  targetCalendarId: string,
  block: DerivedAWBlock,
  existingOverlapEvents: PriorCalendarEvent[],
  canExtendExistingEvents: boolean
): Promise<'ignored' | 'extended' | 'created'> {
  const swallowing = findSwallowingExistingEvent(existingOverlapEvents, block);
  if (swallowing) {
    return 'ignored';
  }

  if (canExtendExistingEvents) {
    const extendable = findExtendableExistingEvent(existingOverlapEvents, block);
    if (extendable) {
      let sessionId = extendable.sessionId;

      if (!sessionId) {
        sessionId = recoverSessionIdFromStore(plugin, targetCalendarId, block);
      }

      if (sessionId) {
        const didExtend = await extendEventEndIfNeeded(plugin, sessionId, block.endMs);
        if (didExtend) {
          extendable.sessionId = sessionId;
          extendable.endMs = block.endMs;
          extendable.event = materializeBlockAsEvent(block);
          return 'extended';
        }
      }
    } else {
      const recoveredSessionId = recoverSessionIdFromStore(plugin, targetCalendarId, block);

      if (recoveredSessionId) {
        const didExtend = await extendEventEndIfNeeded(plugin, recoveredSessionId, block.endMs);
        if (didExtend) {
          return 'extended';
        }
      }
    }
  }

  const ofcEvent = materializeBlockAsEvent(block);
  const created = await plugin.cache.addEvent(targetCalendarId, ofcEvent);

  if (created) {
    const recoveredCreatedSessionId = recoverSessionIdFromStore(plugin, targetCalendarId, block);
    existingOverlapEvents.push({
      sessionId: recoveredCreatedSessionId,
      event: ofcEvent,
      startMs: block.startMs,
      endMs: block.endMs
    });

    return 'created';
  }

  return 'ignored';
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

    if (!isCustomStrategy && settings.lastSyncTime > 0 && !options?.overrideStart) {
      const lookbackMs = computeLookbackDurationMs(profiles);
      startTime = new Date(Math.max(0, settings.lastSyncTime - lookbackMs));
    }

    const finalBlocks = await deriveActivityWatchBlocks(
      settings.apiUrl,
      buckets,
      bucketIdsToFetch,
      profiles,
      startTime,
      endTime
    );

    let existingOverlapEvents: PriorCalendarEvent[] = [];
    if (!isCustomStrategy && settings.lastSyncTime > 0) {
      plugin.providerRegistry.buildMap(plugin.cache.store);
      const overlapEnd = new Date(settings.lastSyncTime);
      existingOverlapEvents = await getCalendarEventsInRange(
        plugin,
        settings.targetCalendarId,
        startTime,
        overlapEnd
      );
    }

    const canExtendExistingEvents = calendarInstance.getCapabilities().canEdit;

    let addedCount = 0;
    const sortedFinalBlocks = [...finalBlocks].sort((a, b) => a.startMs - b.startMs);
    for (const block of sortedFinalBlocks) {
      const action = await createOrUpdateBlock(
        plugin,
        settings.targetCalendarId,
        block,
        existingOverlapEvents,
        canExtendExistingEvents
      );
      if (action === 'created') {
        addedCount++;
      }
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
