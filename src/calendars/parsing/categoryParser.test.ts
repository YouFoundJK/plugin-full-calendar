/**
 * @file categoryParser.test.ts
 * @brief Tests for categoryParser utility functions
 */

import { constructTitle, parseTitle, enhanceEvent } from './categoryParser';
import { OFCEvent } from '../../types';
import { FullCalendarSettings, DEFAULT_SETTINGS } from '../../types/settings';

describe('constructTitle', () => {
  it('should return just title when no category or subcategory', () => {
    const result = constructTitle(undefined, undefined, 'Meeting');
    expect(result).toBe('Meeting');
  });

  it('should return "Category - Title" when only category provided', () => {
    const result = constructTitle('Work', undefined, 'Meeting');
    expect(result).toBe('Work - Meeting');
  });

  it('should return "SubCategory - Title" when only subcategory provided', () => {
    const result = constructTitle(undefined, 'Important', 'Meeting');
    expect(result).toBe('Important - Meeting');
  });

  it('should return "Category - SubCategory - Title" when both provided', () => {
    const result = constructTitle('Work', 'Important', 'Meeting');
    expect(result).toBe('Work - Important - Meeting');
  });
});

describe('parseTitle', () => {
  it('should parse "Category - SubCategory - Title" format', () => {
    const result = parseTitle('Work - Important - Meeting');
    expect(result).toEqual({
      category: 'Work',
      subCategory: 'Important',
      title: 'Meeting'
    });
  });

  it('should parse "Category - Title" format', () => {
    const result = parseTitle('Work - Meeting');
    expect(result).toEqual({
      category: 'Work',
      subCategory: undefined,
      title: 'Meeting'
    });
  });

  it('should handle title only', () => {
    const result = parseTitle('Meeting');
    expect(result).toEqual({
      category: undefined,
      subCategory: undefined,
      title: 'Meeting'
    });
  });
});

describe('enhanceEvent', () => {
  const mockEvent: OFCEvent = {
    title: 'Work - Important - Meeting',
    type: 'single',
    date: '2024-01-01',
    endDate: null,
    allDay: true
  };

  it('should enhance event when advanced categorization is enabled', () => {
    const settings: FullCalendarSettings = {
      ...DEFAULT_SETTINGS,
      enableAdvancedCategorization: true
    };

    const result = enhanceEvent(mockEvent, settings);
    expect(result).toEqual({
      ...mockEvent,
      title: 'Meeting',
      category: 'Work',
      subCategory: 'Important'
    });
  });

  it('should not enhance event when advanced categorization is disabled', () => {
    const settings: FullCalendarSettings = {
      ...DEFAULT_SETTINGS,
      enableAdvancedCategorization: false
    };

    const result = enhanceEvent(mockEvent, settings);
    expect(result).toEqual(mockEvent);
  });
});

describe('Title Initialization Logic for EditEvent Component', () => {
  it('should show full constructed title when enableCategory is true', () => {
    const enableCategory = true;
    const initialEvent = {
      title: 'Meeting',
      category: 'Work',
      subCategory: 'Important'
    };

    // This simulates the logic from EditEvent.tsx line 144-148
    const title = enableCategory 
      ? constructTitle(initialEvent?.category, initialEvent?.subCategory, initialEvent?.title || '')
      : initialEvent?.title || '';

    expect(title).toBe('Work - Important - Meeting');
  });

  it('should show just title when enableCategory is false', () => {
    const enableCategory = false;
    const initialEvent = {
      title: 'Meeting',
      category: 'Work',
      subCategory: 'Important'
    };

    // This simulates the logic from EditEvent.tsx line 144-148
    const title = enableCategory 
      ? constructTitle(initialEvent?.category, initialEvent?.subCategory, initialEvent?.title || '')
      : initialEvent?.title || '';

    expect(title).toBe('Meeting');
  });

  it('should handle subcategory without category when enableCategory is true', () => {
    const enableCategory = true;
    const initialEvent = {
      title: 'Meeting',
      category: undefined,
      subCategory: 'Important'
    };

    // This simulates the logic from EditEvent.tsx line 144-148
    const title = enableCategory 
      ? constructTitle(initialEvent?.category, initialEvent?.subCategory, initialEvent?.title || '')
      : initialEvent?.title || '';

    expect(title).toBe('Important - Meeting');
  });
});