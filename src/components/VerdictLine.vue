<script setup lang="ts">
import { computed } from 'vue';
import { fmtClock, pct } from '../api';
import { LIMIT_BOUNCE, LIMIT_COMPLAINT, type Health } from '../types';

const props = defineProps<{ health: Health | null; link?: boolean }>();

// One sentence: is mail getting through? Users' mail and Appyl's own emails together.
const v = computed(() => {
  const h = props.health;
  if (!h) return null;
  const base = h.users.sent + h.appyl.settled;
  const delivered = h.users.delivered + h.appyl.delivered;
  const bounced = h.users.bounced + h.appyl.bounced + h.appyl.failed;
  const complaints = h.users.complaints + h.appyl.complaints;
  const b = base ? bounced / base : 0;
  const c = base ? complaints / base : 0;
  return { base, delivered, bounced, complaints, overB: b > LIMIT_BOUNCE, overC: c > LIMIT_COMPLAINT, asOf: h.asOf };
});
</script>

<template>
  <p v-if="v" class="verdict">
    <span class="status">
      <span class="dot" :class="{ 'is-bad': v.overB || v.overC }" aria-hidden="true" />
      <strong>{{ v.base === 0 ? 'No email in the last 30 days' : v.overB || v.overC ? 'Mail needs attention' : 'Mail is healthy' }}</strong>
    </span>
    <template v-if="v.base">
      <span class="num">{{ pct(v.delivered, v.base) }} delivered</span>
      <span class="num" :class="{ over: v.overB }">{{ pct(v.bounced, v.base) }} bounced <span class="lim">(limit 5%)</span></span>
      <span class="num" :class="{ over: v.overC }">{{ pct(v.complaints, v.base, 2) }} complaints <span class="lim">(limit 0.1%)</span></span>
    </template>
    <span class="num">as of {{ fmtClock(v.asOf) }}</span>
    <router-link v-if="link" to="/delivery">Details</router-link>
  </p>
  <p v-else class="verdict"><span class="skeleton" style="width: 340px; max-width: 100%" /></p>
</template>
