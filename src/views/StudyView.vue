<script setup lang="ts">
import { ref, computed } from 'vue'
import dayjs from 'dayjs'
import { Line } from 'vue-chartjs'
import { useCollection } from '@/composables/useCollection'
import Modal from '../components/Modal.vue'

const innerTab = ref<'lang' | 'routes' | 'sites'>('lang')

// ================= 语言跟练 =================
const langTab = ref<'en' | 'yue'>('en')
const { items: langSessions, repo: langRepo } = useCollection('study_lang_sessions')

const scenarios: Record<string, string[]> = {
  en: ['Shop assistant: What can I get for you?\nYou: I’d like a medium latte, please.', 'A: Excuse me, how do I get to the station?\nB: Go straight and turn left at the corner.', 'Hi, I’m Alex. Nice to meet you!'],
  yue: ['店员：睇啲咩呀？\n你：畀杯冻柠茶我啦，唔该。', 'A：唔该，车站点去呀？\nB：直行然后左转就到。', '你好，我姓李，幸会幸会！']
}
const practiceText = ref(scenarios.en[0])
function pickScenario(s: string) {
  practiceText.value = s
}
const score = ref(4)
async function saveSession(mode: 'self' | 'auto') {
  await langRepo.insert({ lang: langTab.value, scenario: practiceText.value.slice(0, 40), score: score.value, mode })
}
const speechCfg = !!(import.meta.env.VITE_SPEECH_API_URL && import.meta.env.VITE_SPEECH_API_KEY)
async function speechScore() {
  if (!speechCfg) {
    alert('未配置语音评测 API（VITE_SPEECH_API_URL / KEY）。\n可在此处接入录音(MediaRecorder)+上传评测服务，目前请使用手动评分。')
    return
  }
  // 集成点：此处用 MediaRecorder 录音并 POST 到 VITE_SPEECH_API_URL，
  // 解析返回的分数后赋值 score.value。占位提示：
  alert('语音评测已配置。请将录音→上传→解析分数的逻辑补充在此处。')
}

const sessionDates = computed(() => new Set(langSessions.value.filter((s) => s.lang === langTab.value).map((s) => s.session_date)))
const sessionByDate = computed(() => Object.fromEntries(langSessions.value.filter((s) => s.lang === langTab.value).map((s) => [s.session_date, s])))
const calCells = computed(() => {
  const first = dayjs().date(1)
  const startDay = first.day()
  const dim = first.daysInMonth()
  const cells: (number | null)[] = []
  for (let i = 0; i < startDay; i++) cells.push(null)
  for (let d = 1; d <= dim; d++) cells.push(d)
  return cells
})
const langStreak = computed(() => {
  let n = 0
  let d = dayjs()
  if (!sessionDates.value.has(d.format('YYYY-MM-DD'))) d = d.subtract(1, 'day')
  while (sessionDates.value.has(d.format('YYYY-MM-DD'))) {
    n++
    d = d.subtract(1, 'day')
  }
  return n
})
const trend = computed(() => {
  const arr: (number | null)[] = []
  const labels: string[] = []
  for (let i = 29; i >= 0; i--) {
    const date = dayjs().subtract(i, 'day').format('YYYY-MM-DD')
    labels.push(dayjs(date).format('M/D'))
    const s = sessionByDate.value[date]
    arr.push(s ? s.score : null)
  }
  return { labels, arr }
})
const trendData = computed(() => ({
  labels: trend.value.labels,
  datasets: [{ label: '评分', data: trend.value.arr, borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.12)', fill: true, tension: 0.35, spanGaps: true }]
}))
const lineOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 5, ticks: { stepSize: 1 } } } }

// ================= 计算机路线 =================
const { items: routes, repo: routeRepo } = useCollection('study_routes')
const { items: nodes, repo: nodeRepo } = useCollection('study_route_nodes')
const selectedRoute = ref('')
const routeModal = ref(false)
const routeForm = ref({ id: '', name: '', description: '' })
const nodeModal = ref(false)
const nodeForm = ref({ id: '', title: '', status: 'todo' })

function openRoute() {
  routeForm.value = { id: '', name: '', description: '' }
  routeModal.value = true
}
function editRoute(r: any) {
  routeForm.value = { ...r }
  routeModal.value = true
}
async function saveRoute() {
  if (!routeForm.value.name.trim()) return
  const patch = { name: routeForm.value.name.trim(), description: routeForm.value.description || null }
  if (routeForm.value.id) await routeRepo.update(routeForm.value.id, patch)
  else await routeRepo.insert(patch)
  routeModal.value = false
}
async function removeRoute() {
  await routeRepo.remove(routeForm.value.id)
  routeModal.value = false
  if (selectedRoute.value === routeForm.value.id) selectedRoute.value = ''
}
const routeNodes = computed(() => nodes.value.filter((n) => n.route_id === selectedRoute.value).sort((a, b) => a.position - b.position))
const routeProgress = computed(() => {
  const list = routeNodes.value
  if (!list.length) return 0
  return Math.round((list.filter((n) => n.status === 'done').length / list.length) * 100)
})
function openNode() {
  nodeForm.value = { id: '', title: '', status: 'todo' }
  nodeModal.value = true
}
async function saveNode() {
  if (!nodeForm.value.title.trim()) return
  const patch = { route_id: selectedRoute.value, title: nodeForm.value.title.trim(), status: nodeForm.value.status, position: routeNodes.value.length }
  if (nodeForm.value.status === 'done') patch.completed_at = new Date().toISOString()
  await nodeRepo.insert(patch)
  nodeModal.value = false
}
async function setNodeStatus(n: any, status: string) {
  const patch: any = { status }
  if (status === 'done') patch.completed_at = new Date().toISOString()
  else patch.completed_at = null
  await nodeRepo.update(n.id, patch)
}
async function removeNode(n: any) {
  await nodeRepo.remove(n.id)
}

// ================= 自定义站点 =================
const { items: sites, repo: siteRepo } = useCollection('study_sites')
const siteModal = ref(false)
const siteForm = ref({ id: '', title: '', url: '', category: '' })
function openSite() {
  siteForm.value = { id: '', title: '', url: '', category: '' }
  siteModal.value = true
}
function editSite(s: any) {
  siteForm.value = { ...s }
  siteModal.value = true
}
async function saveSite() {
  if (!siteForm.value.title.trim() || !siteForm.value.url.trim()) return
  const patch = { title: siteForm.value.title.trim(), url: siteForm.value.url.trim(), category: siteForm.value.category || '文档' }
  if (siteForm.value.id) await siteRepo.update(siteForm.value.id, patch)
  else await siteRepo.insert(patch)
  siteModal.value = false
}
async function checkInSite(s: any) {
  await siteRepo.update(s.id, { last_studied: dayjs().format('YYYY-MM-DD') })
}
async function removeSite() {
  await siteRepo.remove(siteForm.value.id)
  siteModal.value = false
}
const siteCats = ['文档', '视频', '实战', '社区']
</script>

<template>
  <div class="space-y-4">
    <div class="flex rounded-xl border border-slate-200 p-0.5 dark:border-slate-700 w-fit">
      <button class="rounded-lg px-4 py-1.5 text-sm" :class="innerTab === 'lang' ? 'bg-brand-600 text-white' : 'text-slate-500'" @click="innerTab = 'lang'">语言跟练</button>
      <button class="rounded-lg px-4 py-1.5 text-sm" :class="innerTab === 'routes' ? 'bg-brand-600 text-white' : 'text-slate-500'" @click="innerTab = 'routes'">计算机路线</button>
      <button class="rounded-lg px-4 py-1.5 text-sm" :class="innerTab === 'sites' ? 'bg-brand-600 text-white' : 'text-slate-500'" @click="innerTab = 'sites'">学习站点</button>
    </div>

    <!-- 语言跟练 -->
    <div v-if="innerTab === 'lang'" class="space-y-4">
      <div class="flex gap-2">
        <button class="chip" :class="langTab === 'en' ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800'" @click="langTab = 'en'; practiceText = scenarios.en[0]">英语</button>
        <button class="chip" :class="langTab === 'yue' ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800'" @click="langTab = 'yue'; practiceText = scenarios.yue[0]">粤语</button>
        <span class="chip bg-violet-500/10 text-violet-500">连续 {{ langStreak }} 天</span>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="card p-4 space-y-3">
          <div class="text-sm font-medium">场景脚本</div>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="s in scenarios[langTab]" :key="s" class="chip bg-slate-100 dark:bg-slate-800" @click="pickScenario(s)">场景{{ scenarios[langTab].indexOf(s) + 1 }}</button>
          </div>
          <textarea v-model="practiceText" rows="5" class="input"></textarea>
          <div>
            <div class="mb-1 text-xs text-slate-400">本次评分</div>
            <div class="flex gap-1">
              <button v-for="n in 5" :key="n" class="text-2xl" :class="n <= score ? 'text-amber-400' : 'text-slate-300'" @click="score = n">★</button>
            </div>
          </div>
          <div class="flex gap-2">
            <button class="btn-primary flex-1" @click="saveSession('self')">完成练习（手动评分）</button>
            <button class="btn-ghost" @click="speechScore">🎤 语音评测</button>
          </div>
        </div>

        <div class="space-y-4">
          <div class="card p-4">
            <div class="mb-2 text-sm font-medium">评分走势（近 30 天）</div>
            <div class="h-40"><Line :data="trendData" :options="lineOpts" /></div>
          </div>
          <div class="card p-4">
            <div class="mb-2 text-sm font-medium">{{ dayjs().format('YYYY年M月') }} 练习日历</div>
            <div class="grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
              <div v-for="w in ['日','一','二','三','四','五','六']" :key="w">{{ w }}</div>
              <div v-for="(c, i) in calCells" :key="i" class="aspect-square rounded-lg text-sm flex items-center justify-center"
                :class="c ? (sessionByDate[c ? dayjs().format('YYYY-MM')+'-'+String(c).padStart(2,'0') : ''] ? 'bg-violet-500/15 text-violet-600 font-semibold' : 'bg-slate-50 dark:bg-slate-800/50') : ''">
                <span v-if="c">{{ c }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 计算机路线 -->
    <div v-else-if="innerTab === 'routes'" class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-slate-500 dark:text-slate-400">学习路线</h2>
        <button class="btn-primary py-1.5 text-sm" @click="openRoute">+ 新建路线</button>
      </div>
      <div class="grid gap-3 md:grid-cols-3">
        <div class="space-y-2 md:col-span-1">
          <div v-for="r in routes" :key="r.id" class="card cursor-pointer p-3" :class="selectedRoute === r.id ? 'ring-2 ring-brand-500/40' : ''" @click="selectedRoute = r.id">
            <div class="font-medium">{{ r.name }}</div>
            <div class="mt-0.5 truncate text-xs text-slate-400">{{ r.description }}</div>
          </div>
          <p v-if="!routes.length" class="py-4 text-sm text-slate-400">还没有路线</p>
        </div>
        <div class="card p-4 md:col-span-2" v-if="selectedRoute">
          <div class="mb-3 flex items-center justify-between">
            <div>
              <div class="font-semibold">{{ routes.find((r) => r.id === selectedRoute)?.name }}</div>
              <div class="text-xs text-slate-400">进度 {{ routeProgress }}%</div>
            </div>
            <button class="btn-ghost py-1 text-xs" @click="openNode">+ 节点</button>
          </div>
          <div class="mb-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div class="h-full bg-brand-600 transition-all" :style="{ width: routeProgress + '%' }"></div>
          </div>
          <div class="space-y-2">
            <div v-for="n in routeNodes" :key="n.id" class="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
              <button class="flex h-5 w-5 items-center justify-center rounded-md border-2" :class="n.status === 'done' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 dark:border-slate-600'" @click="setNodeStatus(n, n.status === 'done' ? 'todo' : 'done')">{{ n.status === 'done' ? '✓' : '' }}</button>
              <span class="flex-1 text-sm" :class="n.status === 'done' ? 'line-through text-slate-400' : ''">{{ n.title }}</span>
              <button class="text-xs text-slate-400 hover:text-brand-500" @click="setNodeStatus(n, 'doing')">进行中</button>
              <button class="text-slate-300 hover:text-rose-500" @click="removeNode(n)">🗑</button>
            </div>
            <p v-if="!routeNodes.length" class="py-3 text-sm text-slate-400">暂无节点，点击「+ 节点」添加</p>
          </div>
        </div>
        <div class="card p-4 text-sm text-slate-400 md:col-span-2" v-else>请选择左侧路线查看节点</div>
      </div>
    </div>

    <!-- 学习站点 -->
    <div v-else class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-slate-500 dark:text-slate-400">自定义学习站点</h2>
        <button class="btn-primary py-1.5 text-sm" @click="openSite">+ 添加</button>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div v-for="s in sites" :key="s.id" class="card p-4">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <div class="truncate font-semibold">{{ s.title }}</div>
              <div class="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
                <span class="chip bg-slate-100 dark:bg-slate-800">{{ s.category }}</span>
                <span v-if="s.last_studied">最近 {{ s.last_studied }}</span>
              </div>
            </div>
            <button class="text-slate-300 hover:text-slate-500" @click="editSite(s)">✎</button>
          </div>
          <div class="mt-3 flex gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <a :href="s.url" target="_blank" class="btn-ghost flex-1 py-1.5 text-sm">打开 ↗</a>
            <button class="btn-primary flex-1 py-1.5 text-sm" @click="checkInSite(s)">今日打卡</button>
          </div>
        </div>
        <p v-if="!sites.length" class="col-span-full py-10 text-center text-sm text-slate-400">还没有站点</p>
      </div>
    </div>

    <!-- 路线 Modal -->
    <Modal :open="routeModal" :title="routeForm.id ? '编辑路线' : '新建路线'" @close="routeModal = false">
      <div class="space-y-3">
        <div><label class="label">名称</label><input v-model="routeForm.name" class="input" placeholder="如 前端进阶" /></div>
        <div><label class="label">描述</label><textarea v-model="routeForm.description" class="input" rows="2"></textarea></div>
        <div class="flex justify-end gap-2">
          <button v-if="routeForm.id" class="btn-danger mr-auto" @click="removeRoute">删除</button>
          <button class="btn-ghost" @click="routeModal = false">取消</button>
          <button class="btn-primary" @click="saveRoute">保存</button>
        </div>
      </div>
    </Modal>

    <!-- 节点 Modal -->
    <Modal :open="nodeModal" title="添加节点" @close="nodeModal = false">
      <div class="space-y-3">
        <div><label class="label">知识点 / 章节</label><input v-model="nodeForm.title" class="input" placeholder="如 Promise 异步" @keyup.enter="saveNode" /></div>
        <div class="flex justify-end gap-2">
          <button class="btn-ghost" @click="nodeModal = false">取消</button>
          <button class="btn-primary" @click="saveNode">添加</button>
        </div>
      </div>
    </Modal>

    <!-- 站点 Modal -->
    <Modal :open="siteModal" :title="siteForm.id ? '编辑站点' : '添加站点'" @close="siteModal = false">
      <div class="space-y-3">
        <div><label class="label">标题</label><input v-model="siteForm.title" class="input" /></div>
        <div><label class="label">链接</label><input v-model="siteForm.url" class="input" placeholder="https://" /></div>
        <div><label class="label">分类</label>
          <select v-model="siteForm.category" class="input"><option v-for="c in siteCats" :key="c" :value="c">{{ c }}</option></select>
        </div>
        <div class="flex justify-end gap-2">
          <button v-if="siteForm.id" class="btn-danger mr-auto" @click="removeSite">删除</button>
          <button class="btn-ghost" @click="siteModal = false">取消</button>
          <button class="btn-primary" @click="saveSite">保存</button>
        </div>
      </div>
    </Modal>
  </div>
</template>
