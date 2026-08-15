// 轻量 localStorage 命名空间封装（用于本地降级模式与离线缓存）

const NS = 'lb'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${NS}:${key}`)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(`${NS}:${key}`, JSON.stringify(value))
  } catch {
    /* 容量溢出忽略 */
  }
}

export const storage = { read, write }
