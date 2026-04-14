import FullCalendarPlugin from '../../main';
import { Notice, requestUrl } from 'obsidian';
import { t } from '../i18n/i18n';
import { AWBucket, AWEvent } from './api';
import { OFCEvent } from '../../types';
import { moment as obsidianMoment } from 'obsidian';
import { executeFSM, FinalBlock, FlattenedEvent, SeedState, splinterEvents } from './fsm';

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

type ContinuityCandidate = {
  priorEvent: PriorCalendarEvent;
};

type TimeRange = {
  startMs: number;
  endMs: number;
};

type BucketKinds = {
  isWeb: boolean;
  isAfk: boolean;
  isWindow: boolean;
};

type BucketEvent = {
  range: TimeRange;
  data: AWEvent['data'];
  bucketType: string;
  kinds: BucketKinds;
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

  const bucketEventsById = new Map<string, BucketEvent[]>();
  for (const bId of bucketIdsToFetch) {
    const bObj = buckets[bId] || Object.values(buckets).find(b => b.id === bId);
    if (!bObj) continue;

    const events = await fetchEvents(bId);

    const kinds: BucketKinds = {
      isWeb: bObj.type === 'web.tab.current' || bObj.id.includes('web'),
      isAfk: bObj.type === 'afk' || bObj.id.includes('afk'),
      isWindow: bObj.type === 'currentwindow' || bObj.id.includes('window')
    };

    const normalizedEvents: BucketEvent[] = [];
    for (const event of events) {
      if (kinds.isAfk && event.data?.status === 'not-afk') {
        continue;
      }

      const range = getEventRange(event);
      if (range.endMs <= range.startMs) continue;

      normalizedEvents.push({
        range,
        data: event.data || {},
        bucketType: bObj.type,
        kinds
      });
    }

    bucketEventsById.set(bId, normalizedEvents);
  }

  const mainFlatEvents: FlattenedEvent[] = [];
  const webBucketEvents: BucketEvent[] = [];

  for (const bId of bucketIdsToFetch) {
    const events = bucketEventsById.get(bId) || [];
    for (const event of events) {
      if (event.kinds.isWeb) {
        webBucketEvents.push(event);
        continue;
      }

      if (!event.kinds.isWindow && !event.kinds.isAfk) continue;
      const fidelity = event.kinds.isAfk ? 3 : 2;
      mainFlatEvents.push({
        startMs: event.range.startMs,
        endMs: event.range.endMs,
        fidelity,
        bucketType: event.bucketType,
        data: event.data
      });
    }
  }

  const unifiedMainSplinters = splinterEvents(mainFlatEvents);

  const browserWindowRanges: TimeRange[] = unifiedMainSplinters
    .filter(s => s.bucketType.toLowerCase().includes('window'))
    .filter(s =>
      isBrowserWindowEvent({
        id: -1,
        timestamp: new Date(s.startMs).toISOString(),
        duration: (s.endMs - s.startMs) / 1000,
        data: s.data
      })
    )
    .map(s => ({ startMs: s.startMs, endMs: s.endMs }));

  const clipToRanges = (range: TimeRange, parents: TimeRange[]): TimeRange[] => {
    const clipped: TimeRange[] = [];
    for (const parent of parents) {
      if (!rangesOverlap(range, parent)) continue;
      const startMs = Math.max(range.startMs, parent.startMs);
      const endMs = Math.min(range.endMs, parent.endMs);
      if (endMs > startMs) clipped.push({ startMs, endMs });
    }
    return clipped;
  };

  const selectDominantNestedForSlice = (
    slice: TimeRange,
    nestedEvents: BucketEvent[]
  ): BucketEvent | null => {
    let winner: BucketEvent | null = null;
    let maxOverlapMs = 0;
    for (const nestedEvent of nestedEvents) {
      if (!rangesOverlap(slice, nestedEvent.range)) continue;
      const overlapMs =
        Math.min(slice.endMs, nestedEvent.range.endMs) -
        Math.max(slice.startMs, nestedEvent.range.startMs);
      if (overlapMs <= 0) continue;

      if (!winner || overlapMs > maxOverlapMs) {
        winner = nestedEvent;
        maxOverlapMs = overlapMs;
      }
    }
    return winner;
  };

  let flatEvents: FlattenedEvent[] = [];
  const webEventsInsideBrowserWindows = webBucketEvents.flatMap(webEvent =>
    clipToRanges(webEvent.range, browserWindowRanges).map(range => ({
      ...webEvent,
      range
    }))
  );

  // Nested web-in-window behavior is intentionally hardcoded as metadata-only.
  // Web events can enrich browser-window slices with title/url, but never alter time ownership.
  flatEvents = unifiedMainSplinters.map(slice => {
    const isWindowSlice = slice.bucketType.toLowerCase().includes('window');
    const isBrowserWindowSlice =
      isWindowSlice &&
      isBrowserWindowEvent({
        id: -1,
        timestamp: new Date(slice.startMs).toISOString(),
        duration: (slice.endMs - slice.startMs) / 1000,
        data: slice.data
      });

    if (!isBrowserWindowSlice) {
      return {
        startMs: slice.startMs,
        endMs: slice.endMs,
        fidelity: 10,
        bucketType: slice.bucketType,
        data: slice.data
      };
    }

    const nestedWinner = selectDominantNestedForSlice(
      { startMs: slice.startMs, endMs: slice.endMs },
      webEventsInsideBrowserWindows
    );

    if (!nestedWinner) {
      return {
        startMs: slice.startMs,
        endMs: slice.endMs,
        fidelity: 10,
        bucketType: slice.bucketType,
        data: slice.data
      };
    }

    const mergedBucketType = `${slice.bucketType}+${nestedWinner.bucketType}`;
    return {
      startMs: slice.startMs,
      endMs: slice.endMs,
      fidelity: 10,
      bucketType: mergedBucketType,
      data: {
        ...slice.data,
        ...nestedWinner.data
      }
    };
  });

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

function pickLatestEvent(events: PriorCalendarEvent[]): PriorCalendarEvent | null {
  if (events.length === 0) return null;
  return events.reduce((latest, candidate) => {
    if (candidate.endMs !== latest.endMs) {
      return candidate.endMs > latest.endMs ? candidate : latest;
    }
    return candidate.startMs > latest.startMs ? candidate : latest;
  });
}

function computeOverlapMs(left: TimeRange, right: TimeRange): number {
  return Math.max(0, Math.min(left.endMs, right.endMs) - Math.max(left.startMs, right.startMs));
}

function pickBestReconstructedBlockForPriorEvent(
  blocks: DerivedAWBlock[],
  priorEvent: PriorCalendarEvent
): DerivedAWBlock | null {
  if (blocks.length === 0) return null;

  const priorRange = { startMs: priorEvent.startMs, endMs: priorEvent.endMs };

  const exactProfileMatches = blocks.filter(
    block =>
      block.profileName === priorEvent.event.subCategory &&
      block.profileColor === priorEvent.event.category
  );
  const candidates = exactProfileMatches.length > 0 ? exactProfileMatches : blocks;

  return candidates.reduce((best, candidate) => {
    const bestOverlap = computeOverlapMs(priorRange, { startMs: best.startMs, endMs: best.endMs });
    const candidateOverlap = computeOverlapMs(priorRange, {
      startMs: candidate.startMs,
      endMs: candidate.endMs
    });

    if (candidateOverlap !== bestOverlap) {
      return candidateOverlap > bestOverlap ? candidate : best;
    }

    const bestDistance = Math.abs(best.startMs - priorEvent.startMs);
    const candidateDistance = Math.abs(candidate.startMs - priorEvent.startMs);
    return candidateDistance < bestDistance ? candidate : best;
  });
}

async function hasAwEvidenceAroundAnchorTime(
  apiUrl: string,
  buckets: Record<string, AWBucket>,
  bucketIdsToFetch: Set<string>,
  anchorMs: number,
  bufferMs: number
): Promise<boolean> {
  const start = new Date(Math.max(0, anchorMs - bufferMs)).toISOString();
  const end = new Date(anchorMs + bufferMs).toISOString();

  for (const bucketId of bucketIdsToFetch) {
    const bucket = buckets[bucketId] || Object.values(buckets).find(b => b.id === bucketId);
    if (!bucket) continue;

    const isAwBucketKind =
      bucket.type === 'currentwindow' ||
      bucket.type === 'web.tab.current' ||
      bucket.type === 'afk' ||
      bucket.id.includes('window') ||
      bucket.id.includes('web') ||
      bucket.id.includes('afk');
    if (!isAwBucketKind) continue;

    try {
      const resp = await requestUrl(
        `${apiUrl}/api/0/buckets/${bucket.id}/events?start=${start}&end=${end}`
      );
      const events = resp.json as AWEvent[];

      for (const event of events) {
        if (bucket.type === 'afk' && event.data?.status === 'not-afk') continue;

        const startMs = new Date(event.timestamp).getTime();
        const endMs = startMs + event.duration * 1000;
        if (endMs <= startMs) continue;

        if (endMs >= anchorMs - bufferMs && startMs <= anchorMs + bufferMs) {
          return true;
        }
      }
    } catch {
      // Safety-first: if evidence probing fails, continuity rewrite should not run.
      return false;
    }
  }

  return false;
}

async function findContinuityCandidate(
  plugin: FullCalendarPlugin,
  settings: FullCalendarPlugin['settings']['activityWatch'],
  buckets: Record<string, AWBucket>,
  bucketIdsToFetch: Set<string>,
  profiles: NonNullable<FullCalendarPlugin['settings']['activityWatch']['profiles']>,
  knownProfileSignatures: Set<ProfileSignature>
): Promise<ContinuityCandidate | null> {
  if (settings.syncStrategy === 'custom' || settings.lastSyncTime <= 0) return null;

  const lookbackMs = computeBoundedLookbackDurationMs(profiles);
  const boundaryStart = new Date(Math.max(0, settings.lastSyncTime - lookbackMs));
  const boundaryEnd = new Date(settings.lastSyncTime + CONTINUITY_BUFFER_MS);

  const candidates = await getCalendarEventsInRange(
    plugin,
    settings.targetCalendarId,
    boundaryStart,
    boundaryEnd
  );
  const latest = pickLatestEvent(candidates);
  if (!latest) return null;

  if (!isKnownActivityWatchProfileEvent(latest, knownProfileSignatures)) return null;
  if (!normalizeContinuityTitle(latest.event.title)) return null;

  const reconstructedBlocks = await deriveActivityWatchBlocks(
    settings.apiUrl,
    buckets,
    bucketIdsToFetch,
    profiles,
    new Date(latest.startMs),
    new Date(latest.endMs)
  );
  const matchedBlock = pickBestReconstructedBlockForPriorEvent(reconstructedBlocks, latest);
  if (!matchedBlock) return null;

  const sameTitle =
    normalizeContinuityTitle(matchedBlock.title) === normalizeContinuityTitle(latest.event.title);
  if (!sameTitle) return null;

  const hasSourceEvidence = await hasAwEvidenceAroundAnchorTime(
    settings.apiUrl,
    buckets,
    bucketIdsToFetch,
    latest.startMs,
    CONTINUITY_BUFFER_MS
  );
  if (!hasSourceEvidence) return null;

  return {
    priorEvent: latest
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

function coversPriorEventRange(
  blocks: DerivedAWBlock[],
  priorEvent: PriorCalendarEvent,
  bufferMs: number
): boolean {
  if (blocks.length === 0) return false;

  const clipped = blocks
    .map(block => ({
      startMs: Math.max(block.startMs, priorEvent.startMs),
      endMs: Math.min(block.endMs, priorEvent.endMs)
    }))
    .filter(range => range.endMs > range.startMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  if (clipped.length === 0) return false;

  let coveredMs = 0;
  let currentStart = clipped[0].startMs;
  let currentEnd = clipped[0].endMs;

  for (let i = 1; i < clipped.length; i++) {
    const next = clipped[i];
    if (next.startMs <= currentEnd) {
      currentEnd = Math.max(currentEnd, next.endMs);
    } else {
      coveredMs += currentEnd - currentStart;
      currentStart = next.startMs;
      currentEnd = next.endMs;
    }
  }
  coveredMs += currentEnd - currentStart;

  const expectedMs = priorEvent.endMs - priorEvent.startMs;
  if (expectedMs <= 0) return false;

  return coveredMs >= Math.max(0, expectedMs - bufferMs);
}

async function createContinuityBlocksAndReplacePriorEvent(
  plugin: FullCalendarPlugin,
  targetCalendarId: string,
  blocks: DerivedAWBlock[],
  priorEvent: PriorCalendarEvent,
  canDeleteExistingEvent: boolean
): Promise<number> {
  const sortedBlocks = [...blocks].sort((a, b) => a.startMs - b.startMs);
  const createdBlocks: DerivedAWBlock[] = [];

  for (const block of sortedBlocks) {
    const created = await plugin.cache.addEvent(targetCalendarId, materializeBlockAsEvent(block));
    if (created) {
      createdBlocks.push(block);
    }
    await new Promise(r => setTimeout(r, 150));
  }

  if (!canDeleteExistingEvent) {
    return createdBlocks.length;
  }

  const hasSafeCoverage = coversPriorEventRange(createdBlocks, priorEvent, CONTINUITY_BUFFER_MS);
  if (!hasSafeCoverage) {
    return createdBlocks.length;
  }

  let sessionId = priorEvent.sessionId;
  if (!sessionId) {
    sessionId = recoverSessionIdForPriorEvent(plugin, targetCalendarId, priorEvent);
  }

  if (sessionId) {
    try {
      await plugin.cache.deleteEvent(sessionId, { force: true });
    } catch (err) {
      console.warn(
        'ActivityWatch sync: failed to delete prior continuity event after replacement.',
        err
      );
    }
  }

  return createdBlocks.length;
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

    const continuityCandidate = await findContinuityCandidate(
      plugin,
      settings,
      buckets,
      bucketIdsToFetch,
      profiles,
      knownProfileSignatures
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

    if (continuityCandidate && !options?.overrideStart) {
      startTime = new Date(
        Math.max(0, continuityCandidate.priorEvent.startMs - CONTINUITY_BUFFER_MS)
      );
      seedStates = [];
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
    const canDeleteExistingEvent = capabilities.canDelete;

    let addedCount = 0;
    if (continuityCandidate && !options?.overrideStart) {
      addedCount += await createContinuityBlocksAndReplacePriorEvent(
        plugin,
        settings.targetCalendarId,
        finalBlocks,
        continuityCandidate.priorEvent,
        canDeleteExistingEvent
      );
    } else {
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

export const __testing = {
  pickLatestEvent,
  pickBestReconstructedBlockForPriorEvent,
  coversPriorEventRange
};
