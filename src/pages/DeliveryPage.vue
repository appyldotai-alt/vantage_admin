<script setup lang="ts">
import { computed, ref } from 'vue';
import { ago, api, pct, useLoad } from '../api';
import { LIMIT_BOUNCE, LIMIT_COMPLAINT, type DeliveryProblem } from '../types';
import LoadState from '../components/LoadState.vue';
import VerdictLine from '../components/VerdictLine.vue';
import ProblemChart from '../components/ProblemChart.vue';

const { data, error, signedOut, loading, load } = useLoad(api.delivery);
type Source = 'all' | 'users' | 'appyl';
const source = ref<Source>('all');

// Same shape for both: what was sent (users) or settled (Appyl's emails, known only from events).
const groups = computed(() => {
  const d = data.value;
  if (!d) return [];
  const users = { title: 'Users’ mail', base: d.users.sent, delivered: d.users.delivered, bounced: d.users.bounced, complaints: d.users.complaints, delayed: d.users.delayed };
  const appyl = { title: 'Appyl’s emails', base: d.appyl.settled, delivered: d.appyl.delivered, bounced: d.appyl.bounced + d.appyl.failed, complaints: d.appyl.complaints, delayed: d.appyl.delayed };
  return source.value === 'all' ? [users, appyl] : source.value === 'users' ? [users] : [appyl];
});

/** Every one of the last 30 days, gaps filled with zero, for the chosen source. */
const days = computed(() => {
  const rows = data.value?.days ?? [];
  return Array.from({ length: 30 }, (_, i) => {
    const day = new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10);
    const hits = rows.filter((r) => r.day === day && (source.value === 'all' || r.appyl === (source.value === 'appyl')));
    return { day, delivered: hits.reduce((n, r) => n + r.delivered, 0), bad: hits.reduce((n, r) => n + r.bad, 0) };
  });
});
const overDays = computed(() => days.value.filter((d) => d.bad / Math.max(1, d.bad + d.delivered) > LIMIT_BOUNCE).length);

const problems = computed(() => (data.value?.problems ?? []).filter((p) => source.value === 'all' || (source.value === 'appyl') === (p.fromAddress === null)));
const KIND: Record<string, string> = { bounced: 'Bounced', deferred: 'Delayed', failed: 'Failed', rejected: 'Rejected', complained: 'Spam complaint' };
/** The receiving server's reason in plain words, with its code kept for searching. */
function why(p: DeliveryProblem): string {
  const code = [p.smtpCode, p.detail?.match(/\b\d\.\d\.\d+\b/)?.[0]].filter(Boolean).join(' ');
  const plain =
    p.type === 'complained' ? 'The recipient marked it as spam. Appyl will not email this address again.'
    : p.type === 'deferred' ? 'The receiving server asked to try again later. Cloudflare retries it.'
    : /5\.1\.1|does not exist|unknown user|no such user/i.test(p.detail ?? '') ? 'The address does not exist.'
    : /5\.2\.2|full|quota/i.test(p.detail ?? '') ? 'The mailbox is full.'
    : p.type === 'bounced' ? 'The receiving server refused it.'
    : 'It could not be delivered.';
  return code ? `${plain} (${code})` : plain;
}
</script>

<template>
  <section class="view is-active page" aria-labelledby="h-delivery">
    <div class="page-head">
      <h1 id="h-delivery">Delivery</h1>
      <VerdictLine :health="data" />
    </div>
    <div class="page-body">
      <div class="toolbar">
        <div class="pills" role="group" aria-label="Which email">
          <button class="pill" :aria-pressed="source === 'all'" @click="source = 'all'">All email</button>
          <button class="pill" :aria-pressed="source === 'users'" @click="source = 'users'">Users’ mail</button>
          <button class="pill" :aria-pressed="source === 'appyl'" @click="source = 'appyl'">Appyl’s emails</button>
        </div>
        <span class="owner">Last 30 days</span>
      </div>
      <LoadState :loading="loading && !data" :error="error" :signed-out="signedOut" @retry="load" />
      <template v-if="data">
        <div class="summary" :style="groups.length === 1 ? { gridTemplateColumns: '1fr' } : undefined">
          <div v-for="g in groups" :key="g.title">
            <h2>{{ g.title }}</h2>
            <div class="facts">
              <div class="fact"><div class="v num">{{ pct(g.delivered, g.base) }}</div><div class="l num">delivered ({{ g.delivered.toLocaleString() }} of {{ g.base.toLocaleString() }})</div></div>
              <div class="fact"><div class="v num" :class="{ over: g.base && g.bounced / g.base > LIMIT_BOUNCE }">{{ pct(g.bounced, g.base) }}</div><div class="l num">bounced ({{ g.bounced }}) · limit 5%</div></div>
              <div class="fact"><div class="v num" :class="{ over: g.base && g.complaints / g.base > LIMIT_COMPLAINT }">{{ g.complaints }}</div><div class="l num">complaints ({{ pct(g.complaints, g.base, 2) }}) · limit 0.1%</div></div>
              <div class="fact"><div class="v num">{{ g.delayed }}</div><div class="l">delayed, then retried</div></div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="chart-head">
            <h2 class="section-title">Problems by day</h2>
            <span class="callout"><b v-if="overDays">{{ overDays }} day{{ overDays > 1 ? 's' : '' }} over the limit</b><b v-else class="ok">Under the limit every day</b><template v-if="overDays"> in 30 days</template></span>
          </div>
          <p class="section-note">Share of settled email that bounced, failed or was rejected.</p>
          <ProblemChart :days="days" />
        </div>

        <div class="section">
          <h2 class="section-title">Latest problems</h2>
          <ul class="problems">
            <li v-for="(p, i) in problems" :key="i">
              <span class="kind" :class="{ 'is-bad': p.type !== 'deferred' }">{{ KIND[p.type] ?? p.type }}</span>
              <span class="what">
                <span class="num">{{ p.recipient ?? 'Unknown recipient' }}</span>
                <div class="why">
                  {{ why(p) }} From
                  <router-link v-if="p.fromAddress" to="/mailboxes">{{ p.fromAddress }}</router-link><template v-else>Appyl’s emails</template>.
                </div>
              </span>
              <span class="t num">{{ ago(p.occurredAt) }}</span>
            </li>
            <li v-if="!problems.length"><span class="why" style="grid-column: 1 / -1">No problems in the last 30 days.</span></li>
          </ul>
        </div>
      </template>
    </div>
  </section>
</template>
