import { reactive, ref, type Ref } from 'vue';
import type { Delivery, Health, MailboxRow, Me, Platform, PlatformUser, TeamThread, TeamThreadDetail } from './types';

export class SignedOutError extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/${path}`, { ...init, headers: { 'content-type': 'application/json' } });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  // Access session ended: a reload sends the browser back through the Access login.
  if (res.status === 401) throw new SignedOutError('Your sign-in ended. Reload to sign in again.');
  if (!res.ok) throw new Error(body.error ?? `The request failed (${res.status}). Try again.`);
  return body as T;
}

export const api = {
  me: () => call<Me>('me'),
  health: () => call<Health>('health'),
  delivery: () => call<Delivery>('delivery'),
  mailboxes: () => call<MailboxRow[]>('mailboxes'),
  platform: () => call<Platform>('platform'),
  users: () => call<PlatformUser[]>('users'),
  threads: () => call<TeamThread[]>('threads'),
  thread: (id: string) => call<TeamThreadDetail>(`threads/${id}`),
  done: (id: string, done: boolean) => call<TeamThread>(`threads/${id}/done`, { method: 'POST', body: JSON.stringify({ done }) }),
  reply: (id: string, text: string) => call<{ messageId: string }>(`threads/${id}/reply`, { method: 'POST', body: JSON.stringify({ text }) }),
};

/** Shell state every page reads: who is signed in, which environment, and the inbox count. */
export const shell = reactive({ me: null as Me | null, needsReply: 0 });

/** Loads once on mount; `load()` reloads. */
export function useLoad<T>(fn: () => Promise<T>): { data: Ref<T | null>; error: Ref<string | null>; signedOut: Ref<boolean>; loading: Ref<boolean>; load: () => Promise<void> } {
  const data = ref(null) as Ref<T | null>;
  const error = ref<string | null>(null);
  const signedOut = ref(false);
  const loading = ref(false);
  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      data.value = await fn();
    } catch (err) {
      signedOut.value = err instanceof SignedOutError;
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }
  void load();
  return { data, error, signedOut, loading, load };
}

// ---------------------------------------------------------------------------
// Toast with an optional Undo (one at a time, like Superhuman).

export const toast = reactive({ text: '', undo: null as null | (() => void), on: false, ms: 5000, key: 0 });
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(text: string, undo: (() => void) | null = null, ms = 5000): void {
  clearTimeout(toastTimer);
  Object.assign(toast, { text, undo, on: true, ms, key: toast.key + 1 });
  toastTimer = setTimeout(() => Object.assign(toast, { on: false, undo: null }), ms);
}
export function runUndo(): void {
  clearTimeout(toastTimer);
  toast.undo?.();
  Object.assign(toast, { on: false, undo: null });
}

// ---------------------------------------------------------------------------
// Drafts survive opening another thread or a reload (this tab only).

const DRAFT_KEY = 'admin-drafts';
const drafts: Record<string, string> = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? '{}') as Record<string, string>;
export function getDraft(id: string): string {
  return drafts[id] ?? '';
}
export function setDraft(id: string, text: string): void {
  if (text) drafts[id] = text;
  else delete drafts[id];
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
}

// ---------------------------------------------------------------------------
// Formatting

const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const dayTime = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

export function ago(iso: string | null): string {
  if (!iso) return 'Never';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  if (m < 24 * 60) return `${Math.round(m / 60)} h ago`;
  return day.format(new Date(iso));
}
export const fmtDay = (iso: string) => day.format(new Date(iso));
export const fmtDayTime = (iso: string) => dayTime.format(new Date(iso));
export const fmtClock = (iso: string) => clock.format(new Date(iso));
export function pct(part: number, whole: number, dp = 1): string {
  if (!whole) return '—';
  return `${((part / whole) * 100).toFixed(dp).replace(/\.0+$/, '')}%`;
}

/** "joel@appyl.ai" → "Joel": how a team reply is signed in the thread. */
export function teamName(email: string | null): string {
  const local = email?.split('@')[0] ?? 'Appyl';
  return local.charAt(0).toUpperCase() + local.slice(1).split(/[._-]/)[0]!;
}
