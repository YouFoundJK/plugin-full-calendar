import { CATEGORY_TITLE_DELIMITER, constructTitle } from '../category/categoryParser';
import type { NLPPayload } from './types';

type NLPCategoryOptions = {
  enableAdvancedCategorization: boolean;
  categoryNames: string[];
  payload: NLPPayload;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeForCompare(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () => []);
  for (let i = 0; i <= a.length; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

function normalizeDashWords(title: string, payload: NLPPayload): string {
  const spokenDelimiterRegex = payload.categoryParsing?.spokenDelimiterRegex;
  if (!spokenDelimiterRegex) {
    return normalizeWhitespace(title);
  }

  const flags = payload.categoryParsing?.spokenDelimiterFlags ?? 'gi';
  const replaced = title.replace(new RegExp(spokenDelimiterRegex, flags), CATEGORY_TITLE_DELIMITER);
  return normalizeWhitespace(replaced);
}

function extractExplicitCategory(
  title: string,
  payload: NLPPayload,
  categoryNames: string[],
  enableAdvancedCategorization: boolean
): { strippedTitle: string; explicitCategory: string | null } {
  const explicitCategoryRegex = payload.categoryParsing?.explicitCategoryRegex;
  if (!explicitCategoryRegex) {
    return {
      strippedTitle: title,
      explicitCategory: null
    };
  }

  const flags = payload.categoryParsing?.explicitCategoryFlags ?? 'i';
  const match = new RegExp(explicitCategoryRegex, flags).exec(title);
  if (!match) {
    return {
      strippedTitle: title,
      explicitCategory: null
    };
  }

  const captured = normalizeWhitespace(match[1] ?? '');
  if (!captured) {
    return {
      strippedTitle: title,
      explicitCategory: null
    };
  }

  const words = captured.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return {
      strippedTitle: title,
      explicitCategory: null
    };
  }

  const boundaryWords = new Set([
    'at',
    'from',
    'to',
    'in',
    'on',
    'for',
    'every',
    'next',
    'today',
    'tomorrow',
    'yesterday'
  ]);

  let consumedWords = 1;
  let explicitCategory = words[0];

  if (enableAdvancedCategorization && categoryNames.length > 0) {
    let bestResolved: string | null = null;
    let bestConsumed = 0;
    const maxCandidateWords = Math.min(4, words.length);
    for (let i = 1; i <= maxCandidateWords; i += 1) {
      const candidateWords = words.slice(0, i);
      if (candidateWords.some(word => boundaryWords.has(word.toLowerCase()))) {
        break;
      }
      const candidate = candidateWords.join(' ');
      const resolved = fuzzyResolveCategory(candidate, categoryNames, {
        allowPrefixContainment: false
      });
      if (resolved) {
        bestResolved = resolved;
        bestConsumed = i;
      }
    }

    if (bestResolved && bestConsumed > 0) {
      explicitCategory = bestResolved;
      consumedWords = bestConsumed;
    }
  }

  const remainder = words.slice(consumedWords).join(' ');
  const prefix = title.slice(0, match.index);

  return {
    strippedTitle: normalizeWhitespace(`${prefix} ${remainder}`),
    explicitCategory: normalizeWhitespace(explicitCategory) || null
  };
}

function fuzzyResolveCategory(
  inputCategory: string,
  categoryNames: string[],
  options?: { allowPrefixContainment?: boolean }
): string | null {
  const normalizedInput = normalizeForCompare(inputCategory);
  if (!normalizedInput) {
    return null;
  }

  for (const category of categoryNames) {
    if (normalizeForCompare(category) === normalizedInput) {
      return category;
    }
  }

  const allowPrefixContainment = options?.allowPrefixContainment ?? true;
  if (allowPrefixContainment) {
    for (const category of categoryNames) {
      const normalizedCategory = normalizeForCompare(category);
      if (
        normalizedCategory.startsWith(normalizedInput) ||
        normalizedInput.startsWith(normalizedCategory)
      ) {
        return category;
      }
    }
  }

  let bestMatch: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const category of categoryNames) {
    const normalizedCategory = normalizeForCompare(category);
    const distance = levenshteinDistance(normalizedInput, normalizedCategory);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = category;
    }
  }

  if (!bestMatch) {
    return null;
  }

  const threshold =
    normalizedInput.length <= 5
      ? 2
      : Math.max(1, Math.floor(Math.max(normalizedInput.length, 4) * 0.34));
  return bestDistance <= threshold ? bestMatch : null;
}

export function normalizeNLPEventTitleWithCategories(
  rawTitle: string,
  options: NLPCategoryOptions
): string {
  const dashNormalizedTitle = normalizeDashWords(rawTitle, options.payload);
  const { strippedTitle, explicitCategory } = extractExplicitCategory(
    dashNormalizedTitle,
    options.payload,
    options.categoryNames,
    options.enableAdvancedCategorization
  );
  const parts = strippedTitle
    .split(CATEGORY_TITLE_DELIMITER)
    .map(part => part.trim())
    .filter(Boolean);

  const hasPipelineCategory = parts.length >= 2;
  const bodyTitle = explicitCategory
    ? parts.join(CATEGORY_TITLE_DELIMITER)
    : hasPipelineCategory
      ? parts.slice(1).join(CATEGORY_TITLE_DELIMITER)
      : '';

  if (!bodyTitle) {
    return dashNormalizedTitle;
  }

  const rawCategory = explicitCategory ?? (hasPipelineCategory ? parts[0] : '');
  if (!rawCategory) {
    return dashNormalizedTitle;
  }

  const resolvedCategory = options.enableAdvancedCategorization
    ? fuzzyResolveCategory(rawCategory, options.categoryNames)
    : null;

  return constructTitle(resolvedCategory ?? rawCategory, undefined, bodyTitle);
}
