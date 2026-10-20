<script setup lang="ts">
import { computed, ref } from 'vue';
import { ago, api, fmtDay, useLoad } from '../api';
import type { PlatformUser, Stage } from '../types';
import LoadState from '../components/LoadState.vue';

const { data, error, signedOut, loading, load } = useLoad(api.users);
type Filter = 'all' | 'offer' | 'interviewing' | 'applying' | 'setup';
const filter = ref<Filter>('all');
const query = ref('');

const ORDER: Stage[] = ['offer', 'interviewing', 'applied', 'preparing', 'saved'];
const LABEL: Record<Stage, string> = { saved: 'Saved', preparing: 'Preparing', applied: 'Applied', interviewing: 'Interviewing', offer: 'Offer', rejected: 'Rejected', ghosted: 'No reply', withdrawn: 'Withdrawn' };
const TONE: Partial<Record<Stage, string>> = { offer: 'good', interviewing: 'good', applied: 'warn' };

/** The furthest open stage a person has reached, if any. */
const furthest = (u: PlatformUser): Stage | null => ORDER.find((s) => (u.stages[s] ?? 0) > 0) ?? null;
const applications = (u: PlatformUser) => Object.values(u.stages).reduce((n, v) => n + (v ?? 0), 0);
const summary = (u: PlatformUser) =>
  (Object.entries(u.stages) as Array<[Stage, number]>)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => ORDER.indexOf(a) - ORDER.indexOf(b))
    .map(([s, n]) => `${n} ${LABEL[s].toLowerCase()}`)
    .join(' · ');

const match = (u: PlatformUser, f: Filter) =>
  f === 'all' ? true
  : f === 'offer' ? (u.stages.offer ?? 0) > 0
  : f === 'interviewing' ? (u.stages.interviewing ?? 0) > 0
  : f === 'applying' ? (u.stages.applied ?? 0) + (u.stages.preparing ?? 0) > 0
  : !u.onboarded;
const rows = computed(() => {
  const q = query.value.trim().toLowerCase();
  return (data.value ?? []).filter((u) => (q ? true : match(u, filter.value))).filter((u) => !q || u.email.toLowerCase().includes(q) || (u.name ?? '').toLowerCase().includes(q));
});
const count = (f: Filter) => (data.value ?? []).filter((u) => match(u, f)).length;
</script>

<template>
  <section class="view is-active page" aria-labelledby="h-users">
    <div class="page-head">
      <h1 id="h-users">Users</h1>
      <p v-if="data" class="verdict"><span class="num">{{ data.length.toLocaleString() }} people · newest first</span></p>
    </div>
    <div class="page-body">
      <div class="toolbar">
        <div class="pills" role="group" aria-label="Show">
          <button class="pill" :aria-pressed="filter === 'all' || !!query" @click="filter = 'all'">All<span class="count num">{{ count('all') }}</span></button>
          <button class="pill" :aria-pressed="filter === 'offer' && !query" @click="(filter = 'offer'), (query = '')">Has an offer<span class="count num">{{ count('offer') }}</span></button>
          <button class="pill" :aria-pressed="filter === 'interviewing' && !query" @click="(filter = 'interviewing'), (query = '')">Interviewing<span class="count num">{{ count('interviewing') }}</span></button>
          <button class="pill" :aria-pressed="filter === 'applying' && !query" @click="(filter = 'applying'), (query = '')">Preparing or applied<span class="count num">{{ count('applying') }}</span></button>
          <button class="pill" :aria-pressed="filter === 'setup' && !query" @click="(filter = 'setup'), (query = '')">Setup not finished<span class="count num">{{ count('setup') }}</span></button>
        </div>
        <form class="search" role="search" @submit.prevent>
          <label for="usearch">Find a person</label>
          <input id="usearch" v-model="query" type="search" placeholder="Name or email" autocomplete="off" />
          <button class="btn btn--quiet" type="submit">Search</button>
        </form>
      </div>
      <LoadState :loading="loading && !data" :error="error" :signed-out="signedOut" @retry="load" />
      <table v-if="data" class="mtable">
        <thead>
          <tr>
            <th>Person</th><th>Furthest stage</th><th class="hide-md">Applications</th><th class="r">Matches</th>
            <th class="r hide-md">Resumes</th><th class="r hide-md">Cover letters</th><th class="r hide-sm">Last active</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in rows" :key="u.id" class="urow">
            <td>
              <div class="addr">{{ u.name ?? u.email }}</div>
              <div class="owner">{{ u.name ? `${u.email} · ` : '' }}joined {{ fmtDay(u.joinedAt) }}<template v-if="!u.onboarded"> · setup not finished</template></div>
            </td>
            <td>
              <span v-if="furthest(u)" class="state" :class="`state--${TONE[furthest(u)!] ?? 'none'}`">{{ LABEL[furthest(u)!] }}</span>
              <span v-else class="owner">No applications</span>
            </td>
            <td class="hide-md owner">{{ summary(u) || '—' }}<template v-if="applications(u)"> ({{ applications(u) }})</template></td>
            <td class="r num">
              <template v-if="u.excellent !== null">{{ u.excellent }} excellent · {{ u.good }} good</template>
              <span v-else class="owner">Not viewed yet</span>
            </td>
            <td class="r num hide-md">{{ u.resumes || '—' }}</td>
            <td class="r num hide-md">{{ u.coverLetters || '—' }}</td>
            <td class="r num hide-sm">{{ ago(u.lastActiveAt) }}</td>
          </tr>
          <tr v-if="!rows.length">
            <td colspan="7"><div class="empty"><h2>Nobody here</h2><p>Try another filter or search.</p></div></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.urow td { vertical-align: middle; }
@media (max-width: 760px) {
  .urow { display: grid; grid-template-columns: 1fr auto; padding: 10px 0; border-bottom: 1px solid var(--hairline); }
  .urow td { border: 0; padding: 2px 4px; }
}
</style>
