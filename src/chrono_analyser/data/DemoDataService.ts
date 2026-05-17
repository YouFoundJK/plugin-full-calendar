import { App, requestUrl } from 'obsidian';
import { DataManager } from './DataManager';
import * as Translator from './translator';
import { InsightsConfig } from '../ui/ui';
import { OFCEvent } from '../../types';
import { StoredEvent } from '../../core/EventStore';

const DEMO_CACHE_KEY = 'ChronoAnalyzerDemoData_v1';
// CDN cached for better accessibility
const DEMO_DATA_URL = 'https://fcr-cdn.plugin-fcr.workers.dev/demo/chronoanalyzer-demo.json';

type DemoCalendarSource = {
  id: string;
  displayName: string;
  type: string;
};

type DemoEvent = {
  id: string;
  path: string;
  title: string;
  category: string;
  subCategory: string;
  startTime: string;
  endTime: string;
  dayOffset?: number;
  type?: 'single' | 'recurring';
  startRecurOffset?: number;
  endRecurOffset?: number;
  daysOfWeek?: ('U' | 'M' | 'T' | 'W' | 'R' | 'F' | 'S')[];
};

type DemoPayload = {
  schemaVersion: number;
  dateMode: 'relative';
  calendarSource: DemoCalendarSource;
  insightsConfig: InsightsConfig;
  events: DemoEvent[];
};

export interface DemoLoadResult {
  insightsConfig: InsightsConfig;
  recordCount: number;
  fromCache: boolean;
}

export class DemoDataService {
  constructor(
    private app: App,
    private dataManager: DataManager,
    private demoDataUrl = DEMO_DATA_URL
  ) {}

  public static hasConfiguredInsights(config: InsightsConfig | null | undefined): boolean {
    return Boolean(config && Object.keys(config.insightGroups || {}).length > 0);
  }

  public async loadDemoData(): Promise<DemoLoadResult> {
    const { rawPayload, fromCache } = await this.loadPayloadText();
    const payload = this.parsePayload(rawPayload);

    this.dataManager.clear();
    let recordCount = 0;

    for (const demoEvent of payload.events) {
      const storedEvent = this.toStoredEvent(demoEvent, payload.calendarSource);
      const timeRecord = Translator.storedEventToTimeRecord(
        storedEvent,
        true,
        payload.calendarSource.displayName
      );

      if (timeRecord) {
        this.dataManager.addRecord(timeRecord);
        recordCount += 1;
      }
    }

    this.dataManager.finalize();
    return {
      insightsConfig: payload.insightsConfig,
      recordCount,
      fromCache
    };
  }

  private async loadPayloadText(): Promise<{ rawPayload: string; fromCache: boolean }> {
    const cachedPayload = (this.app.loadLocalStorage as (key: string) => unknown)(DEMO_CACHE_KEY);
    if (typeof cachedPayload === 'string' && cachedPayload.trim()) {
      return { rawPayload: cachedPayload, fromCache: true };
    }

    const response = await requestUrl(this.demoDataUrl);
    const rawPayload = response.text;
    this.parsePayload(rawPayload);
    this.app.saveLocalStorage(DEMO_CACHE_KEY, rawPayload);
    return { rawPayload, fromCache: false };
  }

  private parsePayload(rawPayload: string): DemoPayload {
    const parsed = JSON.parse(rawPayload) as Partial<DemoPayload>;
    if (
      parsed.schemaVersion !== 1 ||
      parsed.dateMode !== 'relative' ||
      !parsed.calendarSource ||
      !parsed.insightsConfig ||
      !Array.isArray(parsed.events)
    ) {
      throw new Error('Invalid ChronoAnalyser demo payload.');
    }

    return parsed as DemoPayload;
  }

  private toStoredEvent(demoEvent: DemoEvent, calendarSource: DemoCalendarSource): StoredEvent {
    const baseEvent = {
      title: demoEvent.title,
      id: demoEvent.id,
      category: demoEvent.category,
      subCategory: demoEvent.subCategory,
      allDay: false as const,
      startTime: demoEvent.startTime,
      endTime: demoEvent.endTime
    };

    const event: OFCEvent =
      demoEvent.type === 'recurring'
        ? {
            ...baseEvent,
            type: 'recurring',
            daysOfWeek: demoEvent.daysOfWeek || ['M'],
            startRecur: this.isoDateFromOffset(demoEvent.startRecurOffset ?? -30),
            endRecur: this.isoDateFromOffset(demoEvent.endRecurOffset ?? 30),
            endDate: null,
            skipDates: []
          }
        : {
            ...baseEvent,
            type: 'single',
            date: this.isoDateFromOffset(demoEvent.dayOffset ?? 0),
            endDate: this.isoDateFromOffset(demoEvent.dayOffset ?? 0)
          };

    return {
      id: demoEvent.id,
      calendarId: calendarSource.id,
      location: {
        path: demoEvent.path,
        lineNumber: undefined
      },
      event
    };
  }

  private isoDateFromOffset(offsetDays: number): string {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offsetDays);
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }
}
