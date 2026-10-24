<script setup lang="ts">
import { ref, computed } from 'vue'
import dayjs from 'dayjs'
import { Doughnut, Line } from 'vue-chartjs'
import { useCollection } from '@/composables/useCollection'
import Modal from '../components/Modal.vue'
import { fetchStockQuote } from '@/lib/stock'
import { analyzeStock } from '@/lib/indicators'

/** 金额四舍五入到分，规避浮点累加误差（如 0.1+0.2=0.30000000000000004） */
function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}
/** 转为「分」整数，用于精确累加，保证分类汇总与总额严格相等 */
function toCents(n: number): number {
  return Math.round(Number(n) * 100)
}

// 收支分类预设：按「支出 / 收入」分两套，避免记支出时蹦出「工资」之类收入项
const EXPENSE_PRESETS = ['餐饮','交通','购物','居家','医疗','话费','礼物','学习','娱乐','服饰','旅行','社交','订阅','数码','美容','宠物','保险','其他']
const INCOME_PRESETS = ['工资','理财','兼职','红包','退款','其他']
// 合并用户历史上手填过的分类（同类型才出现），避免重复录入又保留自定义
const usedCats = computed(() => {
  const m = new Map<string, string>() // category -> type
  tx.value.forEach((t) => { if (t.category) m.set(t.category, t.type) })
  return m
})
const catOptions = computed(() => {
  const presets = flowForm.value.type === 'expense' ? EXPENSE_PRESETS : INCOME_PRESETS
  const used = [...usedCats.value.entries()]
    .filter(([, ty]) => ty === flowForm.value.type)
    .map(([c]) => c)
  return [...new Set([...presets, ...used])]
})

const { items: tx, repo: txRepo } = useCollection('transactions')
const { items: accounts, repo: accRepo } = useCollection('asset_accounts')
const { items: golds, repo: goldRepo } = useCollection('asset_gold')
const { items: stocks, repo: stockRepo } = useCollection('asset_stocks')
const { items: liabilities, repo: liabRepo } = useCollection('asset_liabilities')
const { items: snapshots, repo: snapRepo } = useCollection('asset_snapshots')

const mode = ref<'flow' | 'asset'>('flow')
const month = ref(dayjs().format('YYYY-MM'))

// ---- 收支 ----
const flowForm = ref({ type: 'expense', amount: '', category: '', note: '', trans_date: dayjs().format('YYYY-MM-DD') })
async function addTx() {
  const amt = Number(flowForm.value.amount)
  if (!amt || amt <= 0) return
  await txRepo.insert({
    type: flowForm.value.type,
    amount: amt,
    category: flowForm.value.category.trim() || '其他',
    note: flowForm.value.note,
    trans_date: flowForm.value.trans_date
  })
  flowForm.value = { type: 'expense', amount: '', category: '', note: '', trans_date: dayjs().format('YYYY-MM-DD') }
}
async function removeTx(t: any) {
  if (confirm('删除该笔记录？')) await txRepo.remove(t.id)
}
const monthTx = computed(() => tx.value.filter((t) => t.trans_date.startsWith(month.value)).sort((a, b) => (a.trans_date < b.trans_date ? 1 : -1)))
// 用「分」整数累加，避免浮点误差，并保证「各分类之和 === 本月支出总额」
const monthIncome = computed(() => {
  const cents = monthTx.value.filter((t) => t.type === 'income').reduce((a, b) => a + toCents(b.amount), 0)
  return round2(cents / 100)
})
const monthExpense = computed(() => {
  const cents = monthTx.value.filter((t) => t.type === 'expense').reduce((a, b) => a + toCents(b.amount), 0)
  return round2(cents / 100)
})
// 收支分类环形图：按当前 breakdownType（支出/收入）聚合；点击分类可下钻筛选流水
const breakdownType = ref<'expense' | 'income'>('expense')
const selectedCat = ref<string | null>(null)
const catPie = computed(() => {
  // 内部以「分」累加，最后统一转「元」，确保分类汇总与总额严格相等
  const centsMap: Record<string, number> = {}
  monthTx.value.filter((t) => t.type === breakdownType.value).forEach((t) => {
    centsMap[t.category] = (centsMap[t.category] || 0) + toCents(t.amount)
  })
  const out: Record<string, number> = {}
  for (const k of Object.keys(centsMap)) out[k] = round2(centsMap[k] / 100)
  return out
})
const hasCatData = computed(() => Object.keys(catPie.value).length > 0)
const PIE_COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#6366f1', '#a855f7', '#22c55e', '#eab308', '#06b6d4']
const pieData = computed(() => {
  const labels = Object.keys(catPie.value)
  const data = Object.values(catPie.value)
  // 选中分类时，其余切片半透明，突出当前选中项
  const backgroundColor = labels.map((c, i) =>
    selectedCat.value && selectedCat.value !== c ? PIE_COLORS[i % PIE_COLORS.length] + '55' : PIE_COLORS[i % PIE_COLORS.length]
  )
  return { labels, datasets: [{ data, backgroundColor, borderColor: '#fff', borderWidth: 2 }] }
})
const pieOpts = {
  responsive: true,
  maintainAspectRatio: false,
  // 点击分类切片 -> 选中/取消该分类，下钻流水列表
  onClick: (_e: any, elements: any[]) => {
    if (!elements.length) return
    const cat = (pieData.value.labels as string[])[elements[0].index]
    selectedCat.value = selectedCat.value === cat ? null : cat
  },
  plugins: { legend: { position: 'right' as const, labels: { boxWidth: 12 } } }
}
// 流水列表：选中分类时仅显示该分类（否则显示全月）
const visibleTx = computed(() =>
  selectedCat.value ? monthTx.value.filter((t) => t.category === selectedCat.value) : monthTx.value
)
function clearCatFilter() { selectedCat.value = null }
function switchBreakdown(t: 'expense' | 'income') {
  breakdownType.value = t
  selectedCat.value = null // 切换收支维度时清空筛选，避免支出/收入串类
}

// ---- 资产 ----
const cashTotal = computed(() => round2(accounts.value.reduce((a, b) => a + Number(b.balance), 0)))
const goldValue = computed(() => round2(golds.value.reduce((a, g) => a + Number(g.grams) * Number(g.price_per_gram), 0)))
const stockValue = computed(() => round2(stocks.value.reduce((a, s) => a + Number(s.shares) * Number(s.current_price), 0)))
const investTotal = computed(() => round2(goldValue.value + stockValue.value))
const receivableTotal = computed(() => {
  const cents = liabilities.value.filter((l) => l.kind === 'receivable').reduce((a, b) => a + toCents(b.balance), 0)
  return round2(cents / 100)
})
const payableTotal = computed(() => {
  const cents = liabilities.value.filter((l) => l.kind !== 'receivable').reduce((a, b) => a + toCents(b.balance), 0)
  return round2(cents / 100)
})
// 总资产 = 现金 + 投资 + 应收；净资产 = 总资产 − 总负债(应付)
const assetTotal = computed(() => round2(cashTotal.value + investTotal.value + receivableTotal.value))
const liabilityTotal = computed(() => payableTotal.value)
const netWorth = computed(() => round2(assetTotal.value - liabilityTotal.value))

const kindLabel: Record<string, string> = { bank: '银行卡', wechat: '微信', alipay: '支付宝', cash: '现金', other: '其他' }
const kindIcon: Record<string, string> = { bank: '🏦', wechat: '💬', alipay: '🔵', cash: '💵', other: '📦' }
const liabKindLabel: Record<string, string> = { credit_card: '信用卡', payable: '借款(我欠)', receivable: '应收(别人欠我)' }
const liabKindIcon: Record<string, string> = { credit_card: '💳', payable: '📤', receivable: '📥' }

// 占比图（现金/投资/应收）
const ratioData = computed(() => ({
  labels: ['现金类', '投资类', '应收类'],
  datasets: [{ data: [cashTotal.value, investTotal.value, receivableTotal.value], backgroundColor: ['#0ea5e9', '#8b5cf6', '#10b981'] }]
}))

// 快照趋势（总资产 + 净资产双线）
function startOfWeek(d = new Date()): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  return x
}
const thisWeekStart = dayjs(startOfWeek())
const thisWeekEnd = thisWeekStart.add(6, 'day')
const lastWeekStart = thisWeekStart.subtract(7, 'day')
const lastWeekEnd = thisWeekStart.subtract(1, 'day')
const thisWeekStartStr = thisWeekStart.format('YYYY-MM-DD')
const thisWeekEndStr = thisWeekEnd.format('YYYY-MM-DD')
const lastWeekStartStr = lastWeekStart.format('YYYY-MM-DD')
const lastWeekEndStr = lastWeekEnd.format('YYYY-MM-DD')
const snapSorted = computed(() => [...snapshots.value].sort((a, b) => (a.snapshot_date < b.snapshot_date ? -1 : 1)))
const snapData = computed(() => ({
  labels: snapSorted.value.map((s) => s.snapshot_date.slice(5)),
  datasets: [
    { label: '总资产', data: snapSorted.value.map((s) => Number(s.total) || 0), borderColor: '#0ea5e9', backgroundColor: 'rgba(14,165,233,0.15)', fill: true, tension: 0.35 },
    { label: '净资产', data: snapSorted.value.map((s) => Number(s.net) || 0), borderColor: '#10b981', borderDash: [5, 4], fill: false, tension: 0.35 }
  ]
}))
const lineOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom' as const } }, scales: { y: { beginAtZero: false } } }

// 周度对比（本周最新快照 vs 上周最新快照）
const snapThisWeek = computed(() => {
  const arr = snapSorted.value.filter((s) => s.snapshot_date >= thisWeekStartStr && s.snapshot_date <= thisWeekEndStr)
  return arr.length ? arr[arr.length - 1] : null
})
const snapLastWeek = computed(() => {
  const arr = snapSorted.value.filter((s) => s.snapshot_date >= lastWeekStartStr && s.snapshot_date <= lastWeekEndStr)
  return arr.length ? arr[arr.length - 1] : null
})
const weekCompare = computed(() => {
  const a = snapThisWeek.value
  const b = snapLastWeek.value
  if (!a || !b) return null
  return {
    dTotal: round2((Number(a.total) || 0) - (Number(b.total) || 0)),
    dNet: round2((Number(a.net) || 0) - (Number(b.net) || 0)),
    dLiability: round2((Number(a.liability) || 0) - (Number(b.liability) || 0))
  }
})

async function recordSnapshot() {
  const today = dayjs().format('YYYY-MM-DD')
  const payload = {
    snapshot_date: today,
    total: assetTotal.value,
    cash: cashTotal.value,
    invest: investTotal.value,
    liability: liabilityTotal.value,
    net: netWorth.value
  }
  try {
    // 幂等：今天已记录则更新当天那条，避免重复插入触发唯一约束冲突
    const existing = snapshots.value.find((s) => s.snapshot_date === today)
    if (existing) {
      await snapRepo.update(existing.id, payload)
    } else {
      await snapRepo.insert(payload)
    }
  } catch (e: any) {
    const msg = e?.message || (typeof e === 'string' ? e : '未知错误')
    alert('记录快照失败：' + msg)
  }
}

// ---- 资产编辑 Modal ----
type EditType = 'account' | 'gold' | 'stock' | null
const editType = ref<EditType>(null)
const assetForm = ref<any>({})
function openAccount(kind = 'bank') {
  editType.value = 'account'
  assetForm.value = { id: '', kind, name: '', tail_no: '', balance: 0 }
}
function openGold() {
  editType.value = 'gold'
  assetForm.value = { id: '', name: '黄金', grams: 0, price_per_gram: 0 }
}
function openStock() {
  editType.value = 'stock'
  assetForm.value = { id: '', code: '', name: '', shares: 0, cost_price: 0, current_price: 0 }
}
function openLiability(kind = 'credit_card') {
  editType.value = 'liability'
  assetForm.value = { id: '', kind, name: '', tail_no: '', credit_limit: 0, balance: 0, due_date: '', note: '' }
}
function editAccount(a: any) {
  editType.value = 'account'
  assetForm.value = { ...a }
}
function editGold(g: any) {
  editType.value = 'gold'
  assetForm.value = { ...g }
}
function editStock(s: any) {
  editType.value = 'stock'
  assetForm.value = { ...s }
}
function editLiability(l: any) {
  editType.value = 'liability'
  assetForm.value = { ...l }
}
async function saveAsset() {
  const f = assetForm.value
  if (editType.value === 'account') {
    const patch = { kind: f.kind, name: f.name, tail_no: f.tail_no || null, balance: Number(f.balance) || 0 }
    f.id ? await accRepo.update(f.id, patch) : await accRepo.insert(patch)
  } else if (editType.value === 'gold') {
    const patch = { name: f.name, grams: Number(f.grams) || 0, price_per_gram: Number(f.price_per_gram) || 0 }
    f.id ? await goldRepo.update(f.id, patch) : await goldRepo.insert(patch)
  } else if (editType.value === 'stock') {
    const patch = { code: f.code, name: f.name || null, shares: Number(f.shares) || 0, cost_price: Number(f.cost_price) || 0, current_price: Number(f.current_price) || 0 }
    f.id ? await stockRepo.update(f.id, patch) : await stockRepo.insert(patch)
  } else if (editType.value === 'liability') {
    const patch = {
      kind: f.kind,
      name: f.name,
      tail_no: f.kind === 'credit_card' ? f.tail_no || null : null,
      credit_limit: f.kind === 'credit_card' ? Number(f.credit_limit) || 0 : null,
      balance: Number(f.balance) || 0,
      due_date: f.due_date || null,
      note: f.note || null
    }
    f.id ? await liabRepo.update(f.id, patch) : await liabRepo.insert(patch)
  }
  editType.value = null
}
async function removeCurrent() {
  const f = assetForm.value
  if (editType.value === 'account') await accRepo.remove(f.id)
  else if (editType.value === 'gold') await goldRepo.remove(f.id)
  else if (editType.value === 'stock') await stockRepo.remove(f.id)
  else if (editType.value === 'liability') await liabRepo.remove(f.id)
  editType.value = null
}
const loadingStock = ref<string | null>(null)
const expandedStock = ref<string | null>(null)
const analysis = ref<Record<string, any>>({})

async function refreshStock(s: any) {
  loadingStock.value = s.id
  expandedStock.value = s.id
  try {
    const q = await fetchStockQuote(s.code)
    if (q.ok && q.price != null) {
      const patch: Record<string, unknown> = { current_price: q.price }
      if (q.name && !s.name) patch.name = q.name
      await stockRepo.update(s.id, patch)
    }
    analysis.value[s.id] =
      q.ok && q.klines && q.klines.length >= 30
        ? analyzeStock(q, Number(s.cost_price) || undefined)
        : { ok: false, error: q.error || 'K线数据不足，无法计算技术指标（可能未部署 Edge Function 代理）。' }
  } catch (e: any) {
    analysis.value[s.id] = { ok: false, error: e?.message || '行情获取异常' }
  } finally {
    loadingStock.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex rounded-xl border border-slate-200 p-0.5 dark:border-slate-700 w-fit">
      <button class="rounded-lg px-4 py-1.5 text-sm" :class="mode === 'flow' ? 'bg-brand-600 text-white' : 'text-slate-500'" @click="mode = 'flow'">收支流水</button>
      <button class="rounded-lg px-4 py-1.5 text-sm" :class="mode === 'asset' ? 'bg-brand-600 text-white' : 'text-slate-500'" @click="mode = 'asset'">资产管理</button>
    </div>

    <!-- 流水 -->
    <div v-if="mode === 'flow'" class="space-y-4">
      <div class="grid grid-cols-3 gap-3">
        <div class="card p-3 text-center"><div class="text-xs text-slate-400">本月收入</div><div class="mt-1 text-lg font-semibold text-emerald-500">¥{{ monthIncome }}</div></div>
        <div class="card p-3 text-center"><div class="text-xs text-slate-400">本月支出</div><div class="mt-1 text-lg font-semibold text-rose-500">¥{{ monthExpense }}</div></div>
        <div class="card p-3 text-center"><div class="text-xs text-slate-400">本月结余</div><div class="mt-1 text-lg font-semibold" :class="monthIncome - monthExpense >= 0 ? 'text-slate-700 dark:text-slate-200' : 'text-rose-500'">¥{{ monthIncome - monthExpense }}</div></div>
      </div>

      <div class="card flex flex-wrap items-end gap-2 p-3">
        <div class="flex rounded-lg border border-slate-200 dark:border-slate-700">
          <button class="px-3 py-2 text-sm" :class="flowForm.type === 'expense' ? 'bg-rose-500 text-white' : ''" @click="flowForm.type = 'expense'">支出</button>
          <button class="px-3 py-2 text-sm" :class="flowForm.type === 'income' ? 'bg-emerald-500 text-white' : ''" @click="flowForm.type = 'income'">收入</button>
        </div>
        <input v-model.number="flowForm.amount" type="number" step="0.01" class="input w-28" placeholder="金额" @keyup.enter="addTx" />
        <input v-model="flowForm.category" class="input w-28" list="cat-list" placeholder="分类" />
        <datalist id="cat-list">
          <option v-for="c in catOptions" :key="c" :value="c" />
        </datalist>
        <input v-model="flowForm.trans_date" type="date" class="input w-auto" />
        <input v-model="flowForm.note" class="input flex-1 min-w-[120px]" placeholder="备注" @keyup.enter="addTx" />
        <button class="btn-primary" @click="addTx">记一笔</button>
      </div>

      <div class="grid gap-4 md:grid-cols-3">
        <div class="card p-3 md:col-span-2">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm font-medium">流水明细<span v-if="selectedCat" class="ml-1 text-xs font-normal text-brand-600">· {{ selectedCat }}</span></span>
            <input v-model="month" type="month" class="input w-auto py-1 text-xs" />
          </div>
          <div v-if="selectedCat" class="mb-2 flex items-center gap-2 text-xs">
            <span class="rounded-full bg-brand-500/10 px-2 py-1 text-brand-600">筛选：{{ selectedCat }}（{{ visibleTx.length }} 笔）</span>
            <button class="rounded-full bg-slate-100 px-2 py-1 text-slate-500 hover:bg-slate-200 dark:bg-slate-800" @click="clearCatFilter">✕ 取消筛选</button>
          </div>
          <div class="space-y-1.5 max-h-96 overflow-auto">
            <div v-for="t in visibleTx" :key="t.id" class="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
              <span class="chip" :class="t.type === 'expense' ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'">{{ t.category }}</span>
              <span class="flex-1 truncate text-sm text-slate-400">{{ t.trans_date }} {{ t.note }}</span>
              <span class="text-sm font-medium" :class="t.type === 'expense' ? 'text-rose-500' : 'text-emerald-500'">{{ t.type === 'expense' ? '-' : '+' }}{{ t.amount }}</span>
              <button class="text-slate-300 hover:text-rose-500" @click="removeTx(t)">🗑</button>
            </div>
            <p v-if="!visibleTx.length" class="py-6 text-center text-sm text-slate-400">本月暂无记录</p>
          </div>
        </div>
        <div class="card p-3">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm font-medium">收支分类</span>
            <div class="flex rounded-lg border border-slate-200 text-xs dark:border-slate-700">
              <button class="px-2 py-1" :class="breakdownType === 'expense' ? 'bg-rose-500 text-white' : ''" @click="switchBreakdown('expense')">支出</button>
              <button class="px-2 py-1" :class="breakdownType === 'income' ? 'bg-emerald-500 text-white' : ''" @click="switchBreakdown('income')">收入</button>
            </div>
          </div>
          <div class="h-48"><Doughnut v-if="hasCatData" :data="pieData" :options="pieOpts" /><div v-else class="flex h-full items-center justify-center text-sm text-slate-400">暂无数据</div></div>
          <p v-if="selectedCat" class="mt-2 text-xs text-slate-400">已选中：{{ selectedCat }}（点图表同项取消）</p>
        </div>
      </div>
    </div>

    <!-- 资产 -->
    <div v-else class="space-y-4">
      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div class="card p-4"><div class="text-xs text-slate-400">总资产</div><div class="mt-1 text-2xl font-semibold">¥{{ Math.round(assetTotal) }}</div></div>
        <div class="card p-4"><div class="text-xs text-slate-400">总负债</div><div class="mt-1 text-2xl font-semibold text-rose-500">¥{{ Math.round(liabilityTotal) }}</div></div>
        <div class="card p-4"><div class="text-xs text-slate-400">净资产</div><div class="mt-1 text-2xl font-semibold text-emerald-500">¥{{ Math.round(netWorth) }}</div></div>
        <div class="card p-4"><div class="text-xs text-slate-400">应收(别人欠我)</div><div class="mt-1 text-2xl font-semibold text-amber-500">¥{{ Math.round(receivableTotal) }}</div></div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div class="card p-4">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm font-medium">现金 / 投资 占比</span>
          </div>
          <div class="h-44"><Doughnut :data="ratioData" :options="pieOpts" /></div>
        </div>
        <div class="card p-4">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm font-medium">资产趋势</span>
            <button class="btn-ghost py-1 text-xs" @click="recordSnapshot">记录快照</button>
          </div>
          <div class="h-44"><Line v-if="snapSorted.length" :data="snapData" :options="lineOpts" /><div v-else class="flex h-full items-center justify-center text-center text-sm text-slate-400">点击「记录快照」<br />开始追踪资产变化</div></div>
        </div>
      </div>

      <!-- 周度对比 -->
      <div class="card p-4" v-if="weekCompare">
        <div class="mb-2 text-sm font-medium">本周 vs 上周</div>
        <div class="grid grid-cols-3 gap-3 text-center">
          <div>
            <div class="text-xs text-slate-400">总资产变化</div>
            <div class="mt-1 text-lg font-semibold" :class="weekCompare.dTotal >= 0 ? 'text-emerald-500' : 'text-rose-500'">{{ weekCompare.dTotal >= 0 ? '+' : '' }}{{ Math.round(weekCompare.dTotal) }}</div>
          </div>
          <div>
            <div class="text-xs text-slate-400">净资产变化</div>
            <div class="mt-1 text-lg font-semibold" :class="weekCompare.dNet >= 0 ? 'text-emerald-500' : 'text-rose-500'">{{ weekCompare.dNet >= 0 ? '+' : '' }}{{ Math.round(weekCompare.dNet) }}</div>
          </div>
          <div>
            <div class="text-xs text-slate-400">负债变化</div>
            <div class="mt-1 text-lg font-semibold" :class="weekCompare.dLiability <= 0 ? 'text-emerald-500' : 'text-rose-500'">{{ weekCompare.dLiability >= 0 ? '+' : '' }}{{ Math.round(weekCompare.dLiability) }}</div>
          </div>
        </div>
        <p v-if="!snapThisWeek || !snapLastWeek" class="mt-2 text-center text-xs text-slate-400">需本周与上周各至少一条快照才能对比（当前记录快照数不足）</p>
      </div>

      <!-- 账户 -->
      <div class="card p-4">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-sm font-medium">账户余额</span>
          <div class="flex gap-1">
            <button class="chip bg-slate-100 dark:bg-slate-800" @click="openAccount('bank')">+ 银行卡</button>
            <button class="chip bg-slate-100 dark:bg-slate-800" @click="openAccount('wechat')">+ 微信</button>
            <button class="chip bg-slate-100 dark:bg-slate-800" @click="openAccount('alipay')">+ 支付宝</button>
            <button class="chip bg-slate-100 dark:bg-slate-800" @click="openAccount('cash')">+ 现金</button>
          </div>
        </div>
        <div class="grid gap-2 sm:grid-cols-2">
          <div v-for="a in accounts" :key="a.id" class="flex items-center gap-2 rounded-xl border border-slate-200 p-2.5 dark:border-slate-700" @click="editAccount(a)">
            <span class="text-xl">{{ kindIcon[a.kind] }}</span>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-medium">{{ a.name }}<span v-if="a.tail_no" class="ml-1 text-xs text-slate-400">·{{ a.tail_no }}</span></div>
              <div class="text-xs text-slate-400">{{ kindLabel[a.kind] }}</div>
            </div>
            <span class="text-sm font-semibold">¥{{ Number(a.balance) }}</span>
          </div>
          <p v-if="!accounts.length" class="py-4 text-sm text-slate-400">暂无账户，点击上方按钮添加</p>
        </div>
      </div>

      <!-- 黄金 -->
      <div class="card p-4">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-sm font-medium">黄金持仓</span>
          <button class="chip bg-slate-100 dark:bg-slate-800" @click="openGold">+ 黄金</button>
        </div>
        <div class="space-y-2">
          <div v-for="g in golds" :key="g.id" class="flex items-center gap-2 rounded-xl border border-slate-200 p-2.5 dark:border-slate-700" @click="editGold(g)">
            <span class="text-xl">🥇</span>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-medium">{{ g.name }}</div>
              <div class="text-xs text-slate-400">{{ g.grams }}g × ¥{{ g.price_per_gram }}</div>
            </div>
            <span class="text-sm font-semibold text-violet-500">¥{{ Math.round(g.grams * g.price_per_gram) }}</span>
          </div>
          <p v-if="!golds.length" class="py-3 text-sm text-slate-400">暂无黄金持仓</p>
        </div>
      </div>

      <!-- 股票 -->
      <div class="card p-4">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-sm font-medium">股票持仓</span>
          <button class="chip bg-slate-100 dark:bg-slate-800" @click="openStock">+ 股票</button>
        </div>
        <div class="space-y-2">
          <div v-for="s in stocks" :key="s.id" class="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-2.5 dark:border-slate-700" @click="editStock(s)">
            <span class="text-xl">📈</span>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-medium">{{ s.name || s.code }} <span class="text-xs text-slate-400">{{ s.code }}</span></div>
              <div class="text-xs text-slate-400">{{ s.shares }}股 · 成本¥{{ s.cost_price }} · 现价¥{{ s.current_price }}</div>
            </div>
            <div class="text-right">
              <div class="text-sm font-semibold" :class="analysis[s.id]?.day?.changePct > 0 ? 'text-rose-500' : analysis[s.id]?.day?.changePct < 0 ? 'text-emerald-500' : 'text-violet-500'">¥{{ Math.round(s.shares * s.current_price) }}</div>
              <button class="text-[11px] text-brand-500 hover:underline disabled:opacity-50" @click.stop="refreshStock(s)" :disabled="loadingStock === s.id">
                {{ loadingStock === s.id ? '分析中…' : '更新行情' }}
              </button>
            </div>
            <!-- 技术分析面板 -->
            <div v-if="expandedStock === s.id" class="w-full mt-2 border-t border-slate-200 pt-2 dark:border-slate-700" @click.stop>
              <div v-if="loadingStock === s.id" class="py-3 text-center text-xs text-slate-400">正在拉取行情并分析…</div>
              <div v-else-if="analysis[s.id]?.error" class="rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                {{ analysis[s.id].error }}
              </div>
              <div v-else-if="analysis[s.id]?.ok" class="space-y-3 text-xs">
                <div>
                  <div class="mb-1 font-medium text-slate-500 dark:text-slate-400">当日行情</div>
                  <div class="text-slate-700 dark:text-slate-200">{{ analysis[s.id].day.summary }}</div>
                </div>
                <div>
                  <div class="mb-1 font-medium text-slate-500 dark:text-slate-400">市场情绪 · {{ analysis[s.id].sentiment.indexText }}</div>
                  <div class="flex items-start gap-2">
                    <span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
                      :class="analysis[s.id].sentiment.score >= 25 ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/40' : analysis[s.id].sentiment.score <= -25 ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40' : 'bg-slate-100 text-slate-600 dark:bg-slate-800'">
                      {{ analysis[s.id].sentiment.label }}
                    </span>
                    <span class="text-slate-700 dark:text-slate-200">{{ analysis[s.id].sentiment.summary }}</span>
                  </div>
                </div>
                <div>
                  <div class="mb-1 font-medium text-slate-500 dark:text-slate-400">技术指标</div>
                  <div class="grid grid-cols-1 gap-1.5">
                    <div class="flex justify-between gap-3"><span class="shrink-0 text-slate-400">MACD</span><span class="text-right font-mono text-slate-700 dark:text-slate-200">{{ analysis[s.id].indicators.macd.text }}</span></div>
                    <div class="flex justify-between gap-3"><span class="shrink-0 text-slate-400">KDJ</span><span class="text-right font-mono text-slate-700 dark:text-slate-200">{{ analysis[s.id].indicators.kdj.text }}</span></div>
                    <div class="flex justify-between gap-3"><span class="shrink-0 text-slate-400">RSI</span><span class="text-right font-mono text-slate-700 dark:text-slate-200">{{ analysis[s.id].indicators.rsi.text }}</span></div>
                    <div class="flex justify-between gap-3"><span class="shrink-0 text-slate-400">BOLL</span><span class="text-right font-mono text-slate-700 dark:text-slate-200">{{ analysis[s.id].indicators.boll.text }}</span></div>
                    <div class="flex justify-between gap-3"><span class="shrink-0 text-slate-400">均线</span><span class="text-right font-mono text-slate-700 dark:text-slate-200">{{ analysis[s.id].indicators.ma.text }}</span></div>
                  </div>
                </div>
                <div v-if="analysis[s.id].signals?.length" class="flex flex-wrap gap-1">
                  <span v-for="sg in analysis[s.id].signals" :key="sg" class="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">{{ sg }}</span>
                </div>
                <div class="grid gap-2 sm:grid-cols-2">
                  <div class="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
                    <div class="mb-0.5 font-medium text-brand-500">短期操作（1–5天）</div>
                    <div class="text-slate-700 dark:text-slate-200">{{ analysis[s.id].shortTerm }}</div>
                  </div>
                  <div class="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
                    <div class="mb-0.5 font-medium text-brand-500">长期操作（周/月）</div>
                    <div class="text-slate-700 dark:text-slate-200">{{ analysis[s.id].longTerm }}</div>
                  </div>
                </div>
                <div v-if="analysis[s.id].profit" class="text-[11px] text-slate-400">持仓{{ analysis[s.id].profit.text }}</div>
                <div class="text-[11px] text-slate-400">⚠️ 以上为技术指标量化参考，不构成投资建议。</div>
              </div>
            </div>
          </div>
          <p v-if="!stocks.length" class="py-3 text-sm text-slate-400">暂无股票持仓</p>
        </div>
      </div>

      <!-- 负债 / 应收 -->
      <div class="card p-4">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-sm font-medium">负债 / 应收</span>
          <div class="flex gap-1">
            <button class="chip bg-slate-100 dark:bg-slate-800" @click="openLiability('credit_card')">+ 信用卡</button>
            <button class="chip bg-slate-100 dark:bg-slate-800" @click="openLiability('payable')">+ 借款(我欠)</button>
            <button class="chip bg-slate-100 dark:bg-slate-800" @click="openLiability('receivable')">+ 应收</button>
          </div>
        </div>
        <div class="grid gap-2 sm:grid-cols-2">
          <div v-for="l in liabilities" :key="l.id" class="flex items-center gap-2 rounded-xl border border-slate-200 p-2.5 dark:border-slate-700" @click="editLiability(l)" :class="l.kind === 'receivable' ? 'border-amber-200 dark:border-amber-800' : 'border-rose-200 dark:border-rose-800'">
            <span class="text-xl">{{ liabKindIcon[l.kind] }}</span>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-medium">{{ l.name }}<span v-if="l.tail_no" class="ml-1 text-xs text-slate-400">·{{ l.tail_no }}</span></div>
              <div class="text-xs text-slate-400">{{ liabKindLabel[l.kind] }}<span v-if="l.kind === 'credit_card' && l.credit_limit"> · 额度¥{{ l.credit_limit }}</span><span v-if="l.due_date"> · 到期{{ l.due_date.slice(5) }}</span></div>
            </div>
            <span class="text-sm font-semibold" :class="l.kind === 'receivable' ? 'text-amber-500' : 'text-rose-500'">¥{{ Number(l.balance) }}</span>
          </div>
          <p v-if="!liabilities.length" class="py-4 text-sm text-slate-400">暂无负债/应收，点击上方按钮添加</p>
        </div>
      </div>
    </div>

    <!-- 资产编辑 Modal -->
    <Modal :open="editType !== null" :title="editType === 'account' ? '编辑账户' : editType === 'gold' ? '编辑黄金' : editType === 'stock' ? '编辑股票' : '编辑负债/应收'" @close="editType = null">
      <div class="space-y-3" v-if="editType">
        <template v-if="editType === 'account'">
          <div><label class="label">类型</label>
            <select v-model="assetForm.kind" class="input"><option value="bank">银行卡</option><option value="wechat">微信</option><option value="alipay">支付宝</option><option value="cash">现金</option><option value="other">其他</option></select>
          </div>
          <div><label class="label">名称</label><input v-model="assetForm.name" class="input" placeholder="如 招商银行" /></div>
          <div v-if="assetForm.kind === 'bank'"><label class="label">尾号</label><input v-model="assetForm.tail_no" class="input" placeholder="如 8821" /></div>
          <div><label class="label">余额</label><input v-model.number="assetForm.balance" type="number" step="0.01" class="input" /></div>
        </template>
        <template v-else-if="editType === 'gold'">
          <div><label class="label">名称</label><input v-model="assetForm.name" class="input" /></div>
          <div class="grid grid-cols-2 gap-3"><div><label class="label">克数</label><input v-model.number="assetForm.grams" type="number" step="0.001" class="input" /></div><div><label class="label">单价(元/克)</label><input v-model.number="assetForm.price_per_gram" type="number" step="0.01" class="input" /></div></div>
        </template>
        <template v-else-if="editType === 'stock'">
          <div class="grid grid-cols-2 gap-3"><div><label class="label">代码</label><input v-model="assetForm.code" class="input" placeholder="如 600519" /></div><div><label class="label">名称</label><input v-model="assetForm.name" class="input" /></div></div>
          <div class="grid grid-cols-3 gap-3"><div><label class="label">股数</label><input v-model.number="assetForm.shares" type="number" step="0.01" class="input" /></div><div><label class="label">成本价</label><input v-model.number="assetForm.cost_price" type="number" step="0.01" class="input" /></div><div><label class="label">现价</label><input v-model.number="assetForm.current_price" type="number" step="0.01" class="input" /></div></div>
        </template>
        <template v-else-if="editType === 'liability'">
          <div><label class="label">类型</label>
            <select v-model="assetForm.kind" class="input"><option value="credit_card">信用卡</option><option value="payable">借款(我欠)</option><option value="receivable">应收(别人欠我)</option></select>
          </div>
          <div><label class="label">名称</label><input v-model="assetForm.name" class="input" placeholder="如 招行信用卡 / 张三" /></div>
          <div v-if="assetForm.kind === 'credit_card'" class="grid grid-cols-2 gap-3">
            <div><label class="label">尾号</label><input v-model="assetForm.tail_no" class="input" placeholder="如 8821" /></div>
            <div><label class="label">授信额度</label><input v-model.number="assetForm.credit_limit" type="number" step="0.01" class="input" /></div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="label">金额</label><input v-model.number="assetForm.balance" type="number" step="0.01" class="input" placeholder="欠款/应收金额" /></div>
            <div><label class="label">到期日</label><input v-model="assetForm.due_date" type="date" class="input" /></div>
          </div>
          <div><label class="label">备注</label><input v-model="assetForm.note" class="input" placeholder="如 本期最低还款" /></div>
        </template>
        <div class="flex justify-end gap-2 pt-1">
          <button v-if="assetForm.id" class="btn-danger mr-auto" @click="removeCurrent">删除</button>
          <button class="btn-ghost" @click="editType = null">取消</button>
          <button class="btn-primary" @click="saveAsset">保存</button>
        </div>
      </div>
    </Modal>
  </div>
</template>
