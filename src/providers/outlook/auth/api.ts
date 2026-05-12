import { makeAuthenticatedRequest, OutlookApiError } from './request';
import { MicrosoftAccount } from '../../../types/settings';

const CALENDAR_LIST_URL = 'https://graph.microsoft.com/v1.0/me/calendars';

export interface OutlookCalendarListEntry {
  id: string;
  name: string;
  color?: string;
  canEdit?: boolean;
  isDefaultCalendar?: boolean;
  [key: string]: unknown;
}

interface OutlookCalendarListResponse {
  value?: unknown[];
}

export async function fetchOutlookCalendarList(
  account: MicrosoftAccount
): Promise<OutlookCalendarListEntry[]> {
  if (!account.accessToken) {
    throw new OutlookApiError('Account is missing an access token.');
  }

  const data = await makeAuthenticatedRequest<OutlookCalendarListResponse>(
    account.accessToken,
    CALENDAR_LIST_URL
  );

  if (!Array.isArray(data.value)) {
    return [];
  }

  return data.value.filter(
    (item): item is OutlookCalendarListEntry =>
      !!item && typeof item === 'object' && 'id' in item && 'name' in item
  );
}
