<script setup lang="ts">
import { onMounted } from 'vue'
import { registerSW } from 'virtual:pwa-register'

onMounted(() => {
  // 注册 Service Worker，支持离线访问与 PWA 安装
  registerSW({ immediate: true })
})
</script>

<template>
  <router-view v-slot="{ Component }">
    <transition name="fade" mode="out-in">
      <component :is="Component" />
    </transition>
  </router-view>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
