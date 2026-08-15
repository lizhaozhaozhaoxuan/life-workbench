<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import dayjs from 'dayjs'
import { Line, Doughnut, Bar } from 'vue-chartjs'
import { useCollection } from '@/composables/useCollection'
import { nextOccurrence, daysUntil } from '@/lib/lunar'
import { collectReminders, getReminderCfg } from '@/lib/assetHelpers'
import type { Row } from '@/lib/db'

const { items: todos } = useCollection('todos')
const { items: checkins } = useCollection('workout_checkins')
const { items: videos } = useCollection('workout_videos')
const { items: langSessions } = useCollection('study_lang_sessions')
const { items: transactions } = useCollection('transactions')
const { items: anniversaries } = useCollection('life_anniversary')
const { items: easyList } = useCollection('life_easy')
const { items: weights } = useCollection('weight_logs')
const { items: assetItems } = useCollection('asset_items')

const assetReminders = computed(() => collectReminders(assetItems.value, getReminderCfg()))

// ---- 日期工具 ----
function startOfWeek(d = new Date()): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  return x
}
const today = dayjs()
const todayStr = today.format('YYYY-MM-DD')
const weekStart = startOfWeek()
const weekEnd = dayjs(weekStart).add(6, 'day')
const weekStartStr = dayjs(weekStart).format('YYYY-MM-DD')
const weekEndStr = weekEnd.format('YYYY-MM-DD')
const lastWeekStart = dayjs(weekStart).subtract(7, 'day')
const lastWeekStartStr = lastWeekStart.format('YYYY-MM-DD')
const lastWeekEndStr = dayjs(weekStart).subtract(1, 'day').format('YYYY-MM-DD')

const inWeek = (ds: string) => ds >= weekStartStr && ds <= weekEndStr
const inLastWeek = (ds: string) => ds >= lastWeekStartStr && ds <= lastWeekEndStr

// ---- 今日统计 ----
const todoActive = computed(() =>
  todos.value.filter((t) => t.status !== 'done' && (!t.due_date || t.due_date <= todayStr))
)
const todoDoneToday = computed(() =>
  todos.value.filter((t) => t.status === 'done' && t.completed_at && dayjs(t.completed_at).format('YYYY-MM-DD') === todayStr)
)
const countByPriority = (arr: Row[]) => ({
  high: arr.filter((t) => t.priority === 'high').length,
  medium: arr.filter((t) => t.priority === 'medium').length,
  low: arr.filter((t) => t.priority === 'low').length
})
const activePriority = computed(() => countByPriority(todoActive.value))

const videoCat = computed(() => Object.fromEntries(videos.value.map((v) => [v.id, v.category])))
const checkinsToday = computed(() => checkins.value.filter((c) => dayjs(c.checked_at).format('YYYY-MM-DD') === todayStr))
const workoutCountToday = computed(() => checkinsToday.value.length)
const workoutPartsToday = computed(() => {
  const set = new Set(checkinsToday.value.map((c) => videoCat.value[c.video_id]).filter(Boolean))
  return [...set]
})

const studyToday = computed(() => langSessions.value.filter((s) => s.session_date === todayStr))
const studyEn = computed(() => studyToday.value.filter((s) => s.lang === 'en'))
const studyYue = computed(() => studyToday.value.filter((s) => s.lang === 'yue'))
const avg = (arr: Row[], k: string) => (arr.length ? Math.round((arr.reduce((a, b) => a + b[k], 0) / arr.length) * 10) / 10 : 0)

const txToday = computed(() => transactions.value.filter((t) => t.trans_date === todayStr))
const expenseToday = computed(() => txToday.value.filter((t) => t.type === 'expense').reduce((a, b) => a + Number(b.amount), 0))
const incomeToday = computed(() => txToday.value.filter((t) => t.type === 'income').reduce((a, b) => a + Number(b.amount), 0))
const balanceToday = computed(() => incomeToday.value - expenseToday.value)

const upcomingAnniv = computed(() =>
  anniversaries.value
    .map((a) => ({ ...a, d: daysUntil(nextOccurrence(a)) }))
    .filter((a) => a.d >= 0 && a.d <= (a.advance_days ?? 0) + 1)
    .sort((x, y) => x.d - y.d)
)
const easyUndone = computed(() => easyList.value.filter((e) => !e.done).length)

// 体重 / 体成分
const sortedWeights = computed(() => [...weights.value].sort((a, b) => (a.measured_at < b.measured_at ? -1 : 1)))
const latestWeight = computed(() => sortedWeights.value[sortedWeights.value.length - 1] || null)
const recentWeights = computed(() => sortedWeights.value.slice(-30))
const weightChart = computed(() => ({
  labels: recentWeights.value.map((w) => dayjs(w.measured_at).format('MM-DD')),
  datasets: [{ label: '体重(kg)', data: recentWeights.value.map((w) => Number(w.weight)), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.15)', fill: true, tension: 0.35 }]
}))
const weightLineOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false } } }

// ---- 每周统计 ----
const weekDays = ['一', '二', '三', '四', '五', '六', '日']
const weekDayLabels = computed(() => {
  const arr: string[] = []
  for (let i = 0; i < 7; i++) arr.push(dayjs(weekStart).add(i, 'day').format('M/D'))
  return arr
})
const workoutTrend = computed(() => {
  const arr = new Array(7).fill(0)
  checkins.value.filter((c) => inWeek(dayjs(c.checked_at).format('YYYY-MM-DD'))).forEach((c) => {
    const idx = dayjs(c.checked_at).diff(dayjs(weekStart), 'day')
    if (idx >= 0 && idx < 7) arr[idx]++
  })
  return arr
})
const workoutCatDist = computed(() => {
  const map: Record<string, number> = {}
  checkins.value
    .filter((c) => inWeek(dayjs(c.checked_at).format('YYYY-MM-DD')))
    .forEach((c) => {
      const cat = videoCat.value[c.video_id] || '未分类'
      map[cat] = (map[cat] || 0) + 1
    })
  return map
})
const studyTrend = computed(() => {
  const arr = new Array(7).fill(null)
  langSessions.value.filter((s) => inWeek(s.session_date)).forEach((s) => {
    const idx = dayjs(s.session_date).diff(dayjs(weekStart), 'day')
    if (idx >= 0 && idx < 7) arr[idx] = s.score
  })
  return arr
})
const financePie = computed(() => {
  const map: Record<string, number> = {}
  transactions.value
    .filter((t) => t.type === 'expense' && inWeek(t.trans_date))
    .forEach((t) => {
      map[t.category] = (map[t.category] || 0) + Number(t.amount)
    })
  return map
})
const workByPriority = computed(() => {
  const done = todos.value.filter((t) => t.status === 'done' && t.due_date && inWeek(t.due_date))
  const total = todos.value.filter((t) => t.due_date && inWeek(t.due_date))
  const calc = (arr: Row[]) => ({ high: arr.filter((t) => t.priority === 'high').length, medium: arr.filter((t) => t.priority === 'medium').length, low: arr.filter((t) => t.priority === 'low').length })
  return { done: calc(done), total: calc(total) }
})

// 环比提示
const lastWeekWorkout = computed(() => checkins.value.filter((c) => inLastWeek(dayjs(c.checked_at).format('YYYY-MM-DD'))).length)
const lastWeekExpense = computed(() => transactions.value.filter((t) => t.type === 'expense' && inLastWeek(t.trans_date)).reduce((a, b) => a + Number(b.amount), 0))
const thisWeekWorkout = computed(() => workoutTrend.value.reduce((a, b) => a + b, 0))
const thisWeekExpense = computed(() => Object.values(financePie.value).reduce((a, b) => a + b, 0))
const compareHints = computed(() => {
  const hints: string[] = []
  const wd = thisWeekWorkout.value - lastWeekWorkout.value
  hints.push(`运动打卡${wd >= 0 ? '增加' : '减少'} ${Math.abs(wd)} 次（环比上周）`)
  const ed = thisWeekExpense.value - lastWeekExpense.value
  hints.push(`支出${ed <= 0 ? '节省' : '增加'} ¥${Math.abs(Math.round(ed))}（环比上周）`)
  return hints
})

// ---- 图表数据 ----
const lineOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
const workoutChart = computed(() => ({
  labels: weekDayLabels.value,
  datasets: [{ label: '打卡次数', data: workoutTrend.value, borderColor: '#0ea5e9', backgroundColor: 'rgba(14,165,233,0.15)', fill: true, tension: 0.35 }]
}))
const studyChart = computed(() => ({
  labels: weekDayLabels.value,
  datasets: [{ label: '评分', data: studyTrend.value, borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.12)', fill: true, tension: 0.35, spanGaps: true }]
}))
const pieChart = computed(() => ({
  labels: Object.keys(financePie.value),
  datasets: [{ data: Object.values(financePie.value), backgroundColor: ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'] }]
}))
const pieOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' as const } } }
const workChart = computed(() => ({
  labels: ['高', '中', '低'],
  datasets: [
    { label: '已完成', data: [workByPriority.value.done.high, workByPriority.value.done.medium, workByPriority.value.done.low], backgroundColor: '#10b981' },
    { label: '总数', data: [workByPriority.value.total.high, workByPriority.value.total.medium, workByPriority.value.total.low], backgroundColor: 'rgba(148,163,184,0.4)' }
  ]
}))
const barOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }

// 模板中只判断布尔值，避免对 ref 直接 Object.keys 触发 undefined 报错
const hasExpense = computed(() => Object.keys(financePie.value).length > 0)
const hasWorkoutParts = computed(() => Object.keys(workoutCatDist.value).length > 0)
</script>

<template>
  <div class="space-y-6">
    <!-- 今日统计 -->
    <section>
      <h2 class="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">今日一览</h2>
      <div class="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <RouterLink to="/work" class="card animate-in p-4 hover:ring-2 hover:ring-brand-500/40">
          <div class="text-xs text-slate-400">待办（高/中/低）</div>
          <div class="mt-2 flex items-baseline gap-1">
            <span class="text-2xl font-semibold">{{ todoActive.length }}</span>
            <span class="text-xs text-rose-500">高{{ activePriority.high }}</span>
            <span class="text-xs text-amber-500">中{{ activePriority.medium }}</span>
            <span class="text-xs text-slate-400">低{{ activePriority.low }}</span>
          </div>
          <div class="mt-1 text-xs text-emerald-500">已完成 {{ todoDoneToday.length }}</div>
        </RouterLink>

        <RouterLink to="/workout" class="card animate-in p-4 hover:ring-2 hover:ring-brand-500/40">
          <div class="text-xs text-slate-400">运动打卡</div>
          <div class="mt-2 text-2xl font-semibold">{{ workoutCountToday }} 次</div>
          <div class="mt-1 truncate text-xs text-brand-500">{{ workoutPartsToday.join('·') || '暂无' }}</div>
        </RouterLink>

        <RouterLink to="/workout" class="card animate-in p-4 hover:ring-2 hover:ring-brand-500/40">
          <div class="text-xs text-slate-400">体重</div>
          <div class="mt-2 text-2xl font-semibold" v-if="latestWeight">{{ latestWeight.weight }}<span class="text-sm font-normal text-slate-400">kg</span></div>
          <div class="mt-2 text-2xl font-semibold text-slate-300" v-else>—</div>
          <div class="mt-1 truncate text-xs text-emerald-500">{{ latestWeight && latestWeight.body_fat != null ? '体脂 ' + latestWeight.body_fat + '%' : '去记录' }}</div>
        </RouterLink>

        <RouterLink to="/study" class="card animate-in p-4 hover:ring-2 hover:ring-brand-500/40">
          <div class="text-xs text-slate-400">学习评分</div>
          <div class="mt-2 text-2xl font-semibold">{{ studyToday.length ? '已练' : '—' }}</div>
          <div class="mt-1 text-xs text-violet-500">英 {{ avg(studyEn, 'score') }} · 粤 {{ avg(studyYue, 'score') }}</div>
        </RouterLink>

        <RouterLink to="/finance" class="card animate-in p-4 hover:ring-2 hover:ring-brand-500/40">
          <div class="text-xs text-slate-400">收支（今日）</div>
          <div class="mt-2 text-2xl font-semibold" :class="balanceToday >= 0 ? 'text-emerald-500' : 'text-rose-500'">
            ¥{{ balanceToday }}
          </div>
          <div class="mt-1 text-xs text-slate-400">收{{ incomeToday }} / 支{{ expenseToday }}</div>
        </RouterLink>

        <RouterLink to="/life" class="card animate-in p-4 hover:ring-2 hover:ring-brand-500/40">
          <div class="text-xs text-slate-400">提醒 / 纪念日</div>
          <div class="mt-2 text-2xl font-semibold">{{ upcomingAnniv.length + easyUndone }}</div>
          <div class="mt-1 truncate text-xs text-amber-500">
            {{ upcomingAnniv[0] ? `${upcomingAnniv[0].name} ${upcomingAnniv[0].d}天` : (easyUndone ? `${easyUndone} 件易忘` : '暂无') }}
          </div>
        </RouterLink>

        <RouterLink to="/assets" class="card animate-in p-4 hover:ring-2 hover:ring-brand-500/40 relative">
          <div v-if="assetReminders.length" class="absolute right-3 top-3 h-2 w-2 rounded-full bg-rose-500"></div>
          <div class="text-xs text-slate-400">资产提醒</div>
          <div class="mt-2 text-2xl font-semibold">{{ assetReminders.length }}</div>
          <div class="mt-1 truncate text-xs" :class="assetReminders.length ? 'text-rose-500' : 'text-slate-400'">
            {{ assetReminders[0] ? `${assetReminders[0].item.name} ${assetReminders[0].message}` : '无过期/过保/闲置' }}
          </div>
        </RouterLink>
      </div>
    </section>

    <!-- 每周统计 -->
    <section class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-slate-500 dark:text-slate-400">本周趋势</h2>
        <div class="flex flex-wrap gap-2 text-xs text-slate-400">
          <span v-for="h in compareHints" :key="h" class="chip bg-slate-100 dark:bg-slate-800">{{ h }}</span>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="card p-4">
          <div class="mb-2 text-sm font-medium">运动打卡趋势</div>
          <div class="h-44"><Line :data="workoutChart" :options="lineOpts" /></div>
        </div>
        <div class="card p-4">
          <div class="mb-2 text-sm font-medium">学习评分走势</div>
          <div class="h-44"><Line :data="studyChart" :options="lineOpts" /></div>
        </div>
        <div class="card p-4">
          <div class="mb-2 text-sm font-medium">收支分类（支出）</div>
          <div class="h-44"><Doughnut v-if="hasExpense" :data="pieChart" :options="pieOpts" /><div v-else class="flex h-full items-center justify-center text-sm text-slate-400">本周暂无支出</div></div>
        </div>
        <div class="card p-4">
          <div class="mb-2 text-sm font-medium">工作完成率（按优先级）</div>
          <div class="h-44"><Bar :data="workChart" :options="barOpts" /></div>
        </div>
      </div>

      <div class="card p-4" v-if="hasWorkoutParts">
        <div class="mb-2 text-sm font-medium">本周训练部位分布</div>
        <div class="flex flex-wrap gap-2">
          <span v-for="(n, cat) in workoutCatDist" :key="cat" class="chip bg-brand-500/10 text-brand-600 dark:text-brand-300">{{ cat }} · {{ n }}</span>
        </div>
      </div>

      <div class="card p-4" v-if="recentWeights.length">
        <div class="mb-2 text-sm font-medium">体重趋势（近 30 次）</div>
        <div class="h-44"><Line :data="weightChart" :options="weightLineOpts" /></div>
      </div>
    </section>
  </div>
</template>
