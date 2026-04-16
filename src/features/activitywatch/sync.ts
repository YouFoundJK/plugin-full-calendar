import FullCalendarPlugin from '../../main';
import { Notice, requestUrl } from 'obsidian';
import { t } from '../i18n/i18n';
import { AWBucket } from './api';
import { SeedState } from './fsm';
import { PriorCalendarEvent, ProfileSignature, SyncOptions } from './sync-types';
import {
  CONTINUITY_BUFFER_MS,
  getProfileSignature,
  getCalendarEventsInRange,
  computeBoundedLookbackDurationMs,
  pickLatestEvent,
  pickBestReconstructedBlockForPriorEvent,
  coversPriorEventRange,
  buildSessionIndex
} from './sync-utils';
import { deriveActivityWatchBlocks } from './sync-derive';
import {
  findContinuityCandidate,
  findBoundaryOverlappingActivityWatchEvent,
  buildSeedStateFromBoundaryEvent,
  createContinuityBlocksAndReplacePriorEvent,
  createOrUpdateBlock
} from './sync-continuity';

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

    const sessionIndex = buildSessionIndex(
      plugin,
      settings.targetCalendarId,
      knownProfileSignatures
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
      const boundaryEvent = findBoundaryOverlappingActivityWatchEvent(sessionIndex, boundaryMs);
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
        sessionIndex,
        finalBlocks,
        continuityCandidate.priorEvent,
        canDeleteExistingEvent
      );
    } else {
      const sortedFinalBlocks = [...finalBlocks].sort((a, b) => a.startMs - b.startMs);
      let lastYieldTime = Date.now();

      for (const block of sortedFinalBlocks) {
        const action = await createOrUpdateBlock(
          plugin,
          settings.targetCalendarId,
          sessionIndex,
          block,
          existingOverlapEvents,
          canExtendExistingEvents,
          canReplaceExistingEvents,
          knownProfileSignatures
        );
        if (action === 'created') {
          addedCount++;
        }

        if (Date.now() - lastYieldTime > 16) {
          await new Promise(r => setTimeout(r, 0));
          lastYieldTime = Date.now();
        }
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
