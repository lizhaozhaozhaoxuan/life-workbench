<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import dayjs from 'dayjs'
import { Doughnut } from 'vue-chartjs'
import { useCollection } from '@/composables/useCollection'
import { type Repo } from '@/lib/db'
import Modal from '@/components/Modal.vue'
import AssetCategoryModal from '@/components/asset/AssetCategoryModal.vue'
import AssetItemModal from '@/components/asset/AssetItemModal.vue'
import AssetWishModal from '@/components/asset/AssetWishModal.vue'
import {
  PRESET_CATEGORIES,
  STATUS_LABEL,
  CAT_TYPE_LABEL,
  WISH_PRIORITY_LABEL,
  WISH_STATUS_LABEL,
  itemTotal,
  collectReminders,
  computeStats,
  getReminderCfg,
  setReminderCfg,
  parseAssetCsv,
  round2,
  expiryRemainingDays,
  warrantyRemainingDays,
  idleMonths,
  type Category,
  type Row
} from '@/lib/assetHelpers'
import { downloadJSON, pickFile, readFileText } from '@/lib/dataIO'

const { items: categories, repo: catRepo, reload: catReload } = useCollection('asset_categories')
const { items: items, repo: itemRepo } = useCollection('asset_items')
const { items: wishes, repo: wishRepo } = useCollection('asset_wishlist')

// 首次进入若分类为空 -> 写入 5 大预置类目
let seeded = false
async function ensurePresets() {
  if (seeded) return
  seeded = true
  if (categories.value.length === 0) {
    await Promise.all(PRESET_CATEGORIES.map((c) => catRepo.insert({ ...c, order_no: 0, is_preset: true })))
  }
}
onMounted(async () => {
  await catReload()
  await ensurePresets()
})

// ---- 标签 ----
const TABS = [
  { key: 'category', label: '分类管理' },
  { key: 'ledger', label: '资产台账' },
  { key: 'remind', label: '时效提醒' },
  { key: 'wish', label: '待买清单' },
  { key: 'stats', label: '统计检索' }
] as const
const tab = ref<(typeof TABS)[number]['key']>('ledger')

const primaryCats = computed(() => categories.value.filter((c) => !c.parent_id))
const subCatsOf = (pid: string) => categories.value.filter((c) => c.parent_id === pid)
const catName = (id?: string | null) => categories.value.find((c) => c.id === id)?.name || '未分类'

// 当前是否过期 / 过保 / 闲置（供台账筛选与标红）
const isExpired = (it: Row) => it.category_type === 'perishable' && (expiryRemainingDays(it) ?? 1) < 0
const isWarrantyExpired = (it: Row) => it.category_type === 'warranty' && (warrantyRemainingDays(it) ?? 1) < 0
const isIdle = (it: Row) => (it.status === 'in_use' || it.status === 'lent') && (idleMonths(it) ?? -1) >= reminderCfg.value.idleMonths

// ---- 台账筛选 ----
const search = ref('')
const fCat = ref<string | null>(null)
const fStatus = ref<string>('all')
const fFlag = ref<string>('all') // all | expired | warranty | idle
const showArchived = ref(false)

const filteredItems = computed(() => {
  const kw = search.value.trim().toLowerCase()
  return items.value
    .filter((it) => showArchived.value || !it.archived)
    .filter((it) => {
      if (kw && !(it.name || '').toLowerCase().includes(kw) && !(it.note || '').toLowerCase().includes(kw) && !catName(it.category_id).toLowerCase().includes(kw)) return false
      if (fCat.value && it.category_id !== fCat.value) {
        // 选一级分类时也包含其二级
        const isSub = categories.value.find((c) => c.id === it.category_id)?.parent_id === fCat.value
        if (it.category_id !== fCat.value && !isSub) return false
      }
      if (fStatus.value !== 'all' && it.status !== fStatus.value) return false
      if (fFlag.value === 'expired' && !isExpired(it)) return false
      if (fFlag.value === 'warranty' && !isWarrantyExpired(it)) return false
      if (fFlag.value === 'idle' && !isIdle(it)) return false
      return true
    })
    .sort((a, b) => (a.purchase_date < b.purchase_date ? 1 : -1))
})

// ---- 提醒 ----
const reminderCfg = ref(getReminderCfg())
const reminders = computed(() => collectReminders(items.value, reminderCfg.value))
const remindBadge = computed(() => reminders.value.length)
function saveReminderCfg() {
  setReminderCfg(reminderCfg.value)
}

// ---- 统计 ----
const stats = computed(() => computeStats(items.value, categories.value as Category[]))
const thisYear = dayjs().format('YYYY')
const thisMonth = dayjs().format('YYYY-MM')
const yearSpend = computed(() =>
  round2(
    items.value
      .filter((i) => i.purchase_date && (i.purchase_date as string).startsWith(thisYear))
      .reduce((a, b) => a + itemTotal(b), 0)
  )
)
const monthSpend = computed(() =>
  round2(
    items.value
      .filter((i) => i.purchase_date && (i.purchase_date as string).startsWith(thisMonth))
      .reduce((a, b) => a + itemTotal(b), 0)
  )
)
const wishPending = computed(() => wishes.value.filter((w) => w.status === 'pending'))
const wishBudget = computed(() =>
  round2(
    wishPending.value.reduce((a, w) => {
      const v = w.est_total_price ? Number(w.est_total_price) : (Number(w.est_unit_price) || 0) * (Number(w.quantity) || 1)
      return a + v
    }, 0)
  )
)
const wishHigh = computed(() => wishPending.value.filter((w) => w.priority === 'high').length)

const catPieData = computed(() => ({
  labels: stats.value.byCategory.map((c) => c.name),
  datasets: [{ data: stats.value.byCategory.map((c) => c.value), backgroundColor: ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#6366f1', '#f97316'] }]
}))
const pieOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' as const } } }

// ---- 弹窗 ----
const catModal = ref<{ open: boolean; cat: Category | null; parent: Category | null }>({ open: false, cat: null, parent: null })
const itemModal = ref<{ open: boolean; item: Row | null }>({ open: false, item: null })
const wishModal = ref<{ open: boolean; wish: Row | null }>({ open: false, wish: null })

// 统一持久化：await + 捕获真实错误，避免未处理的 Promise 拒绝（表现为无用的 "Promise: [object Object]"）
// 关键：空字符串 "" 对 date / numeric 列是非法值（Postgres 不接受），未填写的字段必须传 null。
async function persist(repo: Repo, id: string | undefined, rest: any): Promise<void> {
  const clean: any = {}
  for (const [k, v] of Object.entries(rest || {})) {
    clean[k] = v === '' ? null : v
  }
  try {
    if (id) await repo.update(id, clean)
    else await repo.insert(clean)
  } catch (e: any) {
    const msg = e?.message || e?.error_description || e?.details || String(e)
    alert(`保存失败：${msg}`)
    throw e
  }
}
async function removeRow(repo: Repo, id: string, label: string): Promise<void> {
  if (!confirm(label)) return
  try {
    await repo.remove(id)
  } catch (e: any) {
    const msg = e?.message || e?.error_description || e?.details || String(e)
    alert(`删除失败：${msg}`)
    throw e
  }
}

function openAddCat() { catModal.value = { open: true, cat: null, parent: null } }
function openAddSub(parent: Category) { catModal.value = { open: true, cat: null, parent } }
function editCat(c: Category) { catModal.value = { open: true, cat: c, parent: null } }
async function saveCat(p: any) {
  const { id, ...rest } = p
  await persist(catRepo, id, rest)
  catModal.value.open = false
}
async function removeCat(id: string) {
  if (confirm('删除该分类？其下二级分类将一并删除，已登记资产会变为「未分类」。')) {
    try {
      await catRepo.remove(id)
      for (const c of categories.value.filter((c) => c.parent_id === id)) {
        await catRepo.remove(c.id)
      }
    } catch (e: any) {
      const msg = e?.message || e?.error_description || e?.details || String(e)
      alert(`删除失败：${msg}`)
    }
  }
  catModal.value.open = false
}

function openAddItem() { itemModal.value = { open: true, item: null } }
function editItem(it: Row) { itemModal.value = { open: true, item: it } }
async function saveItem(p: any) {
  const { id, ...rest } = p
  await persist(itemRepo, id, rest)
  itemModal.value.open = false
}
async function removeItem(id: string) {
  await removeRow(itemRepo, id, '删除该资产记录？')
  itemModal.value.open = false
}
async function toggleArchive(it: Row) {
  await itemRepo.update(it.id, { archived: !it.archived })
}

function openAddWish() { wishModal.value = { open: true, wish: null } }
function editWish(w: Row) { wishModal.value = { open: true, wish: w } }
async function saveWish(p: any) {
  const { id, ...rest } = p
  await persist(wishRepo, id, rest)
  wishModal.value.open = false
}
async function removeWish(id: string) {
  await removeRow(wishRepo, id, '删除该待买项？')
  wishModal.value.open = false
}

// ---- 批量导入 / 导出 ----
const EXPORT_FIELDS: { zh: string; get: (it: Row) => any }[] = [
  { zh: '资产名称', get: (i) => i.name },
  { zh: '分类', get: (i) => catName(i.category_id) },
  { zh: '购买日期', get: (i) => i.purchase_date || '' },
  { zh: '单价', get: (i) => i.unit_price ?? '' },
  { zh: '总价', get: (i) => i.total_price ?? '' },
  { zh: '数量', get: (i) => i.quantity ?? 1 },
  { zh: '状态', get: (i) => STATUS_LABEL[i.status as keyof typeof STATUS_LABEL] || i.status },
  { zh: '购买渠道', get: (i) => i.channel || '' },
  { zh: '备注', get: (i) => i.note || '' },
  { zh: '生产日期', get: (i) => i.production_date || '' },
  { zh: '有效期', get: (i) => i.expiry_date || '' },
  { zh: '保修开始', get: (i) => i.warranty_start || '' },
  { zh: '保修结束', get: (i) => i.warranty_end || '' },
  { zh: '保修时长', get: (i) => i.warranty_months ?? '' }
]
function csvCell(v: any): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function exportCsv() {
  const rows = filteredItems.value
  const head = EXPORT_FIELDS.map((f) => f.zh).join(',')
  const body = rows.map((it) => EXPORT_FIELDS.map((f) => csvCell(f.get(it))).join(',')).join('\n')
  const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `资产台账-${dayjs().format('YYYYMMDD')}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function importCsv() {
  const file = await pickFile('.csv,text/csv')
  if (!file) return
  try {
    const text = await readFileText(file)
    const { rows, error } = parseAssetCsv(text)
    if (error) { alert(error); return }
    let ok = 0
    for (const r of rows) {
      const name = (r as Row).categoryName
      const cat = name ? categories.value.find((c) => c.name === name) : null
      const { categoryName, ...rest } = r as Row
      await itemRepo.insert({ ...rest, category_id: cat?.id || null })
      ok++
    }
    alert(`成功导入 ${ok} 条资产${rows.length ? '' : '（0 条，请检查表头与数据）'}`)
  } catch (e: any) {
    alert('导入失败：' + (e?.message || '未知错误'))
  }
}
function exportJson() {
  downloadJSON(
    { app: 'life-workbench-assets', version: 1, exportedAt: new Date().toISOString(), categories: categories.value, items: items.value, wishes: wishes.value },
    `资产全量-${dayjs().format('YYYYMMDD')}.json`
  )
}
// 全量 JSON 导入（合并，依赖 dataIO 的通用逻辑）
async function importJson() {
  const file = await pickFile('.json')
  if (!file) return
  try {
    const data = JSON.parse(await readFileText(file))
    const tables = data.tables || data
    let n = 0
    if (tables.categories) for (const r of tables.categories) { await catRepo.insert(r); n++ }
    if (tables.items) for (const r of tables.items) { await itemRepo.insert(r); n++ }
    if (tables.wishes) for (const r of tables.wishes) { await wishRepo.insert(r); n++ }
    alert(`导入完成（含分类/资产/待买共 ${n} 条）`)
  } catch (e: any) {
    alert('导入失败：' + (e?.message || '格式错误'))
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- 标签切换 -->
    <div class="flex overflow-x-auto rounded-xl border border-slate-200 p-0.5 dark:border-slate-700">
      <button
        v-for="t in TABS"
        :key="t.key"
        class="relative whitespace-nowrap rounded-lg px-3 py-1.5 text-sm"
        :class="tab === t.key ? 'bg-brand-600 text-white' : 'text-slate-500'"
        @click="tab = t.key"
      >
        {{ t.label }}
        <span v-if="t.key === 'remind' && remindBadge" class="ml-1 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{{ remindBadge }}</span>
      </button>
    </div>

    <!-- ============ 1. 分类管理 ============ -->
    <div v-if="tab === 'category'" class="space-y-3">
      <div class="card flex items-center justify-between p-3">
        <div class="text-sm text-slate-400">统一管控所有资产类目，支持自定义拓展（一级可含二级）</div>
        <button class="btn-primary" @click="openAddCat">+ 新增一级</button>
      </div>
      <div v-for="c in primaryCats" :key="c.id" class="card p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-2xl">{{ c.icon }}</span>
            <div>
              <div class="font-medium">{{ c.name }}</div>
              <div class="text-xs text-slate-400">{{ CAT_TYPE_LABEL[c.type] }} · {{ subCatsOf(c.id).length }} 个二级</div>
            </div>
          </div>
          <div class="flex gap-1">
            <button class="chip bg-slate-100 dark:bg-slate-800" @click="openAddSub(c)">+ 二级</button>
            <button class="chip bg-slate-100 dark:bg-slate-800" @click="editCat(c)">编辑</button>
            <button v-if="!c.is_preset" class="chip bg-rose-500/10 text-rose-500" @click="removeCat(c.id)">删除</button>
            <span v-else class="chip bg-slate-100 text-slate-400 dark:bg-slate-800">预置</span>
          </div>
        </div>
        <div v-if="subCatsOf(c.id).length" class="mt-3 flex flex-wrap gap-2">
          <span v-for="s in subCatsOf(c.id)" :key="s.id" class="chip bg-brand-500/10 text-brand-600 dark:text-brand-300">
            {{ s.icon }} {{ s.name }}
            <button class="ml-1 text-slate-400 hover:text-rose-500" @click="editCat(s)">✎</button>
            <button class="ml-0.5 text-slate-400 hover:text-rose-500" @click="removeCat(s.id)">✕</button>
          </span>
        </div>
      </div>
      <p v-if="!primaryCats.length" class="py-6 text-center text-sm text-slate-400">暂无分类，点击「新增一级」</p>
    </div>

    <!-- ============ 2. 资产台账 ============ -->
    <div v-else-if="tab === 'ledger'" class="space-y-3">
      <div class="card flex flex-wrap items-end gap-2 p-3">
        <input v-model="search" class="input w-40" placeholder="搜索名称/备注/分类" />
        <select v-model="fCat" class="input w-auto">
          <option :value="null">全部分类</option>
          <option v-for="c in primaryCats" :key="c.id" :value="c.id">{{ c.icon }} {{ c.name }}</option>
        </select>
        <select v-model="fStatus" class="input w-auto">
          <option value="all">全部状态</option>
          <option v-for="(label, k) in STATUS_LABEL" :key="k" :value="k">{{ label }}</option>
        </select>
        <select v-model="fFlag" class="input w-auto">
          <option value="all">全部时效</option>
          <option value="expired">已过期</option>
          <option value="warranty">已过保</option>
          <option value="idle">闲置</option>
        </select>
        <label class="chip bg-slate-100 dark:bg-slate-800"><input v-model="showArchived" type="checkbox" class="mr-1" />含归档</label>
        <div class="ml-auto flex flex-wrap gap-1">
          <button class="chip bg-slate-100 dark:bg-slate-800" @click="openAddItem">+ 新增资产</button>
          <button class="chip bg-slate-100 dark:bg-slate-800" @click="importCsv">批量导入</button>
          <button class="chip bg-slate-100 dark:bg-slate-800" @click="exportCsv">导出CSV</button>
          <button class="chip bg-slate-100 dark:bg-slate-800" @click="importJson">导入JSON</button>
          <button class="chip bg-slate-100 dark:bg-slate-800" @click="exportJson">导出JSON</button>
        </div>
      </div>

      <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="it in filteredItems"
          :key="it.id"
          class="card flex flex-col gap-2 p-3"
          :class="{ 'opacity-60': it.archived }"
          @click="editItem(it)"
        >
          <div class="flex items-start gap-2">
            <div class="flex-1 min-w-0">
              <div class="truncate font-medium">{{ it.name }}</div>
              <div class="text-xs text-slate-400">{{ catName(it.category_id) }} · {{ STATUS_LABEL[it.status as keyof typeof STATUS_LABEL] }}</div>
            </div>
            <span class="font-semibold text-brand-600 dark:text-brand-300">¥{{ itemTotal(it) }}</span>
          </div>
          <div v-if="it.images?.length" class="flex gap-1 overflow-x-auto">
            <img v-for="(img, i) in it.images.slice(0, 4)" :key="i" :src="img" class="h-12 w-12 shrink-0 rounded-lg object-cover" @click.stop />
          </div>
          <div class="flex flex-wrap gap-1 text-[11px]">
            <span v-if="it.purchase_date" class="chip bg-slate-100 dark:bg-slate-800">{{ it.purchase_date.slice(5) }}购</span>
            <span v-if="it.channel" class="chip bg-slate-100 dark:bg-slate-800">{{ it.channel }}</span>
            <span v-if="isExpired(it)" class="chip bg-rose-500/15 text-rose-500">已过期</span>
            <span v-else-if="isWarrantyExpired(it)" class="chip bg-rose-500/15 text-rose-500">已过保</span>
            <span v-else-if="isIdle(it)" class="chip bg-amber-500/15 text-amber-500">闲置</span>
            <span v-if="it.archived" class="chip bg-slate-200 text-slate-500 dark:bg-slate-700">已归档</span>
          </div>
        </div>
        <p v-if="!filteredItems.length" class="col-span-full py-8 text-center text-sm text-slate-400">暂无资产，点击「+ 新增资产」或「批量导入」</p>
      </div>
    </div>

    <!-- ============ 3. 时效提醒 ============ -->
    <div v-else-if="tab === 'remind'" class="space-y-3">
      <div class="card p-3">
        <div class="mb-2 text-sm font-medium">预警设置</div>
        <div class="flex flex-wrap items-center gap-4 text-sm">
          <label class="flex items-center gap-2">保修提前
            <input v-model.number="reminderCfg.warrantyDays" type="number" min="1" max="90" class="input w-16" @change="saveReminderCfg" /> 天提醒
          </label>
          <label class="flex items-center gap-2">超过
            <input v-model.number="reminderCfg.idleMonths" type="number" min="1" max="36" class="input w-16" @change="saveReminderCfg" /> 个月未使用标记闲置
          </label>
        </div>
      </div>

      <div class="card p-3">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-sm font-medium">提醒聚合（{{ reminders.length }}）</span>
        </div>
        <div class="space-y-2">
          <div
            v-for="(r, idx) in reminders"
            :key="idx"
            class="flex items-center gap-2 rounded-xl border p-2.5"
            :class="r.level === 'expired' ? 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/20' : r.level === 'urgent' ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-700'"
            @click="editItem(r.item)"
          >
            <span class="text-lg">{{ r.kind === 'expiry' ? '🍎' : r.kind === 'warranty' ? '🔧' : '💤' }}</span>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-medium">{{ r.item.name }}</div>
              <div class="text-xs text-slate-400">{{ catName(r.item.category_id) }}</div>
            </div>
            <span
              class="chip"
              :class="r.level === 'expired' ? 'bg-rose-500 text-white' : r.level === 'urgent' ? 'bg-amber-500 text-white' : 'bg-slate-400 text-white'"
            >{{ r.message }}</span>
          </div>
          <p v-if="!reminders.length" class="py-6 text-center text-sm text-slate-400">暂无到期 / 过期 / 闲置提醒，保持得不错 👍</p>
        </div>
      </div>
    </div>

    <!-- ============ 4. 待买清单 ============ -->
    <div v-else-if="tab === 'wish'" class="space-y-3">
      <div class="grid grid-cols-3 gap-2">
        <div class="card p-3 text-center"><div class="text-xs text-slate-400">待采购预算</div><div class="mt-1 font-semibold text-brand-600">¥{{ wishBudget }}</div></div>
        <div class="card p-3 text-center"><div class="text-xs text-slate-400">高优先级</div><div class="mt-1 font-semibold text-rose-500">{{ wishHigh }}</div></div>
        <div class="card p-3 text-center"><div class="text-xs text-slate-400">待采购项</div><div class="mt-1 font-semibold">{{ wishPending.length }}</div></div>
      </div>
      <div class="card flex items-center justify-between p-3">
        <div class="text-sm text-slate-400">记录未采购物品、优先级排序与采购管控</div>
        <button class="btn-primary" @click="openAddWish">+ 新增待买</button>
      </div>
      <div class="space-y-2">
        <div
          v-for="w in wishes"
          :key="w.id"
          class="card flex items-center gap-2 p-3"
          :class="{ 'opacity-60': w.status !== 'pending' }"
          @click="editWish(w)"
        >
          <span class="text-lg">{{ w.status === 'purchased' ? '✅' : w.status === 'abandoned' ? '🚫' : '🛒' }}</span>
          <div class="min-w-0 flex-1">
            <div class="truncate font-medium">{{ w.name }}</div>
            <div class="text-xs text-slate-400">{{ catName(w.category_id) }}<span v-if="w.scene"> · {{ w.scene }}</span><span v-if="w.expect_date"> · 预期{{ w.expect_date.slice(5) }}</span></div>
          </div>
          <span class="chip" :class="w.priority === 'high' ? 'bg-rose-500/15 text-rose-500' : w.priority === 'medium' ? 'bg-amber-500/15 text-amber-500' : 'bg-slate-400/15 text-slate-500'">{{ WISH_PRIORITY_LABEL[w.priority as keyof typeof WISH_PRIORITY_LABEL] }}</span>
          <span class="text-sm font-semibold">¥{{ w.est_total_price ? Number(w.est_total_price) : Math.round((Number(w.est_unit_price) || 0) * (Number(w.quantity) || 1) * 100) / 100 }}</span>
        </div>
        <p v-if="!wishes.length" class="py-6 text-center text-sm text-slate-400">待买清单为空</p>
      </div>
    </div>

    <!-- ============ 5. 统计检索 ============ -->
    <div v-else class="space-y-4">
      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div class="card p-4"><div class="text-xs text-slate-400">资产总数</div><div class="mt-1 text-2xl font-semibold">{{ stats.totalCount }}</div></div>
        <div class="card p-4"><div class="text-xs text-slate-400">资产总价值</div><div class="mt-1 text-2xl font-semibold text-brand-600">¥{{ stats.totalValue }}</div></div>
        <div class="card p-4"><div class="text-xs text-slate-400">本年购入支出</div><div class="mt-1 text-2xl font-semibold">¥{{ yearSpend }}</div></div>
        <div class="card p-4"><div class="text-xs text-slate-400">本月购入支出</div><div class="mt-1 text-2xl font-semibold">¥{{ monthSpend }}</div></div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div class="card p-4">
          <div class="mb-2 text-sm font-medium">各类别资产价值占比</div>
          <div class="h-56"><Doughnut v-if="stats.byCategory.length" :data="catPieData" :options="pieOpts" /><div v-else class="flex h-full items-center justify-center text-sm text-slate-400">暂无数据</div></div>
        </div>
        <div class="card p-4">
          <div class="mb-2 text-sm font-medium">风险资产汇总</div>
          <div class="grid grid-cols-3 gap-3 text-center">
            <div class="rounded-xl bg-rose-50 p-3 dark:bg-rose-950/20"><div class="text-xs text-slate-400">过期</div><div class="mt-1 text-xl font-semibold text-rose-500">{{ stats.expiredCount }}</div></div>
            <div class="rounded-xl bg-rose-50 p-3 dark:bg-rose-950/20"><div class="text-xs text-slate-400">过保</div><div class="mt-1 text-xl font-semibold text-rose-500">{{ stats.warrantyExpiredCount }}</div></div>
            <div class="rounded-xl bg-amber-50 p-3 dark:bg-amber-950/20"><div class="text-xs text-slate-400">闲置</div><div class="mt-1 text-xl font-semibold text-amber-500">{{ stats.idleCount }}</div></div>
          </div>
          <div class="mt-3 space-y-1 text-xs text-slate-400">
            <div>待采购总预算：<span class="font-medium text-brand-600">¥{{ wishBudget }}</span></div>
            <div>高优先级待采购：<span class="font-medium text-rose-500">{{ wishHigh }}</span> 项</div>
          </div>
        </div>
      </div>

      <div class="card p-4">
        <div class="mb-2 text-sm font-medium">各类别明细</div>
        <div class="space-y-1.5">
          <div v-for="c in stats.byCategory" :key="c.categoryId" class="flex items-center gap-2 text-sm">
            <span class="w-20 truncate text-slate-500">{{ c.name }}</span>
            <div class="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div class="h-full rounded-full bg-brand-500" :style="{ width: stats.totalValue ? (c.value / stats.totalValue * 100).toFixed(1) + '%' : '0%' }"></div>
            </div>
            <span class="w-16 text-right text-slate-400">{{ c.count }}件 · ¥{{ c.value }}</span>
          </div>
          <p v-if="!stats.byCategory.length" class="py-3 text-center text-sm text-slate-400">暂无数据</p>
        </div>
      </div>
    </div>

    <!-- 弹窗 -->
    <AssetCategoryModal :open="catModal.open" :category="catModal.cat" :parent="catModal.parent" @close="catModal.open = false" @save="saveCat" @remove="removeCat" />
    <AssetItemModal :open="itemModal.open" :item="itemModal.item" :categories="categories as Category[]" @close="itemModal.open = false" @save="saveItem" @remove="removeItem" />
    <AssetWishModal :open="wishModal.open" :wish="wishModal.wish" :categories="categories as Category[]" @close="wishModal.open = false" @save="saveWish" @remove="removeWish" />
  </div>
</template>
