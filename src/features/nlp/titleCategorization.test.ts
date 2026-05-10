import { normalizeNLPEventTitleWithCategories } from './titleCategorization';
import type { NLPPayload } from './types';

const payloadEn: NLPPayload = {
  version: 3,
  locale: 'en',
  categoryParsing: {
    spokenDelimiterRegex: '\\s+(?:dash|hyphen)\\s+',
    spokenDelimiterFlags: 'gi',
    explicitCategoryRegex: '\\bcategory\\s+(.+)$',
    explicitCategoryFlags: 'i'
  },
  rules: []
};

describe('normalizeNLPEventTitleWithCategories', () => {
  it('normalizes spoken dash and fuzzy-resolves first segment when categorization is enabled', () => {
    const result = normalizeNLPEventTitleWithCategories('work dash seminar dash whatever', {
      enableAdvancedCategorization: true,
      categoryNames: ['Work', 'Personal'],
      payload: payloadEn
    });

    expect(result).toBe('Work - seminar - whatever');
  });

  it('supports explicit "category <name>" and prepends it to the title pipeline', () => {
    const result = normalizeNLPEventTitleWithCategories('seminar dash whatever category work', {
      enableAdvancedCategorization: true,
      categoryNames: ['Work', 'Personal'],
      payload: payloadEn
    });

    expect(result).toBe('Work - seminar - whatever');
  });

  it('keeps non-canonical category spelling when categorization is disabled', () => {
    const result = normalizeNLPEventTitleWithCategories('work dash seminar dash whatever', {
      enableAdvancedCategorization: false,
      categoryNames: ['Work'],
      payload: payloadEn
    });

    expect(result).toBe('work - seminar - whatever');
  });

  it('keeps normalized pipeline when no matching category exists', () => {
    const result = normalizeNLPEventTitleWithCategories('wrk dash seminar dash whatever', {
      enableAdvancedCategorization: true,
      categoryNames: ['Personal'],
      payload: payloadEn
    });

    expect(result).toBe('wrk - seminar - whatever');
  });
});
