/**
 * @file smartCalendar.ts
 * @brief Pure-function smart calendar resolution from title text.
 *
 * @description
 * Scans the remaining event title for a trailing `in <calendar_name>` pattern
 * and resolves it against actual configured calendar names (case-insensitive).
 * This is a pure function with zero Obsidian dependencies, making it testable
 * and usable from both the dispatcher and the live preview modal.
 *
 * @license See LICENSE.md
 */

import type { NLPActionObject } from './types';

/**
 * Smart calendar resolution: scans the remaining title for a trailing
 * `in <calendar_name>` pattern and resolves it against actual configured
 * calendars (case-insensitive). If matched, strips the `in <name>` suffix
 * from the title and sets the target calendar.
 *
 * This allows users to type `Meeting in daily1` without the word "calendar".
 * If "daily1" is not a configured calendar name, the title stays unchanged.
 *
 * @param action - The NLP action object from the engine
 * @param calendarNames - List of writable calendar names to match against
 * @returns A new action object with resolved calendar (or original if no match)
 */
export function resolveSmartCalendar(
  action: NLPActionObject,
  calendarNames: string[]
): NLPActionObject {
  // Skip if already resolved by the explicit "in <name> calendar" rule
  if (action.targetCalendar || action.intent !== 'CREATE_EVENT') {
    return action;
  }

  const title = action.title;
  if (!title) {
    return action;
  }

  const normalizedNames = calendarNames.map(n => n.toLowerCase().trim());

  // Search for the last " in <name>" where <name> matches a calendar
  const inPattern = /\s+in\s+/gi;
  let bestMatch: { index: number; name: string } | null = null;
  let match: RegExpExecArray | null;

  while ((match = inPattern.exec(title)) !== null) {
    const suffix = title.substring(match.index + match[0].length).trim();
    const suffixLower = suffix.toLowerCase();
    const nameIndex = normalizedNames.indexOf(suffixLower);
    if (nameIndex !== -1) {
      bestMatch = { index: match.index, name: calendarNames[nameIndex] };
    }
  }

  if (bestMatch) {
    return {
      ...action,
      title: title.substring(0, bestMatch.index).trim(),
      targetCalendar: bestMatch.name,
      matchedRules: [...action.matchedRules, 'smart_calendar']
    };
  }

  return action;
}
