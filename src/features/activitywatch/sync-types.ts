import { OFCEvent } from '../../types';
import { AWEvent } from './api';

export type DerivedAWBlock = {
  startMs: number;
  endMs: number;
  title: string;
  profileColor: string;
  profileName: string;
};

export type PriorCalendarEvent = {
  sessionId: string | null;
  event: OFCEvent;
  startMs: number;
  endMs: number;
};

export type ProfileSignature = string;

export type ContinuityCandidate = {
  priorEvent: PriorCalendarEvent;
};

export type TimeRange = {
  startMs: number;
  endMs: number;
};

export type BucketKinds = {
  isWeb: boolean;
  isAfk: boolean;
  isWindow: boolean;
};

export type BucketEvent = {
  range: TimeRange;
  data: AWEvent['data'];
  bucketType: string;
  kinds: BucketKinds;
};

export interface SyncOptions {
  overrideStart?: Date;
  overrideEnd?: Date;
  suppressNotices?: boolean;
}
