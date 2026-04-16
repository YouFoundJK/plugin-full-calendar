import FullCalendarPlugin from '../../main';
import { OFCEvent } from '../../types';
import { moment as obsidianMoment } from 'obsidian';
import { DerivedAWBlock, PriorCalendarEvent, ProfileSignature, TimeRange } from './sync-types';

const moment = obsidianMoment as unknown as typeof import('moment');

export const CONTINUITY_BUFFER_MS = 60 * 1000;
export const LOOKBACK_SAFETY_BUFFER_MINS = 5;
export const MIN_SYNC_LOOKBACK_MINS = 30;
export const MAX_SYNC_LOOKBACK_MINS = 6 * 60;

export function parseTimedSingleEventRange(
  event: OFCEvent
): { startMs: number; endMs: number } | null {
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

export function computeLookbackDurationMs(
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

export function pickLatestEvent(events: PriorCalendarEvent[]): PriorCalendarEvent | null {
  if (events.length === 0) return null;
  return events.reduce((latest, candidate) => {
    if (candidate.endMs !== latest.endMs) {
      return candidate.endMs > latest.endMs ? candidate : latest;
    }
    return candidate.startMs > latest.startMs ? candidate : latest;
  });
}

export function computeOverlapMs(left: TimeRange, right: TimeRange): number {
  return Math.max(0, Math.min(left.endMs, right.endMs) - Math.max(left.startMs, right.startMs));
}

export function pickBestReconstructedBlockForPriorEvent(
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

export function computeBoundedLookbackDurationMs(
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

export function isSameProfileBlock(existing: PriorCalendarEvent, block: DerivedAWBlock): boolean {
  return (
    existing.event.subCategory === block.profileName &&
    existing.event.category === block.profileColor
  );
}

export function getProfileSignature(
  profileName: string | null | undefined,
  profileColor: string | null | undefined
): ProfileSignature {
  return `${profileName || ''}::${profileColor || ''}`;
}

export function normalizeContinuityTitle(title: string | null | undefined): string {
  return (title || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function isSameContinuityBlock(
  existing: PriorCalendarEvent,
  block: DerivedAWBlock
): boolean {
  return (
    isSameProfileBlock(existing, block) &&
    normalizeContinuityTitle(existing.event.title) === normalizeContinuityTitle(block.title)
  );
}

export function isKnownActivityWatchProfileEvent(
  existing: PriorCalendarEvent,
  knownProfileSignatures: Set<ProfileSignature>
): boolean {
  return knownProfileSignatures.has(
    getProfileSignature(existing.event.subCategory || '', existing.event.category || '')
  );
}

export async function getCalendarEventsInRange(
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

export async function extendEventEndIfNeeded(
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

export function findSwallowingExistingEvent(
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

export function findExtendableExistingEvent(
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

export function findReplaceableExistingEvents(
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

export function recoverSessionIdFromStore(
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

export function recoverSessionIdForPriorEvent(
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

export function materializeBlockAsEvent(block: DerivedAWBlock): OFCEvent {
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

export function coversPriorEventRange(
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
