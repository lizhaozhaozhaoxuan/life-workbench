<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useTheme, type ThemeMode } from '@/composables/useTheme'
import { isOnline } from '@/lib/db'
import { HAS_SUPABASE } from '@/lib/supabase'
import { requestNotify, startReminders } from '@/composables/useReminders'
import { useCollection } from '@/composables/useCollection'
import { collectReminders, getReminderCfg } from '@/lib/assetHelpers'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { mode, setMode } = useTheme()

const nav = [
  { name: 'overview', label: '概览', icon: '▦', to: '/' },
  { name: 'work', label: '工作', icon: '✓', to: '/work' },
  { name: 'life', label: '生活', icon: '♡', to: '/life' },
  { name: 'finance', label: '记账', icon: '¥', to: '/finance' },
  { name: 'workout', label: '运动', icon: '⬆', to: '/workout' },
  { name: 'study', label: '学习', icon: '✎', to: '/study' },
  { name: 'assets', label: '资产', icon: '📦', to: '/assets', badge: true },
  { name: 'settings', label: '设置', icon: '⚙', to: '/settings' }
]

// 资产时效提醒红点：聚合过期/过保/闲置数量
const { items: assetItems } = useCollection('asset_items')
const assetBadge = computed(() => collectReminders(assetItems.value, getReminderCfg()).length)

const online = ref(isOnline())
const notifyState = ref(typeof Notification !== 'undefined' ? Notification.permission : 'denied')

onMounted(() => {
  window.addEventListener('online', () => (online.value = true))
  window.addEventListener('offline', () => (online.value = false))
  requestNotify()
  startReminders()
  if (typeof Notification !== 'undefined') notifyState.value = Notification.permission
})

const title = computed(() => (route.meta.title as string) || '工作台')
const syncLabel = computed(() => {
  if (!HAS_SUPABASE) return '本地模式'
  return online.value ? '已同步' : '离线·已暂存'
})
const syncColor = computed(() => {
  if (!HAS_SUPABASE) return 'bg-slate-400'
  return online.value ? 'bg-emerald-500' : 'bg-amber-500'
})

function enableNotify() {
  requestNotify()
  if (typeof Notification !== 'undefined') notifyState.value = Notification.permission
}
async function logout() {
  await auth.signOut()
  router.push('/auth')
}

const themeOptions: { mode: ThemeMode; icon: string }[] = [
  { mode: 'light', icon: '☀' },
  { mode: 'dark', icon: '☾' },
  { mode: 'system', icon: '⚙' }
]
</script>

<template>
  <div class="min-h-full md:flex">
    <!-- 桌面侧边栏 -->
    <aside class="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white/70 p-4 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/60 md:flex">
      <div class="mb-6 flex items-center gap-2 px-2">
        <img src="/icon.svg" class="h-8 w-8" alt="" />
        <span class="text-base font-semibold">工作台</span>
      </div>
      <nav class="flex-1 space-y-1">
        <RouterLink
          v-for="n in nav"
          :key="n.name"
          :to="n.to"
          class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition"
          :class="route.name === n.name ? 'bg-brand-600 text-white shadow-glow' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'"
        >
          <span class="relative text-lg leading-none">
            {{ n.icon }}
            <span v-if="n.badge && assetBadge" class="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-rose-500"></span>
          </span>
          {{ n.label }}
          <span v-if="n.badge && assetBadge" class="ml-auto rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{{ assetBadge }}</span>
        </RouterLink>
      </nav>
      <div class="mt-4 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
        <div v-if="!auth.isLocal" class="px-3 text-xs text-slate-400">{{ auth.user?.email }}</div>
        <button v-if="!auth.isLocal" class="btn-ghost w-full" @click="logout">退出登录</button>
        <div v-else class="px-3 text-xs text-slate-400">本地演示模式</div>
      </div>
    </aside>

    <!-- 主区域 -->
    <div class="flex-1 md:pl-64">
      <!-- 顶部栏 -->
      <header class="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/70">
        <h1 class="text-lg font-semibold">{{ title }}</h1>
        <div class="flex items-center gap-2">
          <span class="chip" :class="syncColor + ' text-white'">
            <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-white/90"></span>{{ syncLabel }}
          </span>
          <button
            v-if="notifyState !== 'granted'"
            class="btn-ghost px-2.5 py-1.5 text-xs"
            title="开启浏览器提醒"
            @click="enableNotify"
          >🔔 提醒</button>
          <div class="flex overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              v-for="t in themeOptions"
              :key="t.mode"
              class="px-2.5 py-1.5 text-sm transition"
              :class="mode === t.mode ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'"
              @click="setMode(t.mode)"
            >{{ t.icon }}</button>
          </div>
        </div>
      </header>

      <!-- 内容 -->
      <main class="mx-auto max-w-5xl px-4 pb-28 pt-5 md:pb-10">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>

    <!-- 移动端底部导航 -->
    <nav class="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-slate-200 bg-white/90 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 md:hidden">
      <RouterLink
        v-for="n in nav"
        :key="n.name"
        :to="n.to"
        class="relative flex flex-col items-center gap-0.5 py-2 text-[11px]"
        :class="route.name === n.name ? 'text-brand-600' : 'text-slate-400'"
      >
        <span class="relative text-lg leading-none">
          {{ n.icon }}
          <span v-if="n.badge && assetBadge" class="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-rose-500"></span>
        </span>
        {{ n.label }}
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
