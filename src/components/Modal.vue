<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

defineProps<{ open: boolean; title?: string }>()
const emit = defineEmits(['close'])

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <transition name="modal">
    <div
      v-if="open"
      class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      @click.self="emit('close')"
    >
      <div class="card w-full max-w-md animate-in rounded-b-none rounded-t-2xl p-5 sm:rounded-2xl">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="font-semibold">{{ title }}</h3>
          <button class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" @click="emit('close')">✕</button>
        </div>
        <slot />
      </div>
    </div>
  </transition>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
