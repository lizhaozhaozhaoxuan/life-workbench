// 股票行情获取
// 优先通过 Supabase Edge Function（stock-quote）在服务端代理腾讯行情接口，
// 突破浏览器 CORS 限制，并额外返回历史日K线（供技术指标计算）与大盘指数。
// 未部署 Edge Function / 本地模式下回退为浏览器直连（常被 CORS 拦截，仅作兜底）。

import { supabase } from '@/lib/supabase'
import type { Kline, RawQuote } from '@/lib/indicators'

function normalizeCode(code: string): string {
  const c = code.trim().toLowerCase()
  if (c.startsWith('sh') || c.startsWith('sz') || c.startsWith('hk')) return c
  if (/^6/.test(c)) return `sh${c}`
  if (/^(0|3)/.test(c)) return `sz${c}`
  return c
}

/** 浏览器直连兜底（多数环境会被 CORS 拦截，返回 null） */
export async function fetchStockPrice(code: string): Promise<number | null> {
  const c = normalizeCode(code)
  try {
    const res = await fetch(`https://qt.gtimg.cn/q=${c}`, { mode: 'cors' })
    const text = await res.text()
    const m = text.match(/"([^"]*)"/)
    if (!m) return null
    const fields = m[1].split('~')
    const price = parseFloat(fields[3])
    return isNaN(price) ? null : price
  } catch {
    return null
  }
}

export type StockQuote = RawQuote

/**
 * 获取完整行情（现价 + K线 + 大盘）。
 * 1) 若已配置 Supabase，调用 Edge Function `stock-quote`（同源，无 CORS 问题）；
 * 2) 否则回退浏览器直连（仅现价，且常被 CORS 拦截）。
 */
export async function fetchStockQuote(code: string): Promise<StockQuote> {
  if (supabase) {
    try {
      const { data, error } = await supabase.functions.invoke('stock-quote', { body: { code } })
      if (!error && data?.ok) {
        const klines: Kline[] = Array.isArray(data.klines) ? data.klines : []
        return {
          ok: true,
          code: data.code,
          name: data.name,
          price: data.price,
          prevClose: data.prevClose,
          open: data.open,
          high: data.high,
          low: data.low,
          volume: data.volume,
          turnoverRate: data.turnoverRate,
          amplitude: data.amplitude,
          pe: data.pe,
          index: data.index ?? null,
          klines,
        }
      }
      // Edge Function 报错（未部署 / 网络问题）→ 落到兜底
    } catch {
      /* 落到兜底 */
    }
  }
  const p = await fetchStockPrice(code)
  if (p != null) {
    return { ok: true, code, price: p, klines: [] }
  }
  return {
    ok: false,
    error: '行情获取失败：浏览器跨域受限，且未部署 Supabase Edge Function 代理。请在 Supabase 部署 stock-quote 函数后重试。',
  }
}
