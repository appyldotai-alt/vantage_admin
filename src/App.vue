<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, runUndo, shell, toast } from './api';
import EnvSwitch from './components/EnvSwitch.vue';

const route = useRoute();
const router = useRouter();
const navOpen = ref(false);
const keysOpen = ref(false);
const isDev = computed(() => shell.me?.backend === 'dev');
const title = computed(() => String(route.meta.title ?? 'Inbox'));

const NAV = [
  { to: '/', key: 'i', label: 'Inbox', match: ['inbox', 'thread'] },
  { to: '/platform', key: 'p', label: 'Platform', match: ['platform'] },
  { to: '/users', key: 'u', label: 'Users', match: ['users'] },
  { to: '/mailboxes', key: 'm', label: 'Mailboxes', match: ['mailboxes'] },
  { to: '/delivery', key: 'd', label: 'Delivery', match: ['delivery'] },
] as const;
const current = (match: readonly string[]) => match.includes(String(route.name));

onMounted(async () => {
  shell.me = await api.me().catch(() => null);
  const h = await api.health().catch(() => null);
  if (h) shell.needsReply = h.needsReply;
});
watch(
  () => [title.value, shell.needsReply] as const,
  ([t, n]) => {
    document.title = `${t === 'Inbox' && n ? `(${n}) ` : ''}${t} · Appyl Admin${isDev.value ? ' (dev)' : ''}`;
  },
  { immediate: true },
);
watch(() => route.fullPath, () => (navOpen.value = false));
watch(navOpen, (open) => {
  if (open) requestAnimationFrame(() => document.querySelector<HTMLElement>('.nav a[aria-current="page"]')?.focus());
});

let gPending = false;
function onKey(e: KeyboardEvent): void {
  const typing = (e.target as HTMLElement).matches('textarea, input, [contenteditable]');
  if (e.key === 'Escape') {
    if (keysOpen.value) keysOpen.value = false;
    else if (navOpen.value) navOpen.value = false;
    return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (gPending) {
    gPending = false;
    const item = NAV.find((n) => n.key === e.key);
    if (item) void router.push(item.to);
    return;
  }
  if (e.key === 'g') {
    gPending = true;
    setTimeout(() => (gPending = false), 900);
  } else if (e.key === '?') keysOpen.value = true;
  else if (e.key === '/' && route.name === 'mailboxes') {
    e.preventDefault();
    document.querySelector<HTMLInputElement>('#msearch')?.focus();
  }
}
onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="app" :class="{ 'is-dev': isDev, 'nav-open': navOpen }">
    <aside id="sidebar" class="sidebar" aria-label="Admin">
      <div class="brand"><img src="/icon-192.png" alt="" width="22" height="22" /><span>Appyl Admin</span></div>
      <EnvSwitch />
      <nav class="nav" aria-label="Main">
        <router-link
          v-for="n in NAV"
          :key="n.to"
          :to="n.to"
          :aria-current="current(n.match) ? 'page' : undefined"
          :title="`${n.label} (G ${n.key.toUpperCase()})`"
        >
          <svg v-if="n.key === 'i'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>
          <svg v-else-if="n.key === 'p'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>
          <svg v-else-if="n.key === 'u'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          <svg v-else-if="n.key === 'm'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" /></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
          <span class="label">{{ n.label }}</span>
          <span v-if="n.key === 'i'" class="count num">{{ shell.needsReply || '' }}</span>
        </router-link>
      </nav>
      <div class="sidebar-foot">
        <button class="kbd-hint" type="button" title="Keyboard shortcuts (?)" @click="keysOpen = true">Keyboard shortcuts <kbd>?</kbd></button>
        <span v-if="shell.me">{{ shell.me.email }}</span>
      </div>
    </aside>
    <div class="scrim" @click="navOpen = false" />

    <main class="main">
      <header class="topbar">
        <button class="menu-btn" type="button" aria-label="Open navigation" :aria-expanded="navOpen" aria-controls="sidebar" @click="navOpen = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <span class="topbar-title">{{ title }}</span>
        <span v-if="isDev" class="dev-tag">Dev data</span>
      </header>
      <router-view />
    </main>
  </div>

  <div class="toast" :class="{ 'is-on': toast.on }" role="status">
    <span>{{ toast.text }}</span>
    <button v-if="toast.undo" type="button" @click="runUndo">Undo</button>
    <span :key="toast.key" class="bar" :style="{ animationDuration: `${toast.ms}ms` }" />
  </div>

  <div v-if="keysOpen" class="sheet-bg is-on" role="dialog" aria-modal="true" aria-labelledby="keysTitle" @click.self="keysOpen = false">
    <div class="sheet">
      <h2 id="keysTitle">Keyboard shortcuts</h2>
      <dl>
        <dt>Next / previous reply</dt><dd><kbd>J</kbd><kbd>K</kbd></dd>
        <dt>Write a reply</dt><dd><kbd>R</kbd></dd>
        <dt>Send</dt><dd><kbd>⌘</kbd><kbd>↵</kbd></dd>
        <dt>Mark done (no reply needed)</dt><dd><kbd>E</kbd></dd>
        <dt>Back to the list</dt><dd><kbd>Esc</kbd></dd>
        <dt>Go to Inbox · Platform · Users</dt><dd><kbd>G</kbd><kbd>I</kbd> <kbd>P</kbd> <kbd>U</kbd></dd>
        <dt>Go to Mailboxes · Delivery</dt><dd><kbd>G</kbd><kbd>M</kbd> <kbd>D</kbd></dd>
        <dt>Find a mailbox</dt><dd><kbd>/</kbd></dd>
      </dl>
    </div>
  </div>
</template>
