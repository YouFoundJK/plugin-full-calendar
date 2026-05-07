export type NLPIntent =
  | 'CREATE_EVENT'
  | 'NAVIGATE_DAY'
  | 'NAVIGATE_WEEK'
  | 'NAVIGATE_MONTH'
  | 'OPEN_CALENDAR'
  | 'OPEN_SIDEBAR';

export type NLPSupportedLanguage = 'en' | 'de' | 'fr' | 'it' | 'es';

export type NLPRecurrence = {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  byDay?: string[];
};

export type NLPActionObject = {
  intent: NLPIntent;
  title: string;
  date: string;
  hours: number;
  minutes: number;
  targetCalendar: string | null;
  recurrence: NLPRecurrence | null;
  matchedRules: string[];
};

export type NLPRule = {
  name: string;
  regex: string;
  flags?: string;
  actions: string[];
};

export type NLPPayload = {
  version: number;
  locale: NLPSupportedLanguage;
  rules: NLPRule[];
};

export type NLPExecutionContext = {
  date: Date;
  intent: NLPIntent;
  targetCalendar: string | null;
  recurrence: NLPRecurrence | null;
  matchedRules: string[];
  strippedTitle: string;
  shortCircuit: boolean;
};
