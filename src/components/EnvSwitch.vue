<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { shell } from '../api';

// Each environment is its own deployment: choosing one opens that address (dev never shares a URL with prod).
const OPTIONS = [
  { backend: 'prod', label: 'Production', host: 'admin.appyl.ai' },
  { backend: 'dev', label: 'Dev', host: 'dev.admin.appyl.ai' },
] as const;

const open = ref(false);
const menu = ref<HTMLElement | null>(null);
const isDev = computed(() => shell.me?.backend === 'dev');
const here = location.host;
const name = computed(() => (isDev.value ? `Dev · ${here}` : 'Production'));

async function toggle(next = !open.value): Promise<void> {
  open.value = next;
  if (next) {
    await nextTick();
    menu.value?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }
}
function onKey(e: KeyboardEvent): void {
  const items = [...(menu.value?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  }
  if (e.key === 'Escape') {
    e.stopPropagation();
    void toggle(false);
  }
}
</script>

<template>
  <div class="switch" @focusout="(e) => !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node) && toggle(false)">
    <button
      class="switch-btn"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="open"
      aria-controls="switchMenu"
      :title="`${isDev ? 'Dev' : 'Production'} · switch environment`"
      @click="toggle()"
    >
      <svg class="switch-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" /><path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
      </svg>
      <span class="switch-name">{{ name }}</span>
      <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
    </button>
    <div v-show="open" id="switchMenu" ref="menu" class="switch-menu" role="menu" aria-label="Environment" @keydown="onKey">
      <a
        v-for="o in OPTIONS"
        :key="o.backend"
        role="menuitemradio"
        :aria-checked="(shell.me?.backend ?? 'prod') === o.backend"
        :href="`https://${o.host}`"
      >
        <span><b>{{ o.label }}</b><span>{{ o.host }}</span></span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
      </a>
      <p class="switch-note">Opens that environment’s own address. Dev reads the dev database; replies from dev still reach real people.</p>
    </div>
  </div>
</template>
