import FullCalendarPlugin from '../../main';
import { AWBucket } from './api';
import {
  DerivedAWBlock,
  PriorCalendarEvent,
  ProfileSignature,
  ContinuityCandidate
} from './sync-types';
import { SeedState } from './fsm';
import {
  CONTINUITY_BUFFER_MS,
  computeBoundedLookbackDurationMs,
  getCalendarEventsInRange,
  pickLatestEvent,
  isKnownActivityWatchProfileEvent,
  normalizeContinuityTitle,
  parseTimedSingleEventRange,
  getProfileSignature,
  recoverSessionIdForPriorEvent,
  recoverSessionIdFromStore,
  coversPriorEventRange,
  materializeBlockAsEvent,
  findSwallowingExistingEvent,
  findExtendableExistingEvent,
  findReplaceableExistingEvents,
  extendEventEndIfNeeded,
  pickBestReconstructedBlockForPriorEvent
} from './sync-utils';

import { deriveActivityWatchBlocks, hasAwEvidenceAroundAnchorTime } from './sync-derive';

export function findBoundaryOverlappingActivityWatchEvent(
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

export async function findContinuityCandidate(
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

export function buildSeedStateFromBoundaryEvent(
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

export async function createContinuityBlocksAndReplacePriorEvent(
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

export async function createOrUpdateBlock(
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
