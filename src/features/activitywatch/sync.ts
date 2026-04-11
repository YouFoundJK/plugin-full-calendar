import FullCalendarPlugin from '../../main';
import { Notice, requestUrl } from 'obsidian';
import { t } from '../i18n/i18n';
import { AWBucket, AWEvent } from './api';
import { OFCEvent } from '../../types';
import { moment as obsidianMoment } from 'obsidian';
import { executeFSM, FinalBlock, FlattenedEvent, SeedState } from './fsm';

const moment = obsidianMoment as unknown as typeof import('moment');
const CONTINUITY_BUFFER_MS = 60 * 1000;
const LOOKBACK_SAFETY_BUFFER_MINS = 5;
const MIN_SYNC_LOOKBACK_MINS = 30;
const MAX_SYNC_LOOKBACK_MINS = 6 * 60;

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

type ProfileSignature = string;

type TimeRange = {
  startMs: number;
  endMs: number;
};

const COMMON_BROWSER_APP_PATTERN =
  /(firefox|chrome|chromium|edge|brave|opera|vivaldi|arc|safari|librewolf|waterfox|floorp|zen|whale|tor)/i;

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
  endTime: Date,
  seedStates: SeedState[] = []
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

  const getEventRange = (event: AWEvent): TimeRange => {
    const startMs = new Date(event.timestamp).getTime();
    return {
      startMs,
      endMs: startMs + event.duration * 1000
    };
  };

  const isBrowserWindowEvent = (event: AWEvent): boolean => {
    const app = typeof event.data?.app === 'string' ? event.data.app : '';
    return COMMON_BROWSER_APP_PATTERN.test(app);
  };

  const rangesOverlap = (left: TimeRange, right: TimeRange): boolean =>
    left.startMs < right.endMs && right.startMs < left.endMs;

  const fetchedEventsByBucket = new Map<string, AWEvent[]>();
  for (const bId of bucketIdsToFetch) {
    const bObj = buckets[bId] || Object.values(buckets).find(b => b.id === bId);
    if (!bObj) continue;

    fetchedEventsByBucket.set(bId, await fetchEvents(bId));
  }

  const browserWindowRanges: TimeRange[] = [];
  for (const bId of bucketIdsToFetch) {
    const bObj = buckets[bId] || Object.values(buckets).find(b => b.id === bId);
    if (!bObj) continue;

    const isWindow = bObj.type === 'currentwindow' || bObj.id.includes('window');
    if (!isWindow) continue;

    const events = fetchedEventsByBucket.get(bId) || [];
    for (const e of events) {
      if (!isBrowserWindowEvent(e)) continue;
      const range = getEventRange(e);
      if (range.endMs <= range.startMs) continue;
      browserWindowRanges.push(range);
    }
  }

  const flatEvents: FlattenedEvent[] = [];
  for (const bId of bucketIdsToFetch) {
    const bObj = buckets[bId] || Object.values(buckets).find(b => b.id === bId);
    if (!bObj) continue;

    const isWeb = bObj.type === 'web.tab.current' || bObj.id.includes('web');
    const isAfk = bObj.type === 'afk' || bObj.id.includes('afk');
    const isWindow = bObj.type === 'currentwindow' || bObj.id.includes('window');
    const events = fetchedEventsByBucket.get(bId) || [];
    for (const e of events) {
      if (isAfk && e.data?.status === 'not-afk') {
        continue;
      }

      const range = getEventRange(e);
      if (range.endMs <= range.startMs) continue;

      // Priority policy: AFK always wins. Window beats web by default.
      // Web can outrank window only while a browser app window is active.
      let fidelity = 1;
      if (isWindow) fidelity = 2;
      if (isWeb) {
        const overlapsBrowserWindow = browserWindowRanges.some(browserRange =>
          rangesOverlap(range, browserRange)
        );
        fidelity = overlapsBrowserWindow ? 2.5 : 1;
      }
      if (isAfk) fidelity = 3;

      flatEvents.push({
        startMs: range.startMs,
        endMs: range.endMs,
        fidelity,
        bucketType: bObj.type,
        data: e.data || {}
      });
    }
  }

  const finalBlocks = executeFSM(flatEvents, profiles, seedStates);
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

function findBoundaryOverlappingActivityWatchEvent(
  plugin: FullCalendarPlugin,
  targetCalendarId: string,
  knownProfileSignatures: Set<ProfileSignature>,
  syncBoundaryMs: number
): PriorCalendarEvent | null {
  const candidates = plugin.cache.store
    .getAllEvents()
    .filter(stored => {
      if (stored.calendarId !== targetCalendarId) return false;

      const range = parseTimedSingleEventRange(stored.event);
      if (!range) return false;
      const overlapsBoundary =
        range.startMs <= syncBoundaryMs + CONTINUITY_BUFFER_MS &&
        range.endMs >= syncBoundaryMs - CONTINUITY_BUFFER_MS;
      if (!overlapsBoundary) return false;

      const prior: PriorCalendarEvent = {
        sessionId: stored.id,
        event: stored.event,
        startMs: range.startMs,
        endMs: range.endMs
      };

      if (!isKnownActivityWatchProfileEvent(prior, knownProfileSignatures)) return false;
      if (!normalizeContinuityTitle(stored.event.title)) return false;

      return true;
    })
    .sort((a, b) => {
      const aRange = parseTimedSingleEventRange(a.event);
      const bRange = parseTimedSingleEventRange(b.event);
      return (bRange?.endMs || 0) - (aRange?.endMs || 0);
    });

  if (!candidates[0]) return null;

  const latest = candidates[0];
  const latestRange = parseTimedSingleEventRange(latest.event);
  if (!latestRange) return null;

  return {
    sessionId: latest.id,
    event: latest.event,
    startMs: latestRange.startMs,
    endMs: latestRange.endMs
  };
}

function computeBoundedLookbackDurationMs(
  profiles: NonNullable<FullCalendarPlugin['settings']['activityWatch']['profiles']>,
  matchedProfile?: NonNullable<FullCalendarPlugin['settings']['activityWatch']['profiles']>[number]
): number {
  const baseLookbackMs = matchedProfile
    ? (matchedProfile.activationThresholdMins +
        matchedProfile.softBreakLimitMins +
        LOOKBACK_SAFETY_BUFFER_MINS) *
      60 *
      1000
    : computeLookbackDurationMs(profiles);
  const minLookbackMs = MIN_SYNC_LOOKBACK_MINS * 60 * 1000;
  const maxLookbackMs = MAX_SYNC_LOOKBACK_MINS * 60 * 1000;
  return Math.min(maxLookbackMs, Math.max(baseLookbackMs, minLookbackMs));
}

function buildSeedStateFromBoundaryEvent(
  profiles: NonNullable<FullCalendarPlugin['settings']['activityWatch']['profiles']>,
  boundaryEvent: PriorCalendarEvent,
  boundaryMs: number
): {
  seedState: SeedState;
  matchedProfile: NonNullable<FullCalendarPlugin['settings']['activityWatch']['profiles']>[number];
} | null {
  const matchedProfile = profiles.find(
    profile =>
      getProfileSignature(profile.name, profile.color) ===
      getProfileSignature(boundaryEvent.event.subCategory || '', boundaryEvent.event.category || '')
  );

  if (!matchedProfile) return null;
  if ((matchedProfile.supportingEvidenceRules || []).length === 0) return null;

  const eventTitle = normalizeContinuityTitle(boundaryEvent.event.title);
  if (!eventTitle) return null;

  const thresholdMs = matchedProfile.activationThresholdMins * 60 * 1000;

  return {
    seedState: {
      profileName: matchedProfile.name,
      profileColor: matchedProfile.color,
      state: 'active',
      sessionStartMs: boundaryEvent.startMs,
      lastEvidenceEndMs: boundaryMs,
      targetTimeMs: thresholdMs,
      fitnessScoreMs: 0
    },
    matchedProfile
  };
}

function isSameProfileBlock(existing: PriorCalendarEvent, block: DerivedAWBlock): boolean {
  return (
    existing.event.subCategory === block.profileName &&
    existing.event.category === block.profileColor
  );
}

function getProfileSignature(
  profileName: string | null | undefined,
  profileColor: string | null | undefined
): ProfileSignature {
  return `${profileName || ''}::${profileColor || ''}`;
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

function isKnownActivityWatchProfileEvent(
  existing: PriorCalendarEvent,
  knownProfileSignatures: Set<ProfileSignature>
): boolean {
  return knownProfileSignatures.has(
    getProfileSignature(existing.event.subCategory || '', existing.event.category || '')
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

function findReplaceableExistingEvents(
  existingEvents: PriorCalendarEvent[],
  block: DerivedAWBlock,
  knownProfileSignatures: Set<ProfileSignature>
): PriorCalendarEvent[] {
  return existingEvents.filter(
    existing =>
      isKnownActivityWatchProfileEvent(existing, knownProfileSignatures) &&
      !isSameContinuityBlock(existing, block) &&
      existing.endMs >= block.startMs - CONTINUITY_BUFFER_MS &&
      existing.startMs <= block.endMs + CONTINUITY_BUFFER_MS
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

function recoverSessionIdForPriorEvent(
  plugin: FullCalendarPlugin,
  targetCalendarId: string,
  existing: PriorCalendarEvent
): string | null {
  const matches = plugin.cache.store
    .getAllEvents()
    .filter(stored => {
      if (stored.calendarId !== targetCalendarId) return false;

      const range = parseTimedSingleEventRange(stored.event);
      if (!range) return false;

      const sameProfile =
        stored.event.subCategory === existing.event.subCategory &&
        stored.event.category === existing.event.category;
      const sameTitle =
        normalizeContinuityTitle(stored.event.title) ===
        normalizeContinuityTitle(existing.event.title);
      const nearSameRange =
        Math.abs(range.startMs - existing.startMs) <= CONTINUITY_BUFFER_MS &&
        Math.abs(range.endMs - existing.endMs) <= CONTINUITY_BUFFER_MS;

      return sameProfile && sameTitle && nearSameRange;
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
  canExtendExistingEvents: boolean,
  canReplaceExistingEvents: boolean,
  knownProfileSignatures: Set<ProfileSignature>
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

  if (canReplaceExistingEvents) {
    const replaceableEvents = findReplaceableExistingEvents(
      existingOverlapEvents,
      block,
      knownProfileSignatures
    );

    for (const existing of replaceableEvents) {
      let sessionId = existing.sessionId;
      if (!sessionId) {
        sessionId = recoverSessionIdForPriorEvent(plugin, targetCalendarId, existing);
      }

      if (!sessionId) continue;

      try {
        await plugin.cache.deleteEvent(sessionId, { force: true });
        existing.sessionId = sessionId;

        const idx = existingOverlapEvents.indexOf(existing);
        if (idx >= 0) {
          existingOverlapEvents.splice(idx, 1);
        }
      } catch (err) {
        console.warn('ActivityWatch sync: failed to replace stale continuity event.', err);
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
    const knownProfileSignatures = new Set<ProfileSignature>(
      profiles.map(profile => getProfileSignature(profile.name, profile.color))
    );
    const isCustomStrategy = settings.syncStrategy === 'custom';
    const boundaryMs = settings.lastSyncTime;

    let seedStates: SeedState[] = [];
    let boundaryMatchedProfile:
      | NonNullable<FullCalendarPlugin['settings']['activityWatch']['profiles']>[number]
      | undefined;
    if (!isCustomStrategy && settings.lastSyncTime > 0) {
      const boundaryEvent = findBoundaryOverlappingActivityWatchEvent(
        plugin,
        settings.targetCalendarId,
        knownProfileSignatures,
        boundaryMs
      );
      if (boundaryEvent) {
        const seeded = buildSeedStateFromBoundaryEvent(profiles, boundaryEvent, boundaryMs);
        if (seeded) {
          seedStates = [seeded.seedState];
          boundaryMatchedProfile = seeded.matchedProfile;
        }
      }
    }

    if (!isCustomStrategy && settings.lastSyncTime > 0 && !options?.overrideStart) {
      const lookbackMs = computeBoundedLookbackDurationMs(profiles, boundaryMatchedProfile);
      startTime = new Date(Math.max(0, settings.lastSyncTime - lookbackMs));
    }

    const finalBlocks = await deriveActivityWatchBlocks(
      settings.apiUrl,
      buckets,
      bucketIdsToFetch,
      profiles,
      startTime,
      endTime,
      seedStates
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

    const capabilities = calendarInstance.getCapabilities();
    const canExtendExistingEvents = capabilities.canEdit;
    const canReplaceExistingEvents = capabilities.canDelete;

    let addedCount = 0;
    const sortedFinalBlocks = [...finalBlocks].sort((a, b) => a.startMs - b.startMs);
    for (const block of sortedFinalBlocks) {
      const action = await createOrUpdateBlock(
        plugin,
        settings.targetCalendarId,
        block,
        existingOverlapEvents,
        canExtendExistingEvents,
        canReplaceExistingEvents,
        knownProfileSignatures
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
