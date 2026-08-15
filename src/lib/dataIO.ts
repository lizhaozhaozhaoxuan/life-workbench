// ============================================================================
// 数据导入 / 导出 / 清空
//  - 兼容本地模式(localStorage) 与 Supabase 云端模式：底层统一走 repo 抽象
//  - 导出：全量 JSON（含全部表）
//  - 导入：合并去重（按 id 去重，已存在的保留、新的追加，不丢数据）
//  - 清空：清空全部表（危险操作，需二次确认，由调用方负责）
// ============================================================================
import { createRepo, genId, type Row } from './db'
import { HAS_SUPABASE } from './supabase'

// 全部数据表（与 schema.sql / 各视图 useCollection 保持一致）
export const TABLES = [
  'todos',
  'life_easy',
  'life_anniversary',
  'workout_videos',
  'workout_checkins',
  'weight_logs',
  'study_lang_sessions',
  'study_routes',
  'study_route_nodes',
  'study_sites',
  'transactions',
  'asset_accounts',
  'asset_gold',
  'asset_stocks',
  'asset_liabilities',
  'asset_snapshots',
  'asset_categories',
  'asset_items',
  'asset_wishlist'
] as const

export type ExportData = {
  app: 'life-workbench'
  version: number
  exportedAt: string
  mode: 'local' | 'supabase'
  tables: Record<string, Row[]>
}

// ---- 导出 ----
export async function exportAll(): Promise<ExportData> {
  const tables: Record<string, Row[]> = {}
  for (const t of TABLES) {
    tables[t] = await createRepo(t).list()
  }
  return {
    app: 'life-workbench',
    version: 1,
    exportedAt: new Date().toISOString(),
    mode: HAS_SUPABASE ? 'supabase' : 'local',
    tables
  }
}

// ---- 导入（合并去重）----
export type ImportResult = {
  inserted: number
  skipped: number
  failed: number
  tables: number
  errors: { table: string; message: string }[]
}
export async function importData(data: Partial<ExportData>): Promise<ImportResult> {
  const src = data?.tables || {}
  let inserted = 0
  let skipped = 0
  let failed = 0
  let tables = 0
  const errors: { table: string; message: string }[] = []
  for (const t of TABLES) {
    const rows = (src[t] as Row[]) || []
    if (!rows.length) continue
    tables++
    const repo = createRepo(t)
    const existingIds = new Set((await repo.list()).map((r) => r.id))
    for (const row of rows) {
      const id = row.id || genId()
      const clean = { ...row, id }
      delete (clean as Row).id
      if (existingIds.has(id)) {
        skipped++ // 已存在：保留原数据，不覆盖
        continue
      }
      try {
        await repo.insert({ ...clean, id })
        inserted++
      } catch (e: any) {
        // 单条失败不中断整体导入。常见云端约束冲突的优雅处理：
        let msg = e?.message || (typeof e === 'string' ? e : '未知错误')
        // 1) 云端表缺列（如早期版本漏建 created_at）：剥离未知列后重试一次
        const col = (
          msg.match(/column\s+["']?([\w]+)["']?\s+(does not exist|of|in)/i) ||
          msg.match(/["']([\w]+)["']\s+column/i)
        )?.[1]
        if (col && (clean as Row)[col] !== undefined) {
          delete (clean as Row)[col]
          try {
            await repo.insert({ ...clean, id })
            inserted++
            continue
          } catch (e2: any) {
            msg = e2?.message || (typeof e2 === 'string' ? e2 : '未知错误')
          }
        }
        // 2) 外键孤儿：引用了已删除/不存在的数据（如打卡指向已删视频）。
        //    源数据本身已失效，跳过该行而非整批失败。
        if (/foreign key/i.test(msg)) {
          skipped++
          if (!errors.find((x) => x.table === t)) {
            errors.push({ table: t, message: `${t}：跳过引用已删除数据的记录（外键约束，源数据已失效）` })
          }
          continue
        }
        // 3) 唯一约束冲突：跳过重复行（建议放宽云端唯一约束以完整导入）
        if (/unique constraint|duplicate key|violates unique/i.test(msg)) {
          skipped++
          if (!errors.find((x) => x.table === t)) {
            errors.push({ table: t, message: `${t}：唯一约束冲突，已跳过重复记录（可在 Supabase 放宽该约束以完整导入）` })
          }
          continue
        }
        // 其他错误：记录为失败
        failed++
        if (!errors.find((x) => x.table === t)) errors.push({ table: t, message: msg })
      }
    }
  }
  return { inserted, skipped, failed, tables, errors }
}

// ---- 清空全部 ----
export async function clearAll(): Promise<number> {
  let count = 0
  for (const t of TABLES) {
    const repo = createRepo(t)
    const rows = await repo.list()
    for (const r of rows) {
      await repo.remove(r.id)
      count++
    }
  }
  return count
}

// ---- 浏览器文件下载 ----
export function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---- 选择并读取文件 ----
export function pickFile(accept = '.json'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] || null)
    input.click()
  })
}

export async function readFileText(file: File): Promise<string> {
  return await file.text()
}
