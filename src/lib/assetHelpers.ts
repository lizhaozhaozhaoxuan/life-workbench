// ============================================================================
// 实物资产管理 - 通用工具（类型 / 预置类目 / 时效计算 / 提醒聚合 / 统计 / CSV）
// ============================================================================
import dayjs from 'dayjs'
import type { Row } from './db'

// ---- 类型 ----
export type AssetCatType = 'warranty' | 'perishable' | 'durable'
export type AssetStatus = 'in_use' | 'idle' | 'damaged' | 'scrapped' | 'lent'
export type WishPriority = 'high' | 'medium' | 'low'
export type WishStatus = 'pending' | 'purchased' | 'abandoned'

export const CAT_TYPE_LABEL: Record<AssetCatType, string> = {
  warranty: '保修类',
  perishable: '时效类',
  durable: '长效类'
}
export const STATUS_LABEL: Record<AssetStatus, string> = {
  in_use: '在用',
  idle: '闲置',
  damaged: '损坏',
  scrapped: '报废',
  lent: '借出'
}
export const WISH_PRIORITY_LABEL: Record<WishPriority, string> = { high: '高', medium: '中', low: '低' }
export const WISH_STATUS_LABEL: Record<WishStatus, string> = {
  pending: '待采购',
  purchased: '已采购',
  abandoned: '已放弃'
}

/** 资产分类（一级） */
export interface Category extends Row {
  id: string
  name: string
  type: AssetCatType
  icon: string
  parent_id: string | null
  is_preset: boolean
}

/** 预置 5 大基础类目（首次为空时自动写入） */
export const PRESET_CATEGORIES: { name: string; type: AssetCatType; icon: string }[] = [
  { name: '器材', type: 'warranty', icon: '🛠️' },
  { name: '家电', type: 'warranty', icon: '🔌' },
  { name: '电子设备', type: 'warranty', icon: '💻' },
  { name: '食材', type: 'perishable', icon: '🍎' },
  { name: '服饰', type: 'durable', icon: '👕' }
]

// ---- 金额精度（与记账模块一致的 cents 整数累加策略）----
export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}
export function toCents(n: number): number {
  return Math.round(Number(n) * 100)
}

/** 资产总价值：优先总价，否则 单价 × 数量 */
export function itemTotal(it: Row): number {
  if (it.total_price !== null && it.total_price !== undefined && it.total_price !== '') {
    return round2(Number(it.total_price))
  }
  const u = Number(it.unit_price) || 0
  const q = Number(it.quantity) || 1
  return round2(u * q)
}
export function itemValueCents(it: Row): number {
  return toCents(itemTotal(it))
}

// ---- 日期工具 ----
export function todayDate(): dayjs.Dayjs {
  return dayjs()
}
/** target 距今天数（正数=未来，负数=已过期） */
export function daysUntil(target?: string | null): number | null {
  if (!target) return null
  return dayjs(target).startOf('day').diff(dayjs().startOf('day'), 'day')
}
/** 自某日期至今的整月数 */
export function monthsSince(from?: string | null): number | null {
  if (!from) return null
  return dayjs().startOf('day').diff(dayjs(from).startOf('day'), 'month')
}

/** 保修剩余天数（起止优先；仅有起算 + 时长则推算结束日） */
export function warrantyRemainingDays(it: Row): number | null {
  if (it.warranty_end) return daysUntil(it.warranty_end)
  if (it.warranty_start && it.warranty_months) {
    const end = dayjs(it.warranty_start).add(Number(it.warranty_months), 'month')
    return daysUntil(end.format('YYYY-MM-DD'))
  }
  return null
}
/** 有效期剩余天数 */
export function expiryRemainingDays(it: Row): number | null {
  if (it.expiry_date) return daysUntil(it.expiry_date)
  return null
}
/** 闲置月数（优先最近使用日，否则购买日） */
export function idleMonths(it: Row): number | null {
  if (it.last_used_at) return monthsSince(it.last_used_at)
  if (it.purchase_date) return monthsSince(it.purchase_date)
  return null
}

// ---- 提醒配置（持久化到 localStorage，自定义预警提前量）----
export interface ReminderCfg {
  warrantyDays: number // 保修提前预警天数（默认 7）
  idleMonths: number // 闲置判定月数（默认 6）
}
const REMINDER_KEY = 'lb:asset_reminder_cfg'
export function getReminderCfg(): ReminderCfg {
  try {
    const cfg = JSON.parse(localStorage.getItem(REMINDER_KEY) || '{}')
    return {
      warrantyDays: Number(cfg.warrantyDays) || 7,
      idleMonths: Number(cfg.idleMonths) || 6
    }
  } catch {
    return { warrantyDays: 7, idleMonths: 6 }
  }
}
export function setReminderCfg(c: ReminderCfg) {
  localStorage.setItem(REMINDER_KEY, JSON.stringify(c))
}

// ---- 提醒聚合 ----
export type ReminderKind = 'warranty' | 'expiry' | 'idle'
export type ReminderLevel = 'expired' | 'urgent' | 'idle'
export interface AssetReminder {
  item: Row
  kind: ReminderKind
  level: ReminderLevel
  days: number | null
  message: string
}

/** 从资产列表聚合「过期 / 即将过期 / 即将过保 / 闲置」提醒，按严重度排序 */
export function collectReminders(items: Row[], cfg: ReminderCfg): AssetReminder[] {
  const out: AssetReminder[] = []
  const perishableWarn = 7 // 时效类临近过期预警阈值（天）
  for (const it of items) {
    if (it.archived) continue
    // 保修类
    if (it.category_type === 'warranty') {
      const d = warrantyRemainingDays(it)
      if (d === null) continue
      if (d < 0) out.push({ item: it, kind: 'warranty', level: 'expired', days: d, message: `已过保 ${Math.abs(d)} 天` })
      else if (d <= cfg.warrantyDays) out.push({ item: it, kind: 'warranty', level: 'urgent', days: d, message: `还有 ${d} 天过保` })
    }
    // 时效类
    else if (it.category_type === 'perishable') {
      const d = expiryRemainingDays(it)
      if (d === null) continue
      if (d < 0) out.push({ item: it, kind: 'expiry', level: 'expired', days: d, message: `已过期 ${Math.abs(d)} 天` })
      else if (d <= perishableWarn) out.push({ item: it, kind: 'expiry', level: 'urgent', days: d, message: `还有 ${d} 天过期` })
    }
    // 闲置（仅在用/借出状态才提示盘活，损坏/报废不提示）
    if (it.status === 'in_use' || it.status === 'lent') {
      const m = idleMonths(it)
      if (m !== null && m >= cfg.idleMonths) {
        out.push({ item: it, kind: 'idle', level: 'idle', days: null, message: `已 ${m} 个月未使用` })
      }
    }
  }
  const rank: Record<ReminderLevel, number> = { expired: 0, urgent: 1, idle: 2 }
  return out.sort((a, b) => rank[a.level] - rank[b.level])
}

// ---- 统计汇总（cents 整数累加，保证分类占比之和 === 总额）----
export interface AssetStats {
  totalCount: number
  totalValue: number // 元
  byCategory: { categoryId: string; name: string; count: number; value: number }[]
  expiredCount: number
  warrantyExpiredCount: number
  idleCount: number
}
export function computeStats(items: Row[], categories: Category[]): AssetStats {
  const active = items.filter((i) => !i.archived)
  let cents = 0
  const catMap = new Map<string, { name: string; count: number; cents: number }>()
  for (const it of active) {
    const v = itemValueCents(it)
    cents += v
    const key = it.category_id || 'uncat'
    const name = categories.find((c) => c.id === it.category_id)?.name || '未分类'
    const cur = catMap.get(key) || { name, count: 0, cents: 0 }
    cur.count += 1
    cur.cents += v
    catMap.set(key, cur)
  }
  const byCategory = [...catMap.entries()].map(([categoryId, v]) => ({
    categoryId,
    name: v.name,
    count: v.count,
    value: round2(v.cents / 100)
  }))
  byCategory.sort((a, b) => b.value - a.value)
  const cfg = getReminderCfg()
  const expiredCount = active.filter((i) => i.category_type === 'perishable' && (expiryRemainingDays(i) ?? 0) < 0).length
  const warrantyExpiredCount = active.filter((i) => i.category_type === 'warranty' && (warrantyRemainingDays(i) ?? 0) < 0).length
  const idleCount = active.filter((i) => (i.status === 'in_use' || i.status === 'lent') && (idleMonths(i) ?? 0) >= cfg.idleMonths).length
  return {
    totalCount: active.length,
    totalValue: round2(cents / 100),
    byCategory,
    expiredCount,
    warrantyExpiredCount,
    idleCount
  }
}

// ---- CSV 批量导入 ----
// 支持的中文表头 -> 字段映射。批量导入仅支持通用基础字段与时效字段，
// 图片列留空（导入后另行上传）。
export const CSV_HEADER_MAP: Record<string, string> = {
  资产名称: 'name',
  分类: 'categoryName',
  购买日期: 'purchase_date',
  单价: 'unit_price',
  总价: 'total_price',
  数量: 'quantity',
  状态: 'status',
  购买渠道: 'channel',
  备注: 'note',
  生产日期: 'production_date',
  有效期: 'expiry_date',
  保修开始: 'warranty_start',
  保修结束: 'warranty_end',
  保修时长: 'warranty_months'
}
const STATUS_REVERSE: Record<string, AssetStatus> = {
  在用: 'in_use',
  闲置: 'idle',
  损坏: 'damaged',
  报废: 'scrapped',
  借出: 'lent'
}

/** 解析 CSV 文本 -> 行对象（中文表头）。categoryName 由调用方解析为 category_id。 */
export function parseAssetCsv(text: string): { rows: Row[]; error?: string } {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return { rows: [], error: 'CSV 至少需要表头与一行数据' }
  // 简易 CSV（支持双引号包裹字段）
  const parseLine = (line: string): string[] => {
    const out: string[] = []
    let cur = ''
    let q = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (q) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"'; i++
        } else if (ch === '"') q = false
        else cur += ch
      } else if (ch === '"') q = true
      else if (ch === ',') { out.push(cur); cur = '' }
      else cur += ch
    }
    out.push(cur)
    return out
  }
  const headers = parseLine(lines[0]).map((h) => h.trim())
  const rows: Row[] = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const cells = parseLine(lines[i])
    const obj: Row = {}
    headers.forEach((h, idx) => {
      const field = CSV_HEADER_MAP[h]
      if (!field) return
      let val = (cells[idx] ?? '').trim()
      if (field === 'status') val = STATUS_REVERSE[val] || 'in_use'
      if (['unit_price', 'total_price', 'quantity', 'warranty_months'].includes(field) && val) val = Number(val)
      obj[field] = val === '' ? null : val
    })
    if (!obj.name) return { rows, error: `第 ${i + 1} 行缺少「资产名称」，已停止解析` }
    rows.push(obj)
  }
  return { rows }
}
