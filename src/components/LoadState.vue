<script setup lang="ts">
defineProps<{ loading: boolean; error: string | null; signedOut: boolean; rows?: number }>();
defineEmits<{ retry: [] }>();
const reload = () => window.location.reload();
</script>

<template>
  <div v-if="error" class="error-state" role="alert">
    <h2>{{ signedOut ? 'Sign in again' : 'This did not load' }}</h2>
    <p>{{ error }}</p>
    <button class="btn btn--quiet" type="button" @click="signedOut ? reload() : $emit('retry')">{{ signedOut ? 'Reload' : 'Try again' }}</button>
  </div>
  <div v-else-if="loading" class="skeletons" aria-busy="true" aria-label="Loading">
    <div v-for="i in rows ?? 4" :key="i" class="skeleton-row">
      <span class="skeleton" style="width: 38%" />
      <span class="skeleton" style="width: 72%; margin-top: 8px" />
    </div>
  </div>
</template>

<style scoped>
.skeletons {
  padding: 12px 8px;
}
.skeleton-row {
  padding: 12px 14px;
}
</style>
