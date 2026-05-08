import { EventApi } from '@fullcalendar/core';
import { PluginState } from '../../core/PluginState';
import { ViewContext } from './ViewContext';

export class ViewSearchHandler {
  public eventSearchQuery = '';
  private eventSearchHaystacks = new Map<string, string>();
  private eventSearchWordsById = new Map<string, string[]>();
  private eventDisplayById = new Map<string, string>();
  private pendingSearchApplyFrame: number | null = null;

  constructor(private ctx: ViewContext) {}

  public clearCaches(): void {
    this.eventSearchHaystacks.clear();
    this.eventSearchWordsById.clear();
    this.eventDisplayById.clear();
  }

  public scheduleApplyFilter(): void {
    if (this.pendingSearchApplyFrame !== null) {
      cancelAnimationFrame(this.pendingSearchApplyFrame);
    }

    this.pendingSearchApplyFrame = requestAnimationFrame(() => {
      this.pendingSearchApplyFrame = null;
      this.applyEventSearchFilter();
    });
  }

  public applyEventSearchFilter(): void {
    const fullCalendarView = this.ctx.fullCalendarView;
    if (!fullCalendarView) {
      return;
    }

    const tokens = this.tokenizeSearchQuery(this.eventSearchQuery);
    const events = fullCalendarView.getEvents();
    if (events.length === 0) {
      return;
    }

    const visibilityById = new Map<string, boolean>();

    if (tokens.length === 0) {
      events.forEach(event => {
        visibilityById.set(event.id, true);
      });
    } else {
      for (const event of events) {
        if (event.extendedProps.isShadow) {
          continue;
        }

        const haystack = this.getEventSearchHaystack(event.id);
        const words = this.getEventSearchWords(event.id, haystack);
        const isMatch = tokens.every(token => this.fuzzyTokenMatch(haystack, words, token));
        visibilityById.set(event.id, isMatch);
      }
    }

    fullCalendarView.batchRendering(() => {
      for (const event of events) {
        if (event.extendedProps.isShadow) {
          const originalId = event.extendedProps.originalEventId as string | undefined;
          const isVisible = originalId ? (visibilityById.get(originalId) ?? true) : true;
          this.setEventVisibility(event, isVisible);
          continue;
        }

        this.setEventVisibility(event, visibilityById.get(event.id) ?? true);
      }
    });
  }

  private tokenizeSearchQuery(query: string): string[] {
    return query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  }

  private fuzzyTokenMatch(haystack: string, words: string[], token: string): boolean {
    if (!token) return true;
    if (haystack.includes(token)) return true;
    if (token.length < 4) return false;

    for (const word of words) {
      if (word.length < 3) continue;
      if (this.isEditDistanceAtMostOne(token, word)) return true;
    }
    return false;
  }

  private isEditDistanceAtMostOne(a: string, b: string): boolean {
    if (a === b) return true;
    const aLen = a.length;
    const bLen = b.length;
    const lengthDiff = Math.abs(aLen - bLen);
    if (lengthDiff > 1) return false;

    if (aLen === bLen) {
      let mismatches = 0;
      for (let i = 0; i < aLen; i++) {
        if (a[i] !== b[i]) {
          mismatches += 1;
          if (mismatches > 1) return false;
        }
      }
      return true;
    }

    const longer = aLen > bLen ? a : b;
    const shorter = aLen > bLen ? b : a;
    let longIndex = 0;
    let shortIndex = 0;
    let edits = 0;

    while (longIndex < longer.length && shortIndex < shorter.length) {
      if (longer[longIndex] === shorter[shortIndex]) {
        longIndex += 1;
        shortIndex += 1;
        continue;
      }
      edits += 1;
      if (edits > 1) return false;
      longIndex += 1;
    }
    return true;
  }

  private getEventSearchHaystack(eventId: string): string {
    const cached = this.eventSearchHaystacks.get(eventId);
    if (cached !== undefined) return cached;

    const details = PluginState.getCache().store.getEventDetails(eventId);
    const title = details?.event.title || '';
    const category = details?.event.category || '';
    const subCategory = details?.event.subCategory || '';
    const description = details?.event.description || '';
    const location = details?.location?.path || '';

    const haystack = `${title} ${category} ${subCategory} ${description} ${location}`.toLowerCase();
    this.eventSearchHaystacks.set(eventId, haystack);
    return haystack;
  }

  private getEventSearchWords(eventId: string, haystack: string): string[] {
    const cached = this.eventSearchWordsById.get(eventId);
    if (cached !== undefined) return cached;

    const words = haystack.match(/[a-z0-9]+/g) || [];
    this.eventSearchWordsById.set(eventId, words);
    return words;
  }

  private setEventVisibility(event: EventApi, shouldShow: boolean): void {
    if (!this.eventDisplayById.has(event.id)) {
      this.eventDisplayById.set(event.id, event.display || 'auto');
    }

    if (!shouldShow) {
      if (event.display !== 'none') {
        event.setProp('display', 'none');
      }
      return;
    }

    const originalDisplay = this.eventDisplayById.get(event.id) || 'auto';
    if (event.display !== originalDisplay) {
      event.setProp(
        'display',
        originalDisplay as 'auto' | 'background' | 'inverse-background' | 'block' | 'list-item'
      );
    }
  }

  public onunload(): void {
    if (this.pendingSearchApplyFrame !== null) {
      cancelAnimationFrame(this.pendingSearchApplyFrame);
      this.pendingSearchApplyFrame = null;
    }
    this.clearCaches();
  }
}
