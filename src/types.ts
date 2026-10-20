// API shapes shared by the Worker and the app. Timestamps are ISO strings. Counts cover the last 30 days.

export type Backend = 'prod' | 'dev';

export interface Me {
  email: string;
  /** Which database this deployment reads: prod (admin.appyl.ai) or dev (dev.admin.appyl.ai, localhost). */
  backend: Backend;
}

/** Email users sent from their Appyl mailboxes. */
export interface UserMail {
  sent: number;
  delivered: number;
  bounced: number;
  complaints: number;
  delayed: number;
}

/** Appyl's own emails (letters, summaries, alerts): known only from delivery events, so the base is "settled". */
export interface AppylMail {
  settled: number;
  delivered: number;
  bounced: number;
  failed: number;
  complaints: number;
  delayed: number;
}

export interface Health {
  users: UserMail;
  appyl: AppylMail;
  needsReply: number;
  asOf: string;
}

export interface DeliveryDay {
  day: string;
  /** True for Appyl's own emails, false for mail users sent. */
  appyl: boolean;
  delivered: number;
  /** Bounced, failed or rejected. */
  bad: number;
}

export interface DeliveryProblem {
  occurredAt: string;
  type: string;
  recipient: string | null;
  smtpCode: string | null;
  detail: string | null;
  /** The user's address that sent it; null for Appyl's own emails. */
  fromAddress: string | null;
}

export interface Delivery extends Health {
  days: DeliveryDay[];
  problems: DeliveryProblem[];
}

export interface MailboxRow {
  id: string;
  address: string;
  status: string;
  pausedReason: string | null;
  verifiedAt: string | null;
  createdAt: string;
  ownerEmail: string | null;
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  opened: number;
  clicked: number;
  received: number;
  lastAt: string | null;
}

export interface TeamThread {
  id: string;
  mailbox: string;
  subject: string;
  counterpartAddress: string;
  counterpartName: string | null;
  snippet: string;
  unreadCount: number;
  messageCount: number;
  lastDirection: 'inbound' | 'outbound';
  lastMessageAt: string;
  teamDoneAt: string | null;
  /** Who answered last, when the last message is ours (Access email). */
  lastSentBy: string | null;
  /** The sender has an Appyl account with this email. */
  userName: string | null;
  userSince: string | null;
}

export interface TeamMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  fromAddress: string;
  fromName: string | null;
  text: string;
  status: string;
  sentBy: string | null;
  at: string;
}

export interface TeamThreadDetail {
  thread: TeamThread;
  messages: TeamMessage[];
}

/** Waiting on us: their message is last and nobody marked it done. */
export function needsReply(t: Pick<TeamThread, 'lastDirection' | 'teamDoneAt'>): boolean {
  return t.lastDirection === 'inbound' && !t.teamDoneAt;
}

export const LIMIT_BOUNCE = 0.05;
export const LIMIT_COMPLAINT = 0.001;

export const STAGES = ['saved', 'preparing', 'applied', 'interviewing', 'offer', 'rejected', 'ghosted', 'withdrawn'] as const;
export type Stage = (typeof STAGES)[number];

/** Whole-platform numbers for the Platform dashboard (all time unless named). */
export interface Platform {
  users: { total: number; admitted: number; onboarded: number; newThisWeek: number; withResumeSource: number };
  matches: { usersWithMatches: number; usersWithExcellent: number; excellent: number; good: number; borderline: number };
  /** Live (not archived) applications per stage, and how many people have one there. */
  stages: Array<{ stage: Stage; applications: number; people: number }>;
  documents: { resumesFinalized: number; coverLetters: number; interviewPrepSessions: number };
  /** New accounts per week, oldest first (12 weeks). */
  signups: Array<{ week: string; n: number }>;
  asOf: string;
}

/** One person on the Users page. */
export interface PlatformUser {
  id: string;
  email: string;
  name: string | null;
  joinedAt: string;
  admitted: boolean;
  onboarded: boolean;
  excellent: number | null;
  good: number | null;
  /** Live applications per stage (stages with none are left out). */
  stages: Partial<Record<Stage, number>>;
  resumes: number;
  coverLetters: number;
  lastActiveAt: string;
}
