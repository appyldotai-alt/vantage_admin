<script setup lang="ts">
import { computed, ref } from 'vue';
import { api, fmtClock, fmtDay, pct, useLoad } from '../api';
import type { Stage } from '../types';
import LoadState from '../components/LoadState.vue';

const { data, error, signedOut, loading, load } = useLoad(api.platform);

const OPEN: Stage[] = ['saved', 'preparing', 'applied', 'interviewing', 'offer'];
const CLOSED: Stage[] = ['rejected', 'ghosted', 'withdrawn'];
const LABEL: Record<Stage, string> = { saved: 'Saved', preparing: 'Preparing', applied: 'Applied', interviewing: 'Interviewing', offer: 'Offer', rejected: 'Rejected', ghosted: 'No reply', withdrawn: 'Withdrawn' };

const stage = (s: Stage) => data.value?.stages.find((x) => x.stage === s) ?? { stage: s, applications: 0, people: 0 };
const pipeline = computed(() => {
  const rows = OPEN.map(stage);
  const max = Math.max(1, ...rows.map((r) => r.people));
  return rows.map((r) => ({ ...r, width: (r.people / max) * 100 }));
});
const closed = computed(() => CLOSED.map(stage));

const signups = computed(() => {
  const s = data.value?.signups ?? [];
  const max = Math.max(1, ...s.map((w) => w.n));
  return s.map((w) => ({ ...w, h: (w.n / max) * 100 }));
});
const hoverWeek = ref<number | null>(null);
</script>

<template>
  <section class="view is-active page" aria-labelledby="h-platform">
    <div class="page-head">
      <h1 id="h-platform">Platform</h1>
      <p v-if="data" class="verdict">
        <span><strong class="num">{{ data.users.total.toLocaleString() }}</strong> people</span>
        <span class="num">{{ stage('offer').people }} with an offer</span>
        <span class="num">{{ stage('interviewing').people }} interviewing</span>
        <span class="num">{{ data.matches.excellent.toLocaleString() }} excellent-fit matches</span>
        <span class="num">as of {{ fmtClock(data.asOf) }}</span>
      </p>
    </div>
    <div class="page-body">
      <LoadState :loading="loading && !data" :error="error" :signed-out="signedOut" @retry="load" />
      <template v-if="data">
        <div class="section">
          <h2 class="section-title">Where people are</h2>
          <p class="section-note">People with at least one live application at each stage. One person can be at several stages.</p>
          <ol class="funnel">
            <li v-for="r in pipeline" :key="r.stage" :title="`${LABEL[r.stage]}: ${r.people} people, ${r.applications} applications`">
              <span class="f-label">{{ LABEL[r.stage] }}</span>
              <span class="f-track"><span class="f-bar" :class="{ 'is-offer': r.stage === 'offer' }" :style="{ width: `${Math.max(r.width, r.people ? 1.5 : 0)}%` }" /></span>
              <span class="f-value num"><b>{{ r.people }}</b> {{ r.people === 1 ? 'person' : 'people' }} · {{ r.applications }} {{ r.applications === 1 ? 'application' : 'applications' }}</span>
            </li>
          </ol>
          <p class="closed num">
            Closed:
            <template v-for="(r, i) in closed" :key="r.stage">{{ i ? ' · ' : '' }}{{ LABEL[r.stage] }} {{ r.applications }}</template>
          </p>
        </div>

        <div class="summary">
          <div>
            <h2>Matches</h2>
            <div class="facts">
              <div class="fact"><div class="v num">{{ data.matches.usersWithMatches }}</div><div class="l">people with good or excellent matches</div></div>
              <div class="fact"><div class="v num">{{ data.matches.usersWithExcellent }}</div><div class="l">people with an excellent fit</div></div>
              <div class="fact"><div class="v num">{{ data.matches.excellent.toLocaleString() }}</div><div class="l">excellent fits</div></div>
              <div class="fact"><div class="v num">{{ data.matches.good.toLocaleString() }}</div><div class="l">good fits</div></div>
            </div>
            <p class="section-note fine">From each person’s last Matched jobs view (no search or filter).</p>
          </div>
          <div>
            <h2>Work made with Appyl</h2>
            <div class="facts">
              <div class="fact"><div class="v num">{{ data.documents.resumesFinalized.toLocaleString() }}</div><div class="l">tailored resumes finished</div></div>
              <div class="fact"><div class="v num">{{ data.documents.coverLetters.toLocaleString() }}</div><div class="l">cover letters written</div></div>
              <div class="fact"><div class="v num">{{ data.documents.interviewPrepSessions.toLocaleString() }}</div><div class="l">interview prep sessions</div></div>
              <div class="fact"><div class="v num">{{ pct(data.users.onboarded, data.users.total, 0) }}</div><div class="l">finished setup ({{ data.users.onboarded }})</div></div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="chart-head">
            <h2 class="section-title">New accounts by week</h2>
            <span class="callout num"><b class="ok">{{ data.users.newThisWeek }}</b> this week · {{ data.users.admitted }} admitted to the beta · {{ data.users.withResumeSource }} added a resume</span>
          </div>
          <div class="weeks" role="img" :aria-label="`New accounts per week for the last 12 weeks: ${signups.map((w) => w.n).join(', ')}`" @mouseleave="hoverWeek = null">
            <div v-for="(w, i) in signups" :key="w.week" class="wk" @mouseenter="hoverWeek = i">
              <span class="wk-n num" :class="{ 'is-on': hoverWeek === i || i === signups.length - 1 }">{{ w.n }}</span>
              <span class="wk-bar" :class="{ 'is-on': hoverWeek === i }" :style="{ height: `${Math.max(w.h, w.n ? 3 : 0)}%` }" />
            </div>
          </div>
          <div class="chart-axis"><span>Week of {{ signups[0] ? fmtDay(signups[0].week) : '' }}</span><span>This week</span></div>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.funnel { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--hairline); }
.funnel li { display: grid; grid-template-columns: 110px 1fr 230px; align-items: center; gap: 16px; padding: 11px 0; border-bottom: 1px solid var(--hairline); }
.f-label { font-weight: 500; }
.f-track { height: 14px; border-radius: 4px; background: var(--rail); overflow: hidden; }
.f-bar { display: block; height: 100%; border-radius: 4px; background: #a9b8a3; transition: width 400ms var(--ease); }
.f-bar.is-offer { background: var(--accent); }
.f-value { font-size: 13px; color: var(--secondary); text-align: right; }
.f-value b { color: var(--ink); font-weight: 600; font-size: 14px; }
.closed { margin: 10px 0 0; font-size: 13px; color: var(--secondary); }
.summary { margin-top: 36px; }
.fine { margin: 8px 0 0; font-size: 12px; }
.weeks { display: grid; grid-template-columns: repeat(12, 1fr); gap: 6px; align-items: end; height: 150px; border-bottom: 1px solid var(--hairline); padding-top: 20px; }
.wk { position: relative; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
.wk-bar { width: 100%; max-width: 44px; border-radius: 4px 4px 0 0; background: #c6d0c1; transition: background 120ms var(--ease); }
.wk-bar.is-on, .wk:last-child .wk-bar { background: var(--accent); }
.wk-n { margin-bottom: 4px; font-size: 12px; color: var(--secondary); opacity: 0; transition: opacity 120ms var(--ease); }
.wk-n.is-on { opacity: 1; color: var(--ink); font-weight: 500; }
@media (max-width: 760px) {
  .funnel li { grid-template-columns: 1fr auto; }
  .f-track { grid-column: 1 / -1; grid-row: 2; }
  .f-value { text-align: right; }
}
</style>
