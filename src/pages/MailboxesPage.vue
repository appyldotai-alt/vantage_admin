<script setup lang="ts">
import { computed, ref } from 'vue';
import { ago, api, fmtDay, pct, useLoad } from '../api';
import { LIMIT_BOUNCE, type MailboxRow } from '../types';
import LoadState from '../components/LoadState.vue';

const { data, error, signedOut, loading, load } = useLoad(api.mailboxes);
type Filter = 'attention' | 'all' | 'testing';
const filter = ref<Filter>('attention');
const query = ref('');
const expanded = ref<string | null>(null);

const STATE: Record<string, [string, string]> = {
  active: ['Active', 'good'],
  testing: ['Waiting for test email', 'warn'],
  paused: ['Paused', 'bad'],
  suspended: ['Suspended', 'bad'],
};
const NEW_DAYS = 7;
const isNew = (m: MailboxRow) => !!m.verifiedAt && Date.now() - Date.parse(m.verifiedAt) < NEW_DAYS * 86_400_000;
const overLimit = (m: MailboxRow) => m.sent > 0 && (m.bounced / m.sent > LIMIT_BOUNCE || m.complained > 0);
const needsAttention = (m: MailboxRow) => m.status === 'paused' || m.status === 'suspended' || overLimit(m);

const rows = computed(() => {
  const q = query.value.trim().toLowerCase();
  const list = data.value ?? [];
  const f: Filter = q ? 'all' : filter.value;
  return list
    .filter((m) => f === 'all' || (f === 'testing' ? m.status === 'testing' : needsAttention(m)))
    .filter((m) => !q || m.address.includes(q) || (m.ownerEmail ?? '').toLowerCase().includes(q))
    .sort((a, b) => b.bounced + b.complained * 10 - (a.bounced + a.complained * 10));
});
const counts = computed(() => {
  const list = data.value ?? [];
  return { attention: list.filter(needsAttention).length, all: list.length, testing: list.filter((m) => m.status === 'testing').length, active: list.filter((m) => m.status === 'active').length };
});
function note(m: MailboxRow): string | null {
  if (m.status === 'paused') return `Paused${m.pausedReason ? ` after a ${m.pausedReason}` : ''}. To lift it, run npm run mail:unpause in vantage_express.`;
  if (m.status === 'testing') return `Claimed ${fmtDay(m.createdAt)}; the test email has not arrived yet.`;
  if (isNew(m)) return 'In its first 7 days: opens are not counted yet.';
  return null;
}
</script>

<template>
  <section class="view is-active page" aria-labelledby="h-mailboxes">
    <div class="page-head">
      <h1 id="h-mailboxes">Mailboxes</h1>
      <p v-if="data" class="verdict"><span>{{ counts.all }} mailboxes · {{ counts.active }} active · counts for the last 30 days</span></p>
    </div>
    <div class="page-body">
      <div class="toolbar">
        <div class="pills" role="group" aria-label="Show">
          <button class="pill" :aria-pressed="filter === 'attention' && !query" @click="(filter = 'attention'), (query = '')">Needs attention<span class="count num">{{ counts.attention }}</span></button>
          <button class="pill" :aria-pressed="filter === 'all' || !!query" @click="filter = 'all'">All<span class="count num">{{ counts.all }}</span></button>
          <button class="pill" :aria-pressed="filter === 'testing' && !query" @click="(filter = 'testing'), (query = '')">Waiting for test email<span class="count num">{{ counts.testing }}</span></button>
        </div>
        <form class="search" role="search" @submit.prevent>
          <label for="msearch">Find a mailbox</label>
          <input id="msearch" v-model="query" type="search" placeholder="Address or owner" autocomplete="off" />
          <button class="btn btn--quiet" type="submit">Search</button>
        </form>
      </div>
      <LoadState :loading="loading && !data" :error="error" :signed-out="signedOut" @retry="load" />
      <table v-if="data" class="mtable">
        <thead>
          <tr><th>Mailbox</th><th>Status</th><th class="r hide-md">Sent</th><th class="r">Delivered</th><th class="r">Problems</th><th class="r hide-sm">Last email</th></tr>
        </thead>
        <tbody>
          <template v-for="m in rows" :key="m.id">
            <tr class="mrow" tabindex="0" :aria-expanded="expanded === m.id" @click="expanded = expanded === m.id ? null : m.id" @keydown.enter="expanded = expanded === m.id ? null : m.id">
              <td><div class="addr">{{ m.address }}</div><div class="owner">{{ m.ownerEmail ?? 'No owner' }}</div></td>
              <td><span class="state" :class="`state--${STATE[m.status]?.[1] ?? 'none'}`">{{ STATE[m.status]?.[0] ?? m.status }}</span></td>
              <td class="r num hide-sm hide-md">{{ m.sent }}</td>
              <td class="r num">{{ m.sent ? pct(m.delivered, m.sent, 0) : '—' }}</td>
              <td class="r num" :class="{ problem: overLimit(m) }">
                {{ m.bounced + m.complained ? `${m.bounced} bounced${m.complained ? ` · ${m.complained} complaint${m.complained > 1 ? 's' : ''}` : ''}` : '—' }}
              </td>
              <td class="r num hide-sm">{{ ago(m.lastAt) }}</td>
            </tr>
            <tr v-if="expanded === m.id" class="detail">
              <td colspan="6">
                <div class="detail-grid">
                  <span><b class="num">{{ m.sent }}</b>sent</span>
                  <span><b class="num">{{ m.opened }}</b>opened</span>
                  <span><b class="num">{{ m.clicked }}</b>clicked</span>
                  <span><b class="num">{{ m.received }}</b>received</span>
                </div>
                <div v-if="note(m)" class="detail-note">{{ note(m) }}</div>
              </td>
            </tr>
          </template>
          <tr v-if="!rows.length">
            <td colspan="6">
              <div class="empty">
                <h2>{{ filter === 'attention' && !query ? 'Nothing needs attention' : 'No mailboxes match' }}</h2>
                <p>{{ filter === 'attention' && !query ? 'No mailbox is paused or over a limit.' : 'Try another address or owner.' }}</p>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
