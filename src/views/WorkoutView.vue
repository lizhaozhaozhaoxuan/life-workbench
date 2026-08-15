<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import dayjs from 'dayjs'
import { Line } from 'vue-chartjs'
import { useCollection } from '@/composables/useCollection'
import Modal from '../components/Modal.vue'

const { items: videos, repo: vidRepo } = useCollection('workout_videos')
const { items: checkins, repo: chkRepo } = useCollection('workout_checkins')
const { items: weights, repo: wRepo } = useCollection('weight_logs')

const modalOpen = ref(false)
const form = ref({ id: '', title: '', url: '', category: '', duration_min: '' })
function openAdd() {
  form.value = { id: '', title: '', url: '', category: '', duration_min: '' }
  modalOpen.value = true
}
function editV(v: any) {
  form.value = { ...v, duration_min: v.duration_min ?? '' }
  modalOpen.value = true
}
async function save() {
  if (!form.value.title.trim() || !form.value.category.trim()) return
  const patch = { title: form.value.title.trim(), url: form.value.url || null, category: form.value.category.trim(), duration_min: form.value.duration_min ? Number(form.value.duration_min) : null }
  if (form.value.id) await vidRepo.update(form.value.id, patch)
  else await vidRepo.insert(patch)
  modalOpen.value = false
}
async function removeV(v: any) {
  if (confirm('删除该视频？相关打卡记录也会删除')) await vidRepo.remove(v.id)
}
async function checkIn(v: any) {
  await chkRepo.insert({ video_id: v.id })
}

const todayStr = dayjs().format('YYYY-MM-DD')
const checkinDates = computed(() => new Set(checkins.value.map((c) => dayjs(c.checked_at).format('YYYY-MM-DD'))))
const todayCount = computed(() => checkins.value.filter((c) => dayjs(c.checked_at).format('YYYY-MM-DD') === todayStr).length)
const streak = computed(() => {
  let n = 0
  let d = dayjs()
  if (!checkinDates.value.has(d.format('YYYY-MM-DD'))) d = d.subtract(1, 'day')
  while (checkinDates.value.has(d.format('YYYY-MM-DD'))) {
    n++
    d = d.subtract(1, 'day')
  }
  return n
})
const todayParts = computed(() => {
  const set = new Set(
    checkins.value
      .filter((c) => dayjs(c.checked_at).format('YYYY-MM-DD') === todayStr)
      .map((c) => videos.value.find((v) => v.id === c.video_id)?.category)
      .filter(Boolean)
  )
  return [...set]
})

function countByVideo(vid: string, days: number) {
  const since = dayjs().subtract(days - 1, 'day').format('YYYY-MM-DD')
  return checkins.value.filter((c) => c.video_id === vid && dayjs(c.checked_at).format('YYYY-MM-DD') >= since).length
}
function lastCheckin(vid: string) {
  const list = checkins.value.filter((c) => c.video_id === vid).sort((a, b) => (a.checked_at < b.checked_at ? 1 : -1))
  return list[0] ? dayjs(list[0].checked_at).format('MM-DD HH:mm') : '未打卡'
}

const catPresets = ['胸', '肩', '背', '腿', '体态', '核心', '有氧']

// ---- 视频库按训练部位筛选 ----
const selectedCat = ref('')
const catOptions = computed(() => {
  const set = new Set<string>()
  videos.value.forEach((v) => v.category && set.add(v.category.trim()))
  return [...set]
})
const filteredVideos = computed(() =>
  selectedCat.value ? videos.value.filter((v) => (v.category || '').trim() === selectedCat.value) : videos.value
)

// ---- 运动计时器（秒表 + 倒计时）----
type TimerMode = 'stopwatch' | 'countdown'
const timerMode = ref<TimerMode>('stopwatch')
const running = ref(false)
const elapsedMs = ref(0)          // 秒表累计毫秒
const laps = ref<number[]>([])    // 秒表计圈时间戳
const countdownTargetMs = ref(5 * 60 * 1000) // 倒计时目标
const remainingMs = ref(countdownTargetMs.value)
const finished = ref(false)
const presetMins = [1, 3, 5, 10, 20, 30]
const customMin = ref<number | null>(null) // 自定义倒计时分钟
let timerId: ReturnType<typeof setInterval> | null = null
let lastTick = 0

function fmtMs(ms: number) {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const cs = Math.floor((ms % 1000) / 10)
  const pad = (n: number, l = 2) => String(n).padStart(l, '0')
  return `${h > 0 ? pad(h) + ':' : ''}${pad(m)}:${pad(s)}.${pad(cs)}`
}
function tick() {
  const now = Date.now()
  const dt = now - lastTick
  lastTick = now
  if (timerMode.value === 'stopwatch') {
    elapsedMs.value += dt
  } else {
    remainingMs.value = Math.max(0, remainingMs.value - dt)
    if (remainingMs.value === 0) {
      stopTimer()
      finished.value = true
      notifyDone()
    }
  }
}
function loop() {
  lastTick = Date.now()
  timerId = setInterval(tick, 200)
}
function startTimer() {
  if (running.value) return
  ensureAudio() // 借用户点击手势解锁音频播放
  if (timerMode.value === 'countdown' && remainingMs.value === 0) remainingMs.value = countdownTargetMs.value
  running.value = true
  finished.value = false
  loop()
}
function pauseTimer() {
  running.value = false
  if (timerId) { clearInterval(timerId); timerId = null }
}
function stopTimer() {
  running.value = false
  if (timerId) { clearInterval(timerId); timerId = null }
}
function resetTimer() {
  stopTimer()
  if (timerMode.value === 'stopwatch') { elapsedMs.value = 0; laps.value = [] }
  else { remainingMs.value = countdownTargetMs.value; finished.value = false }
}
function toggleTimer() { running.value ? pauseTimer() : startTimer() }
function addLap() { if (timerMode.value === 'stopwatch') laps.value.push(elapsedMs.value) }
function setMode(m: TimerMode) {
  stopTimer()
  timerMode.value = m
  elapsedMs.value = 0
  laps.value = []
  remainingMs.value = countdownTargetMs.value
  finished.value = false
}
function setCountdown(min: number) {
  countdownTargetMs.value = min * 60 * 1000
  if (!running.value && timerMode.value === 'countdown') { remainingMs.value = countdownTargetMs.value; finished.value = false }
}
function applyCustom() {
  let v = Number(customMin.value)
  if (!v || v <= 0) return
  v = Math.min(600, Math.max(1, Math.round(v)))
  customMin.value = v
  setCountdown(v)
}
// 当前倒计时是否为非预设的自定义时长
const isCustomActive = computed(() => {
  const cur = countdownTargetMs.value / 60000
  return !presetMins.includes(cur) && Number(customMin.value) === cur
})
// ---- 倒计时结束声音提醒（Web Audio 合成，无需音频文件）----
let audioCtx: AudioContext | null = null
function ensureAudio() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctx) audioCtx = new Ctx()
    }
    // 浏览器要求用户手势后才能播放，启动时解锁
    if (audioCtx && audioCtx.state === 'suspended') void audioCtx.resume()
  } catch { /* 忽略音频异常 */ }
}
function beep(at: number, freq = 880, dur = 0.16) {
  if (!audioCtx) return
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  osc.connect(gain)
  gain.connect(audioCtx.destination)
  const t0 = audioCtx.currentTime + at
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(0.3, t0 + 0.01)
  gain.gain.linearRampToValueAtTime(0, t0 + dur)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}
function playChime() {
  ensureAudio()
  if (!audioCtx) return
  beep(0); beep(0.28); beep(0.56) // 连续响 3 声
}
function notifyDone() {
  playChime()
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('训练计时结束', { body: '倒计时已到时，休息一下吧！' })
    }
  } catch { /* 忽略通知异常 */ }
}
const displayMs = computed(() => (timerMode.value === 'stopwatch' ? elapsedMs.value : remainingMs.value))
onBeforeUnmount(() => { if (timerId) clearInterval(timerId) })


// ---- 体重 / 体成分管理 ----
const weightModal = ref(false)
const wForm = ref({ id: '', measured_at: '', weight: '', body_fat: '', water: '', protein: '', muscle: '', note: '' })
function openWeight() {
  wForm.value = {
    id: '',
    measured_at: dayjs().format('YYYY-MM-DDTHH:mm'),
    weight: '',
    body_fat: '',
    water: '',
    protein: '',
    muscle: '',
    note: ''
  }
  weightModal.value = true
}
function editWeight(w: any) {
  wForm.value = {
    id: w.id,
    measured_at: dayjs(w.measured_at).format('YYYY-MM-DDTHH:mm'),
    weight: String(w.weight ?? ''),
    body_fat: w.body_fat != null ? String(w.body_fat) : '',
    water: w.water != null ? String(w.water) : '',
    protein: w.protein != null ? String(w.protein) : '',
    muscle: w.muscle != null ? String(w.muscle) : '',
    note: w.note || ''
  }
  weightModal.value = true
}
async function saveWeight() {
  const weight = Number(wForm.value.weight)
  if (!weight || weight <= 0) return
  const patch: any = {
    measured_at: dayjs(wForm.value.measured_at || undefined).toISOString(),
    weight,
    body_fat: wForm.value.body_fat ? Number(wForm.value.body_fat) : null,
    water: wForm.value.water ? Number(wForm.value.water) : null,
    protein: wForm.value.protein ? Number(wForm.value.protein) : null,
    muscle: wForm.value.muscle ? Number(wForm.value.muscle) : null,
    note: wForm.value.note || null
  }
  if (wForm.value.id) await wRepo.update(wForm.value.id, patch)
  else await wRepo.insert(patch)
  weightModal.value = false
}
async function removeWeight(w: any) {
  if (confirm('删除这条体重记录？')) await wRepo.remove(w.id)
}

const sortedWeights = computed(() => [...weights.value].sort((a, b) => (a.measured_at < b.measured_at ? -1 : 1)))
const latestWeight = computed(() => sortedWeights.value[sortedWeights.value.length - 1] || null)
const recentWeights = computed(() => sortedWeights.value.slice(-30))
const weightChart = computed(() => ({
  labels: recentWeights.value.map((w) => dayjs(w.measured_at).format('MM-DD')),
  datasets: [{ label: '体重(kg)', data: recentWeights.value.map((w) => Number(w.weight)), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.15)', fill: true, tension: 0.35 }]
}))
const weightLineOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false } } }
</script>

<template>
  <div class="space-y-4">
    <div class="grid grid-cols-3 gap-3">
      <div class="card p-3 text-center"><div class="text-xs text-slate-400">今日打卡</div><div class="mt-1 text-2xl font-semibold">{{ todayCount }} 次</div></div>
      <div class="card p-3 text-center"><div class="text-xs text-slate-400">连续运动</div><div class="mt-1 text-2xl font-semibold text-brand-500">{{ streak }} 天</div></div>
      <div class="card p-3 text-center"><div class="text-xs text-slate-400">今日部位</div><div class="mt-1 truncate text-sm font-semibold">{{ todayParts.join('·') || '—' }}</div></div>
    </div>

    <!-- 运动计时器 -->
    <section class="card p-4" :class="finished ? 'ring-2 ring-emerald-500' : ''">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-slate-500 dark:text-slate-400">运动计时器</h2>
        <div class="flex gap-1 text-xs">
          <button class="chip transition" :class="timerMode === 'stopwatch' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'" @click="setMode('stopwatch')">秒表</button>
          <button class="chip transition" :class="timerMode === 'countdown' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'" @click="setMode('countdown')">倒计时</button>
        </div>
      </div>

      <div class="mt-3 text-center">
        <div class="font-mono text-5xl font-semibold tabular-nums tracking-tight" :class="finished ? 'text-emerald-500' : ''">{{ fmtMs(displayMs) }}</div>
        <p v-if="finished" class="mt-1 text-sm font-medium text-emerald-500">⏰ 时间到！</p>
        <p v-else-if="timerMode === 'countdown' && !running" class="mt-1 text-xs text-slate-400">选择时长后开始</p>
      </div>

      <div v-if="timerMode === 'countdown'" class="mt-3 flex flex-wrap items-center justify-center gap-2">
        <button
          v-for="m in presetMins"
          :key="m"
          class="chip transition"
          :class="countdownTargetMs === m * 60 * 1000 ? 'bg-violet-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'"
          @click="setCountdown(m); customMin = null"
        >{{ m }} 分</button>

        <!-- 自定义分钟 -->
        <div
          class="flex items-center gap-1 rounded-full border px-1 py-0.5 transition"
          :class="isCustomActive ? 'border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-300' : 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'"
        >
          <input
            v-model.number="customMin"
            type="number"
            min="1"
            max="600"
            step="1"
            placeholder="自定义"
            inputmode="numeric"
            class="w-16 bg-transparent text-center text-xs tabular-nums outline-none placeholder:text-slate-400"
            @keyup.enter="applyCustom"
            @change="applyCustom"
          />
          <span class="text-xs">分</span>
          <button
            class="rounded-full px-2 py-0.5 text-xs font-medium transition"
            :class="isCustomActive ? 'bg-violet-500 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200'"
            @click="applyCustom"
          >设定</button>
        </div>
      </div>

      <div class="mt-4 flex items-center justify-center gap-2">
        <button class="btn-primary px-6" @click="toggleTimer">{{ running ? '暂停' : (finished ? '重新开始' : '开始') }}</button>
        <button class="btn-ghost px-4" @click="resetTimer">重置</button>
        <button v-if="timerMode === 'stopwatch'" class="btn-ghost px-4" @click="addLap">计圈</button>
      </div>

      <div v-if="timerMode === 'stopwatch' && laps.length" class="mt-3 max-h-32 space-y-1 overflow-auto rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-800">
        <div v-for="(l, i) in laps" :key="i" class="flex justify-between"><span class="text-slate-400">第 {{ i + 1 }} 圈</span><span class="font-mono">{{ fmtMs(l) }}</span></div>
      </div>
    </section>

    <!-- 体重 / 体成分管理 -->
    <section class="space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-slate-500 dark:text-slate-400">体重 / 体成分</h2>
        <button class="btn-primary py-1.5 text-sm" @click="openWeight">+ 记录体重</button>
      </div>

      <div class="grid gap-3 lg:grid-cols-3">
        <div class="card p-4">
          <div class="text-xs text-slate-400">最新测量</div>
          <div class="mt-1 text-2xl font-semibold" v-if="latestWeight">{{ latestWeight.weight }} <span class="text-sm font-normal text-slate-400">kg</span></div>
          <div class="mt-1 text-xs text-slate-400" v-if="latestWeight">{{ dayjs(latestWeight.measured_at).format('YYYY-MM-DD HH:mm') }}</div>
          <div class="mt-3 grid grid-cols-2 gap-2 text-xs" v-if="latestWeight">
            <div class="rounded-lg bg-slate-50 p-2 dark:bg-slate-800"><span class="text-slate-400">体脂</span><div class="font-semibold">{{ latestWeight.body_fat != null ? latestWeight.body_fat + '%' : '—' }}</div></div>
            <div class="rounded-lg bg-slate-50 p-2 dark:bg-slate-800"><span class="text-slate-400">水分</span><div class="font-semibold">{{ latestWeight.water != null ? latestWeight.water + '%' : '—' }}</div></div>
            <div class="rounded-lg bg-slate-50 p-2 dark:bg-slate-800"><span class="text-slate-400">蛋白质</span><div class="font-semibold">{{ latestWeight.protein != null ? latestWeight.protein + '%' : '—' }}</div></div>
            <div class="rounded-lg bg-slate-50 p-2 dark:bg-slate-800"><span class="text-slate-400">肌肉量</span><div class="font-semibold">{{ latestWeight.muscle != null ? latestWeight.muscle + 'kg' : '—' }}</div></div>
          </div>
          <p v-if="!latestWeight" class="py-6 text-center text-sm text-slate-400">还没有记录</p>
        </div>

        <div class="card p-4 lg:col-span-2">
          <div class="mb-2 text-sm font-medium">体重趋势（近 30 次）</div>
          <div class="h-48"><Line v-if="recentWeights.length" :data="weightChart" :options="weightLineOpts" /><div v-else class="flex h-full items-center justify-center text-sm text-slate-400">记录后显示趋势</div></div>
        </div>
      </div>

      <div class="card p-4" v-if="sortedWeights.length">
        <div class="mb-2 text-sm font-medium">历史记录（{{ sortedWeights.length }} 条）</div>
        <div class="max-h-64 space-y-1 overflow-auto">
          <div v-for="w in [...sortedWeights].reverse()" :key="w.id" class="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
            <div class="text-sm">
              <span class="font-semibold">{{ w.weight }}kg</span>
              <span class="ml-2 text-xs text-slate-400">{{ dayjs(w.measured_at).format('MM-DD HH:mm') }}</span>
              <span class="ml-2 text-xs text-slate-400" v-if="w.body_fat != null">体脂{{ w.body_fat }}%</span>
              <span class="ml-1 text-xs text-slate-400" v-if="w.muscle != null">肌{{ w.muscle }}kg</span>
            </div>
            <div class="flex gap-3 text-xs">
              <button class="text-slate-300 hover:text-slate-500" @click="editWeight(w)">✎</button>
              <button class="text-slate-300 hover:text-rose-500" @click="removeWeight(w)">🗑</button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="flex items-center justify-between">
      <h2 class="text-sm font-semibold text-slate-500 dark:text-slate-400">跟练视频库</h2>
      <button class="btn-primary py-1.5 text-sm" @click="openAdd">+ 添加视频</button>
    </div>

    <div class="flex flex-wrap gap-2" v-if="catOptions.length">
      <button
        class="chip transition"
        :class="selectedCat === '' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'"
        @click="selectedCat = ''"
      >全部 ({{ videos.length }})</button>
      <button
        v-for="c in catOptions"
        :key="c"
        class="chip transition"
        :class="selectedCat === c ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'"
        @click="selectedCat = c"
      >{{ c }} ({{ videos.filter((v) => (v.category || '').trim() === c).length }})</button>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <div v-for="v in filteredVideos" :key="v.id" class="card p-4 animate-in">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <div class="truncate font-semibold">{{ v.title }}</div>
            <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span class="chip bg-brand-500/10 text-brand-600 dark:text-brand-300">{{ v.category }}</span>
              <span v-if="v.duration_min">⏱ {{ v.duration_min }} 分</span>
              <a v-if="v.url" :href="v.url" target="_blank" class="text-brand-500 hover:underline" @click.stop>链接 ↗</a>
            </div>
          </div>
          <button class="text-slate-300 hover:text-slate-500" @click="editV(v)">✎</button>
        </div>
        <div class="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
          <div class="text-xs text-slate-400">
            本周 {{ countByVideo(v.id, 7) }} · 本月 {{ countByVideo(v.id, 30) }}<br />最近 {{ lastCheckin(v.id) }}
          </div>
          <button class="btn-primary px-3 py-1.5 text-sm" @click="checkIn(v)">打卡</button>
        </div>
      </div>
      <p v-if="!filteredVideos.length" class="col-span-full py-10 text-center text-sm text-slate-400">{{ selectedCat ? '该训练部位暂无视频' : '还没有视频，点击右上角添加' }}</p>
    </div>

    <Modal :open="modalOpen" :title="form.id ? '编辑视频' : '添加跟练视频'" @close="modalOpen = false">
      <div class="space-y-3">
        <div><label class="label">标题</label><input v-model="form.title" class="input" placeholder="如 胸肌轰炸 20 分钟" /></div>
        <div><label class="label">训练部位</label><input v-model="form.category" class="input" list="cat-list" placeholder="如 胸" /><datalist id="cat-list"><option v-for="c in catPresets" :key="c" :value="c" /></datalist></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label">视频链接</label><input v-model="form.url" class="input" placeholder="B站/YouTube" /></div>
          <div><label class="label">建议时长(分)</label><input v-model="form.duration_min" type="number" class="input" /></div>
        </div>
        <div class="flex justify-end gap-2 pt-1">
          <button v-if="form.id" class="btn-danger mr-auto" @click="removeV({ id: form.id }); modalOpen = false">删除</button>
          <button class="btn-ghost" @click="modalOpen = false">取消</button>
          <button class="btn-primary" @click="save">保存</button>
        </div>
      </div>
    </Modal>

    <Modal :open="weightModal" :title="wForm.id ? '编辑体重记录' : '记录体重 / 体成分'" @close="weightModal = false">
      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label">测量时间</label><input v-model="wForm.measured_at" type="datetime-local" class="input" /></div>
          <div><label class="label">体重 (kg) *</label><input v-model="wForm.weight" type="number" step="0.1" class="input" placeholder="如 68.5" /></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label">体脂率 (%)</label><input v-model="wForm.body_fat" type="number" step="0.1" class="input" placeholder="可选" /></div>
          <div><label class="label">水分 (%)</label><input v-model="wForm.water" type="number" step="0.1" class="input" placeholder="可选" /></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label">蛋白质 (%)</label><input v-model="wForm.protein" type="number" step="0.1" class="input" placeholder="可选" /></div>
          <div><label class="label">肌肉量 (kg)</label><input v-model="wForm.muscle" type="number" step="0.1" class="input" placeholder="可选" /></div>
        </div>
        <div><label class="label">备注</label><input v-model="wForm.note" class="input" placeholder="如 晨起空腹" /></div>
        <div class="flex justify-end gap-2 pt-1">
          <button class="btn-ghost" @click="weightModal = false">取消</button>
          <button class="btn-primary" @click="saveWeight">保存</button>
        </div>
      </div>
    </Modal>
  </div>
</template>
