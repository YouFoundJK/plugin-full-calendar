import FullCalendarPlugin from '../../main';
import { requestUrl } from 'obsidian';
import { AWBucket, AWEvent } from './api';
import { executeFSM, FinalBlock, FlattenedEvent, SeedState, splinterEvents } from './fsm';
import { DerivedAWBlock, TimeRange, BucketEvent, BucketKinds } from './sync-types';

export const COMMON_BROWSER_APP_PATTERN =
  /(firefox|chrome|chromium|edge|brave|opera|vivaldi|arc|safari|librewolf|waterfox|floorp|zen|whale|tor)/i;

export function deriveOutputTitle(block: FinalBlock): string {
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

export async function deriveActivityWatchBlocks(
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

  const sortedWebEvents = [...webBucketEvents].sort((a, b) => a.range.startMs - b.range.startMs);
  let webIndex = 0;

  // Nested web-in-window behavior is intentionally hardcoded as metadata-only.
  // Web events can enrich browser-window slices with title/url, but never alter time ownership.
  const flatEvents: FlattenedEvent[] = unifiedMainSplinters.map(slice => {
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

    // Advance webIndex so we drop web events that strictly end before our slice begins
    while (
      webIndex < sortedWebEvents.length &&
      sortedWebEvents[webIndex].range.endMs <= slice.startMs
    ) {
      webIndex++;
    }

    let nestedWinner: BucketEvent | null = null;
    let maxOverlapMs = 0;

    // Scan forward over overlapping nested events
    for (let i = webIndex; i < sortedWebEvents.length; i++) {
      const nestedEvent = sortedWebEvents[i];
      if (nestedEvent.range.startMs >= slice.endMs) break;

      const overlapMs =
        Math.min(slice.endMs, nestedEvent.range.endMs) -
        Math.max(slice.startMs, nestedEvent.range.startMs);
      if (overlapMs > maxOverlapMs) {
        maxOverlapMs = overlapMs;
        nestedWinner = nestedEvent;
      }
    }

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

export async function hasAwEvidenceAroundAnchorTime(
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
