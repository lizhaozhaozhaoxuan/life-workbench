import { Solar, Lunar } from 'lunar-javascript'

/** 公历日期 -> 农历中文（如 "五月初八"） */
export function toLunarText(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const lunar = Solar.fromYmd(d.getFullYear(), d.getMonth() + 1, d.getDate()).getLunar()
  return `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`
}

export interface AnniversaryLike {
  date: string
  is_lunar: boolean
  repeat_year: boolean
  lunar_month?: number | null
  lunar_day?: number | null
}

/** 计算纪念日下一次到来的公历日期（用于倒计时） */
export function nextOccurrence(rec: AnniversaryLike): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (rec.is_lunar && rec.lunar_month && rec.lunar_day) {
    for (let y = today.getFullYear(); y <= today.getFullYear() + 1; y++) {
      try {
        const solar = Lunar.fromYmd(y, rec.lunar_month, rec.lunar_day).getSolar()
        const d = new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay())
        if (d >= today) return d
      } catch {
        /* 非法农历日期跳过 */
      }
    }
  }

  const base = new Date(rec.date)
  const d = new Date(base)
  d.setFullYear(today.getFullYear())
  if (d < today && rec.repeat_year) d.setFullYear(today.getFullYear() + 1)
  return d
}

/** 距离目标日期天数（负数表示已过） */
export function daysUntil(target: Date): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const t = new Date(target)
  t.setHours(0, 0, 0, 0)
  return Math.round((t.getTime() - today.getTime()) / 86400000)
}
