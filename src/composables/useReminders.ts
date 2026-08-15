import { createRepo } from '@/lib/db'
import { nextOccurrence, daysUntil } from '@/lib/lunar'

const remindedKey = 'lb:reminded'
function getReminded(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(remindedKey) || '{}')
  } catch {
    return {}
  }
}
function markReminded(k: string) {
  const r = getReminded()
  r[k] = new Date().toDateString()
  localStorage.setItem(remindedKey, JSON.stringify(r))
}
function alreadyToday(k: string) {
  return getReminded()[k] === new Date().toDateString()
}

function notify(title: string, body: string, key: string) {
  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  if (alreadyToday(key)) return
  new Notification(title, { body, icon: '/icon.svg' })
  markReminded(key)
}

export function requestNotify() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
}

let timer: ReturnType<typeof setInterval> | null = null

export function startReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const tick = async () => {
    const now = Date.now()
    try {
      const todos = await createRepo('todos').list()
      for (const t of todos) {
        if (t.status === 'done') continue
        if (t.remind_at && new Date(t.remind_at).getTime() <= now) {
          notify('待办提醒', t.title, `todo:${t.id}`)
        }
      }
      const easy = await createRepo('life_easy').list()
      for (const e of easy) {
        if (e.done) continue
        const target = e.next_remind_at || e.remind_at
        if (target && new Date(target).getTime() <= now) {
          notify('生活提醒', e.title, `easy:${e.id}`)
        }
      }
      const ann = await createRepo('life_anniversary').list()
      for (const a of ann) {
        const d = daysUntil(nextOccurrence(a))
        if (d >= 0 && d <= a.advance_days) {
          notify('纪念日', `${a.name} 还有 ${d} 天`, `ann:${a.id}:${new Date().toDateString()}`)
        }
      }
    } catch {
      /* ignore */
    }
  }
  tick()
  timer = setInterval(tick, 60000)
}

export function stopReminders() {
  if (timer) clearInterval(timer)
}
