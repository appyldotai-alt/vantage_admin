<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ago, api, fmtDayTime, getDraft, setDraft, shell, showToast, teamName, useLoad } from '../api';
import { needsReply, type Health, type TeamThread, type TeamThreadDetail } from '../types';
import LoadState from '../components/LoadState.vue';
import VerdictLine from '../components/VerdictLine.vue';

const route = useRoute();
const router = useRouter();
const threads = useLoad(api.threads);
const health = ref<Health | null>(null);
void api.health().then((h) => (health.value = h)).catch(() => undefined);

type Tab = 'needs' | 'done' | 'all';
const tab = ref<Tab>('needs');
const openId = computed(() => (typeof route.params.id === 'string' ? route.params.id : null));
const all = computed(() => threads.data.value ?? []);
const counts = computed(() => ({ needs: all.value.filter(needsReply).length, done: all.value.filter((t) => !needsReply(t)).length }));
const visible = computed(() => all.value.filter((t) => tab.value === 'all' || (tab.value === 'needs') === needsReply(t)));
watch(() => counts.value.needs, (n) => (shell.needsReply = n));

const detail = ref<TeamThreadDetail | null>(null);
const detailError = ref<string | null>(null);
const reply = ref('');
const replyBox = ref<HTMLTextAreaElement | null>(null);

const who = (t: Pick<TeamThread, 'userName' | 'counterpartName' | 'counterpartAddress'>) => t.userName ?? t.counterpartName ?? t.counterpartAddress;
const shortBox = (address: string) => address.replace(/\.appyl\.ai$/, '');
const original = (subject: string) => subject.replace(/^(re|fwd?):\s*/i, '');
function rowMeta(t: TeamThread): string {
  const parts = [shortBox(t.mailbox), t.userSince ? 'Appyl user' : null];
  if (t.lastDirection === 'outbound') parts.push(`Answered by ${teamName(t.lastSentBy)}`);
  else if (t.teamDoneAt) parts.push('Done');
  return parts.filter(Boolean).join(' · ');
}

async function openThread(id: string | null): Promise<void> {
  detailError.value = null;
  if (!id) {
    detail.value = null;
    return;
  }
  reply.value = getDraft(id);
  if (detail.value?.thread.id !== id) detail.value = null;
  try {
    detail.value = await api.thread(id);
    const row = all.value.find((t) => t.id === id);
    if (row) row.unreadCount = 0;
  } catch (err) {
    detailError.value = (err as Error).message;
  }
}
watch(openId, openThread, { immediate: true });
watch(reply, (text) => openId.value && setDraft(openId.value, text));

function go(id: string | null): void {
  void router.push(id ? `/inbox/${id}` : '/');
}
function move(step: number): void {
  const rows = visible.value;
  if (!rows.length) return;
  const i = rows.findIndex((t) => t.id === openId.value);
  const next = rows[Math.max(0, Math.min(rows.length - 1, i === -1 ? 0 : i + step))]!;
  go(next.id);
  void nextTick(() => document.querySelector(`[data-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' }));
}

async function toggleDone(): Promise<void> {
  const t = detail.value?.thread;
  if (!t) return;
  const done = !t.teamDoneAt;
  try {
    const row = await api.done(t.id, done);
    patch(row);
    showToast(done ? 'Marked done' : 'Moved back to Needs reply', async () => patch(await api.done(t.id, !done)));
  } catch (err) {
    showToast((err as Error).message);
  }
}
function patch(row: TeamThread): void {
  const i = all.value.findIndex((t) => t.id === row.id);
  if (i !== -1) all.value.splice(i, 1, { ...row, unreadCount: 0 });
  if (detail.value?.thread.id === row.id) detail.value = { ...detail.value, thread: { ...row, unreadCount: 0 } };
}

// Sending waits 5 seconds so Undo can take it back; only then is the email handed to Cloudflare.
const UNDO_MS = 5000;
const pending = new Map<string, ReturnType<typeof setTimeout>>();
const sending = ref(false);
function send(): void {
  const t = detail.value?.thread;
  const text = reply.value.trim();
  if (!t || !text || pending.has(t.id)) return;
  const temp = { id: `pending-${Date.now()}`, direction: 'outbound' as const, fromAddress: t.mailbox, fromName: 'Appyl', text, status: 'sending', sentBy: shell.me?.email ?? null, at: new Date().toISOString() };
  detail.value!.messages.push(temp);
  reply.value = '';
  setDraft(t.id, '');
  const timer = setTimeout(async () => {
    pending.delete(t.id);
    sending.value = true;
    try {
      await api.reply(t.id, text);
      const fresh = await api.threads();
      threads.data.value = fresh;
      if (openId.value === t.id) detail.value = await api.thread(t.id);
    } catch (err) {
      showToast(`Not sent: ${(err as Error).message}`);
      if (openId.value === t.id && detail.value) {
        detail.value.messages = detail.value.messages.filter((m) => m.id !== temp.id);
        reply.value = text;
      }
    } finally {
      sending.value = false;
    }
  }, UNDO_MS);
  pending.set(t.id, timer);
  showToast(`Reply to ${who(t)} sends in 5 seconds`, () => {
    clearTimeout(timer);
    pending.delete(t.id);
    if (detail.value?.thread.id === t.id) detail.value.messages = detail.value.messages.filter((m) => m.id !== temp.id);
    if (openId.value === t.id) reply.value = text;
    setDraft(t.id, text);
    void nextTick(() => replyBox.value?.focus());
  }, UNDO_MS);
}
function warnPending(e: BeforeUnloadEvent): void {
  if (pending.size) e.preventDefault();
}

function onKey(e: KeyboardEvent): void {
  const target = e.target as HTMLElement;
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && target === replyBox.value) {
    e.preventDefault();
    send();
    return;
  }
  const typing = target.matches('textarea, input');
  if (e.key === 'Escape' && typing) {
    target.blur();
    return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.sheet-bg')) return;
  if (e.key === 'Escape' && openId.value) go(null);
  else if (e.key === 'j') move(1);
  else if (e.key === 'k') move(-1);
  else if (e.key === 'Enter' && !openId.value) move(0);
  else if (e.key === 'e' && openId.value) void toggleDone();
  else if (e.key === 'r' && openId.value) {
    e.preventDefault();
    replyBox.value?.focus();
  }
}
onMounted(() => {
  document.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', warnPending);
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey);
  window.removeEventListener('beforeunload', warnPending);
});

const isDev = computed(() => shell.me?.backend === 'dev');
const statusLabel = (s: string) => ({ sending: 'Sending…', sent: 'Sent', delivered: 'Delivered', bounced: 'Bounced', deferred: 'Delayed', failed: 'Failed', complained: 'Marked as spam' })[s] ?? s;
</script>

<template>
  <section class="view is-active inbox" :class="{ 'is-reading': openId }" aria-labelledby="h-inbox">
    <div class="page-head">
      <h1 id="h-inbox">Inbox</h1>
      <VerdictLine :health="health" link />
    </div>
    <div class="tabs" role="tablist" aria-label="Replies">
      <button role="tab" :aria-selected="tab === 'needs'" @click="tab = 'needs'">Needs reply<span class="count num">{{ counts.needs }}</span></button>
      <button role="tab" :aria-selected="tab === 'done'" @click="tab = 'done'">Done<span class="count num">{{ counts.done }}</span></button>
      <button role="tab" :aria-selected="tab === 'all'" @click="tab = 'all'">All</button>
    </div>

    <div class="split" :class="{ 'is-reading': openId }">
      <div class="list" role="list" aria-label="Replies">
        <LoadState :loading="threads.loading.value && !threads.data.value" :error="threads.error.value" :signed-out="threads.signedOut.value" @retry="threads.load" />
        <div v-if="threads.data.value && !visible.length" class="empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
          <h2>{{ tab === 'needs' ? 'Every reply is answered' : 'Nothing here yet' }}</h2>
          <p>Replies to hello@info.appyl.ai and inbox@jobs.appyl.ai land here.</p>
        </div>
        <router-link
          v-for="t in visible"
          :key="t.id"
          :to="`/inbox/${t.id}`"
          class="row"
          :class="{ 'is-unread': t.unreadCount > 0 }"
          role="listitem"
          :data-id="t.id"
          :aria-current="t.id === openId ? 'true' : undefined"
        >
          <span class="row-top">
            <span v-if="t.unreadCount > 0" class="unread-dot" aria-label="Unread" />
            <span class="who">{{ who(t) }}</span>
            <span class="when num">{{ ago(t.lastMessageAt) }}</span>
          </span>
          <span class="subject" style="display: block">{{ t.subject }}</span>
          <span class="snippet">{{ t.snippet }}</span>
          <span class="meta" style="display: block">{{ rowMeta(t) }}</span>
        </router-link>
      </div>

      <div class="reader" aria-live="polite">
        <div v-if="!openId" class="empty">
          <p>Open a reply to read it and answer.</p>
          <p><kbd>J</kbd> <kbd>K</kbd> move · <kbd>↵</kbd> open</p>
        </div>
        <div v-else-if="detailError" class="error-state" role="alert"><h2>This did not load</h2><p>{{ detailError }}</p></div>
        <LoadState v-else-if="!detail" loading :error="null" :signed-out="false" :rows="3" />
        <div v-else class="doc">
          <button class="btn btn--quiet back" type="button" @click="go(null)">← Inbox</button>
          <h2 class="thread-title">{{ who(detail.thread) }}</h2>
          <div class="thread-meta">
            <b>{{ detail.thread.counterpartAddress }}</b>
            {{ detail.thread.userSince ? ` · Appyl user since ${fmtDayTime(detail.thread.userSince).split(',')[0]}` : ' · not an Appyl account' }}
            · wrote to {{ detail.thread.mailbox }}
          </div>
          <div class="context">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></svg>
            <span>Replying to Appyl’s email <b>“{{ original(detail.thread.subject) }}”</b>.</span>
          </div>
          <div class="actions">
            <button class="btn btn--quiet" type="button" @click="toggleDone">{{ detail.thread.teamDoneAt ? 'Move back to Needs reply' : 'Mark done' }} <kbd>E</kbd></button>
          </div>
          <div class="msgs">
            <article v-for="(m, i) in detail.messages" :key="m.id" class="msg" :class="m.direction === 'outbound' ? 'msg--ours' : 'msg--theirs'">
              <div class="msg-meta num">
                <template v-if="m.direction === 'outbound'">{{ teamName(m.sentBy) }} for Appyl · {{ statusLabel(m.status) }} · </template>
                <template v-else-if="i > 0">{{ m.fromName ?? m.fromAddress }} · </template>{{ fmtDayTime(m.at) }}
              </div>
              <div class="msg-text">{{ m.text || '(no text)' }}</div>
            </article>
          </div>
          <form class="composer" @submit.prevent="send">
            <label for="replyBox">Reply to {{ who(detail.thread).split(' ')[0] }}</label>
            <textarea id="replyBox" ref="replyBox" v-model="reply" placeholder="Write your reply. Sign it with your name." />
            <div class="composer-foot">
              <span class="sending-as">Sending as <b>{{ detail.thread.mailbox }}</b><template v-if="isDev"> · <span class="dev">from dev, real people get it</span></template></span>
              <span class="draft-note">{{ reply ? 'Draft kept' : '' }}</span>
              <button class="btn btn--primary" type="submit" :disabled="!reply.trim() || sending">Send reply <kbd>⌘↵</kbd></button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </section>
</template>
