// ============================================================================
// 数据访问层
//  - 有 Supabase 配置：云端 CRUD + Realtime 实时订阅
//  - 无配置 / 离线：localStorage 缓存 + 离线写队列，联网后自动合并
// ============================================================================
import { supabase, HAS_SUPABASE, LOCAL_USER } from './supabase'
import { storage } from './storage'

export type Row = Record<string, any>

// 生成 UUID：crypto.randomUUID 仅在安全上下文（HTTPS / localhost）可用；
// 手机经内网 IP(http://192.168.x.x)访问时不可用，需降级实现，否则 insert 会崩。
export function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// 当前用户 id（登录后由 auth 设置）
let currentUserId = LOCAL_USER
export function setCurrentUser(id: string) {
  currentUserId = id || LOCAL_USER
}
export function getCurrentUser() {
  return currentUserId
}

// 网络状态
let online = typeof navigator !== 'undefined' ? navigator.onLine : true
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    online = true
    void flushQueue()
  })
  window.addEventListener('offline', () => {
    online = false
  })
}
export function isOnline() {
  return online
}

// ---- 本地存储键 ----
const dataKey = (table: string) => `data:${table}`
const cacheKey = (table: string) => `cache:${currentUserId}:${table}`
const queueKey = () => `queue`

type QueueItem = {
  op: 'insert' | 'update' | 'delete'
  table: string
  row?: Row
  id?: string
  patch?: Row
}

function readTable(table: string): Row[] {
  return storage.read<Row[]>(dataKey(table), [])
}
function writeTable(table: string, rows: Row[]) {
  storage.write(dataKey(table), rows)
}
function readCache(table: string): Row[] {
  return storage.read<Row[]>(cacheKey(table), [])
}
function writeCache(table: string, rows: Row[]) {
  storage.write(cacheKey(table), rows)
}
function readQueue(): QueueItem[] {
  return storage.read<QueueItem[]>(queueKey(), [])
}
function writeQueue(q: QueueItem[]) {
  storage.write(queueKey(), q)
}

function dispatchChange(table: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(`lb:change:${table}`))
  }
}

// 离线队列重放（联网恢复时）
async function flushQueue() {
  if (!HAS_SUPABASE || !supabase || !online) return
  const q = readQueue()
  if (!q.length) return
  const remaining: QueueItem[] = []
  for (const item of q) {
    try {
      if (item.op === 'insert' && item.row) {
        const { id, ...rest } = item.row
        await supabase.from(item.table).insert({ ...rest, user_id: currentUserId })
      } else if (item.op === 'update' && item.id && item.patch) {
        await supabase.from(item.table).update(item.patch).eq('id', item.id).eq('user_id', currentUserId)
      } else if (item.op === 'delete' && item.id) {
        await supabase.from(item.table).delete().eq('id', item.id).eq('user_id', currentUserId)
      }
    } catch {
      remaining.push(item) // 失败保留，下次重试
    }
  }
  writeQueue(remaining)
  // 重放完成，通知各 store 重新从云端拉取
  const tables = new Set(q.map((i) => i.table))
  tables.forEach((t) => dispatchChange(t))
}

export interface Repo {
  list: (order?: string) => Promise<Row[]>
  insert: (row: Row) => Promise<Row>
  update: (id: string, patch: Row) => Promise<void>
  remove: (id: string) => Promise<void>
  subscribe: (cb: () => void) => () => void
}

export function createRepo(table: string): Repo {
  // ---- 本地模式 ----
  if (!HAS_SUPABASE || !supabase) {
    return {
      async list() {
        return readTable(table).filter((r) => r.user_id === currentUserId)
      },
      async insert(row) {
        const rows = readTable(table)
        const full = { id: genId(), created_at: new Date().toISOString(), ...row, user_id: currentUserId }
        rows.push(full)
        writeTable(table, rows)
        dispatchChange(table)
        return full
      },
      async update(id, patch) {
        const rows = readTable(table).map((r) => (r.id === id ? { ...r, ...patch } : r))
        writeTable(table, rows)
        dispatchChange(table)
      },
      async remove(id) {
        writeTable(table, readTable(table).filter((r) => r.id !== id))
        dispatchChange(table)
      },
      subscribe(cb) {
        const handler = () => cb()
        window.addEventListener(`lb:change:${table}`, handler)
        return () => window.removeEventListener(`lb:change:${table}`, handler)
      }
    }
  }

  // ---- Supabase 云端模式 ----
  // 各操作定义为闭包变量：subscribe 内部可安全引用 list（避免 this 指向错误）
  const list = async (order = 'created_at') => {
    if (!online) return readCache(table)
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', currentUserId)
      .order(order)
    if (error) {
      console.error('[db] list error', table, error.message)
      return readCache(table)
    }
    const rows = (data as Row[]) || []
    writeCache(table, rows)
    return rows
  }
  const insert = async (row: Row) => {
    const payload = { ...row, user_id: currentUserId }
    if (!online) {
      // 乐观写入缓存 + 入队
      const optimistic = { id: genId(), ...payload, created_at: new Date().toISOString() }
      writeCache(table, [...readCache(table), optimistic])
      const q = readQueue()
      q.push({ op: 'insert', table, row: optimistic })
      writeQueue(q)
      dispatchChange(table)
      return optimistic
    }
    const { data, error } = await supabase.from(table).insert(payload).select().single()
    if (error) throw error
    const fresh = data as Row
    writeCache(table, [...readCache(table), fresh])
    dispatchChange(table)
    return fresh
  }
  const update = async (id: string, patch: Row) => {
    if (!online) {
      const rows = readCache(table).map((r) => (r.id === id ? { ...r, ...patch } : r))
      writeCache(table, rows)
      const q = readQueue()
      q.push({ op: 'update', table, id, patch })
      writeQueue(q)
      dispatchChange(table)
      return
    }
    const { error } = await supabase.from(table).update(patch).eq('id', id).eq('user_id', currentUserId)
    if (error) throw error
    writeCache(table, readCache(table).map((r) => (r.id === id ? { ...r, ...patch } : r)))
    dispatchChange(table)
  }
  const remove = async (id: string) => {
    if (!online) {
      writeCache(table, readCache(table).filter((r) => r.id !== id))
      const q = readQueue()
      q.push({ op: 'delete', table, id })
      writeQueue(q)
      dispatchChange(table)
      return
    }
    const { error } = await supabase.from(table).delete().eq('id', id).eq('user_id', currentUserId)
    if (error) throw error
    writeCache(table, readCache(table).filter((r) => r.id !== id))
    dispatchChange(table)
  }
  const subscribe = (cb: () => void) => {
    // 1) 本地变更兜底：本用户自己的增删改派发的 dispatchChange 立即触发 reload，
    //    不依赖 Supabase Realtime 是否开启，保证单设备操作后即时刷新。
    const handler = () => cb()
    window.addEventListener(`lb:change:${table}`, handler)
    // 2) Supabase Realtime：其他设备（手机/电脑）变更实时同步
    let channel: any
    if (supabase) {
      // supabase.channel(name) 会复用同名已 subscribe 的频道。HMR / 重复挂载场景下，
      // 复用到的旧频道若已经 subscribe()，再调用 .on('postgres_changes') 会抛错：
      // "cannot add postgres_changes callbacks ... after subscribe()"。
      // 故每次订阅使用唯一频道名，并先清掉同表同用户的残留频道。
      const base = `${table}:${currentUserId}`
      const topic = `realtime:${base}`
      try {
        supabase
          .getChannels()
          .filter((c: any) => c.topic === topic || c.topic.startsWith(`${topic}:`))
          .forEach((c: any) => {
            try {
              supabase.removeChannel(c)
            } catch {
              /* ignore */
            }
          })
      } catch {
        /* getChannels 不可用时跳过清理，唯一频道名仍可避免报错 */
      }
      const channelName = `${base}:${genId()}`
      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `user_id=eq.${currentUserId}` },
          () => {
            void list().then(() => cb())
          }
        )
        .subscribe()
    }
    return () => {
      window.removeEventListener(`lb:change:${table}`, handler)
      if (channel) supabase.removeChannel(channel)
    }
  }
  return { list, insert, update, remove, subscribe }
}
