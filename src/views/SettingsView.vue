<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { createRepo } from '@/lib/db'
import { HAS_SUPABASE } from '@/lib/supabase'
import {
  TABLES,
  exportAll,
  importData,
  clearAll,
  downloadJSON,
  pickFile,
  readFileText,
  type ExportData
} from '@/lib/dataIO'

const counts = ref<Record<string, number>>({})
const total = ref(0)
const busy = ref(false)
const msg = ref<{ type: 'ok' | 'err'; text: string } | null>(null)

async function loadCounts() {
  const c: Record<string, number> = {}
  let sum = 0
  for (const t of TABLES) {
    const n = (await createRepo(t).list()).length
    c[t] = n
    sum += n
  }
  counts.value = c
  total.value = sum
}

onMounted(loadCounts)

function flash(type: 'ok' | 'err', text: string) {
  msg.value = { type, text }
  setTimeout(() => (msg.value = null), 5000)
}

function stamp() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

async function onExport() {
  busy.value = true
  try {
    const data = await exportAll()
    downloadJSON(data, `workbench-data-${stamp()}.json`)
    flash('ok', '已导出全部数据（JSON 文件已下载）')
  } catch (e) {
    flash('err', '导出失败：' + (e instanceof Error ? e.message : String(e)))
  } finally {
    busy.value = false
  }
}

async function onImport() {
  const file = await pickFile('.json,application/json')
  if (!file) return
  busy.value = true
  try {
    const text = await readFileText(file)
    const data = JSON.parse(text) as Partial<ExportData>
    if (data.app !== 'life-workbench' || !data.tables) {
      flash('err', '文件格式不正确：不是本工作台导出的数据')
      return
    }
  const r = await importData(data)
  let summary = `导入完成：新增 ${r.inserted} 条，已存在跳过 ${r.skipped} 条（${r.tables} 个模块）`
  if (r.failed) summary += `；失败 ${r.failed} 条：${r.errors.map((e) => e.table).join('、')}`
  flash(r.failed ? 'err' : 'ok', summary)
    await loadCounts()
  } catch (e) {
    flash('err', '导入失败：' + (e instanceof Error ? e.message : String(e)))
  } finally {
    busy.value = false
  }
}

async function onClear() {
  if (!confirm('确定清空全部数据？此操作不可恢复！\n（建议先点「导出全部数据」备份）')) return
  if (!confirm('再次确认：将删除所有模块的全部记录。')) return
  busy.value = true
  try {
    const n = await clearAll()
    flash('ok', `已清空 ${n} 条数据`)
    await loadCounts()
  } catch (e) {
    flash('err', '清空失败：' + (e instanceof Error ? e.message : String(e)))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <h2 class="text-lg font-semibold">设置 · 数据管理</h2>

    <!-- 反馈 -->
    <transition name="fade">
      <div
        v-if="msg"
        class="rounded-xl px-4 py-3 text-sm"
        :class="msg.type === 'ok' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'"
      >{{ msg.text }}</div>
    </transition>

    <!-- 数据操作 -->
    <section class="card p-5">
      <h3 class="mb-1 font-semibold">备份与迁移</h3>
      <p class="mb-4 text-sm text-slate-400">
        导出为单个 JSON 文件（含全部模块）。可在本机、手机或其他浏览器导入恢复，也便于在「本地模式」与「云端账号」之间迁移数据。
      </p>
      <div class="flex flex-wrap gap-3">
        <button class="btn-primary" :disabled="busy" @click="onExport">⬇ 导出全部数据</button>
        <button class="btn-ghost" :disabled="busy" @click="onImport">⬆ 导入数据</button>
        <button class="btn-danger" :disabled="busy" @click="onClear">🗑 清空全部数据</button>
      </div>
      <p class="mt-3 text-xs text-slate-400">
        导入策略：<b>合并去重</b>——已存在的记录保留、新的追加，不会覆盖或丢失已有数据。
      </p>
    </section>

    <!-- 记录统计 -->
    <section class="card p-5">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="font-semibold">当前数据量</h3>
        <span class="chip bg-brand-600/10 text-brand-600">共 {{ total }} 条</span>
      </div>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div
          v-for="t in TABLES"
          :key="t"
          class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/50"
        >
          <span class="text-slate-500 dark:text-slate-400">{{ t }}</span>
          <span class="font-semibold tabular-nums">{{ counts[t] ?? 0 }}</span>
        </div>
      </div>
    </section>

    <!-- 模式信息 -->
    <section class="card p-5 text-sm text-slate-500 dark:text-slate-400">
      当前数据模式：<b :class="HAS_SUPABASE ? 'text-emerald-500' : 'text-slate-400'">{{ HAS_SUPABASE ? '云端同步（Supabase）' : '本地演示模式（localStorage）' }}</b>
      <span class="ml-1">导入/导出对两种模式均生效。</span>
    </section>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
