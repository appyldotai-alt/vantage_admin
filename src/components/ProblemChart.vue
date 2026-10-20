<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { fmtDay, pct } from '../api';
import { LIMIT_BOUNCE } from '../types';

// Share of settled email that bounced, failed or was rejected, per day, against the 5% limit.
// One series, one axis; the title above names it, so there is no legend.
const props = defineProps<{ days: Array<{ day: string; delivered: number; bad: number }> }>();

const el = ref<HTMLElement | null>(null);
const W = ref(800);
const H = 220;
const L = 36, R = 64, T = 16, B = 26;
let ro: ResizeObserver | undefined;
onMounted(() => {
  ro = new ResizeObserver(([e]) => (W.value = Math.max(320, e!.contentRect.width)));
  if (el.value) ro.observe(el.value);
});
onBeforeUnmount(() => ro?.disconnect());

const geo = computed(() => {
  const s = props.days;
  const w = W.value - L - R, h = H - T - B;
  const rates = s.map((d) => d.bad / Math.max(1, d.delivered + d.bad));
  const peak = Math.max(0, ...rates);
  const max = Math.max(0.06, Math.ceil(peak * 1.3 * 100) / 100);
  const x = (i: number) => L + (s.length > 1 ? (i / (s.length - 1)) * w : w / 2);
  const y = (r: number) => T + h - (r / max) * h;
  const pts = rates.map((r, i) => `${x(i).toFixed(1)},${y(r).toFixed(1)}`);
  const line = pts.length ? `M${pts.join(' L')}` : '';
  const area = pts.length ? `${line} L${x(s.length - 1)},${y(0)} L${x(0)},${y(0)} Z` : '';
  const peakI = rates.indexOf(peak);
  const weeks = s.map((d, i) => ({ d, i })).filter(({ i }) => (s.length - 1 - i) % 7 === 0);
  return { s, w, h, rates, max, x, y, line, area, peakI, peakOver: peak > LIMIT_BOUNCE, weeks, ly: y(LIMIT_BOUNCE) };
});
const over = computed(() => geo.value.rates.filter((r) => r > LIMIT_BOUNCE).length);

const hover = ref<number | null>(null);
function onMove(e: MouseEvent): void {
  const g = geo.value;
  const box = el.value!.getBoundingClientRect();
  hover.value = Math.max(0, Math.min(g.s.length - 1, Math.round(((e.clientX - box.left - L) / g.w) * (g.s.length - 1))));
}
defineExpose({ over });
</script>

<template>
  <div ref="el" class="chart" :class="{ 'is-hover': hover !== null }">
    <svg v-if="geo.s.length" :viewBox="`0 0 ${W} ${H}`" role="img"
      :aria-label="`Problem share by day, last ${geo.s.length} days. ${geo.peakOver ? `Over the 5% limit on ${over} day${over === 1 ? '' : 's'}.` : 'Under the 5% limit every day.'}`">
      <defs>
        <linearGradient id="problemFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#2f4a2c" stop-opacity="0.16" /><stop offset="1" stop-color="#2f4a2c" stop-opacity="0" />
        </linearGradient>
      </defs>
      <g v-for="t in [0, geo.max]" :key="t">
        <line class="grid" :x1="L" :x2="L + geo.w" :y1="geo.y(t)" :y2="geo.y(t)" />
        <text class="axis-label" :x="L - 8" :y="geo.y(t) + 4" text-anchor="end">{{ Math.round(t * 100) }}%</text>
      </g>
      <line class="limit" :x1="L" :x2="L + geo.w" :y1="geo.ly" :y2="geo.ly" />
      <text class="limit-label" :x="L + geo.w + 8" :y="geo.ly + 4">5% limit</text>
      <path :d="geo.area" fill="url(#problemFill)" />
      <path class="line" :d="geo.line" />
      <template v-if="geo.peakOver">
        <circle class="peak" :cx="geo.x(geo.peakI)" :cy="geo.y(geo.rates[geo.peakI]!)" r="5" />
        <text class="peak-label" :x="Math.min(geo.x(geo.peakI), L + geo.w - 4)" :y="geo.y(geo.rates[geo.peakI]!) - 12"
          :text-anchor="geo.x(geo.peakI) > L + geo.w - 60 ? 'end' : 'middle'">
          {{ pct(geo.s[geo.peakI]!.bad, geo.s[geo.peakI]!.bad + geo.s[geo.peakI]!.delivered) }} · {{ fmtDay(geo.s[geo.peakI]!.day) }}
        </text>
      </template>
      <template v-if="hover !== null">
        <line class="cross" :x1="geo.x(hover)" :x2="geo.x(hover)" :y1="T" :y2="T + geo.h" />
        <circle class="hover-dot" r="4.5" :cx="geo.x(hover)" :cy="geo.y(geo.rates[hover]!)" />
      </template>
      <text v-for="wk in geo.weeks" :key="wk.i" class="axis-label" :x="geo.x(wk.i)" :y="H - 6" text-anchor="middle">
        {{ wk.i === geo.s.length - 1 ? 'Today' : fmtDay(wk.d.day) }}
      </text>
      <rect :x="L" :y="T" :width="geo.w" :height="geo.h" fill="transparent" @mousemove="onMove" @mouseleave="hover = null" />
    </svg>
    <div v-if="hover !== null" class="tip" style="opacity: 1"
      :style="{ left: `${Math.max(90, Math.min(W - 90, geo.x(hover)))}px`, top: `${geo.y(geo.rates[hover]!)}px` }">
      <b>{{ fmtDay(geo.s[hover]!.day) }}</b> · {{ pct(geo.s[hover]!.bad, geo.s[hover]!.bad + geo.s[hover]!.delivered) }} problems<br />
      <span>{{ geo.s[hover]!.delivered }} delivered · {{ geo.s[hover]!.bad }} bounced or failed</span>
    </div>
  </div>
</template>
