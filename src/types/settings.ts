import { CalendarInfo } from './calendar_settings';

export interface FullCalendarSettings {
  calendarSources: CalendarInfo[];
  defaultCalendar: number;
  firstDay: number;
  initialView: {
    desktop: string;
    mobile: string;
  };
  timeFormat24h: boolean;
  dailyNotesTimezone: 'local' | 'strict';
  clickToCreateEventFromMonthView: boolean;
  displayTimezone: string | null;
  lastSystemTimezone: string | null;
  enableAdvancedCategorization: boolean;
  chrono_analyser_config: any;
  categorySettings: { name: string; color: string }[];
  googleAuth: {
    refreshToken: string | null;
    accessToken: string | null;
    expiryDate: number | null;
  } | null;
  useCustomGoogleClient: boolean;
  googleClientId: string;
  googleClientSecret: string;
}

export const DEFAULT_SETTINGS: FullCalendarSettings = {
  calendarSources: [],
  defaultCalendar: 0,
  firstDay: 0,
  initialView: {
    desktop: 'timeGridWeek',
    mobile: 'timeGrid3Days'
  },
  timeFormat24h: false,
  dailyNotesTimezone: 'local',
  clickToCreateEventFromMonthView: true,
  displayTimezone: null,
  lastSystemTimezone: null,
  enableAdvancedCategorization: false,
  chrono_analyser_config: null,
  categorySettings: [],
  googleAuth: null,
  useCustomGoogleClient: false,
  googleClientId: '',
  googleClientSecret: ''
};
