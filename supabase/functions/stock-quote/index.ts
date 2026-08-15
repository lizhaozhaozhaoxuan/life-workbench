// Supabase Edge Function: 股票行情代理
// 由服务端抓取新浪行情接口（避免浏览器直连 CORS / 编码问题），
// 返回：实时价、昨收、今开、最高、最低、成交量、振幅、大盘指数、历史日K线。
// 前端用 supabase.functions.invoke('stock-quote', { body: { code } }) 同源调用。
//
// 部署：supabase functions deploy stock-quote
// 调用：supabase.functions.invoke('stock-quote', { body: { code: '600000' } })

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SINA_REFERER = 'https://finance.sina.com.cn/'

// 将股票代码归一化为新浪格式：sh600000 / sz000001 / hk00700 / bj8xxxxx
function normalize(code: string): string {
  const c = code.trim().toLowerCase()
  if (/^(sh|sz|hk|bj)/.test(c)) return c
  const digits = c.replace(/\D/g, '')
  if (/^\d{5}$/.test(digits)) return `hk${digits}` // 港股 5 位
  if (/^[69]/.test(digits)) return `sh${digits}` // 沪市 / 科创板 / B股
  if (/^(0|3)/.test(digits)) return `sz${digits}` // 深市 / 创业板
  if (/^[84]/.test(digits)) return `bj${digits}` // 北交所
  return c
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { Referer: SINA_REFERER } })
  const buf = await res.arrayBuffer()
  // 新浪接口为 GBK 编码
  return new TextDecoder('gbk').decode(buf)
}

type Kline = { date: string; open: number; close: number; high: number; low: number; volume: number }

async function fetchQuote(c: string) {
  const text = await fetchText(`https://hq.sinajs.cn/list=${c}`)
  const m = text.match(/"([^"]*)"/)
  if (!m || !m[1]) return null
  const f = m[1].split(',')
  if (!f[0] || f[3] === undefined) return null // 无效代码返回空串
  const price = parseFloat(f[3])
  const prevClose = parseFloat(f[2])
  const open = parseFloat(f[1])
  const high = parseFloat(f[4])
  const low = parseFloat(f[5])
  const volume = parseFloat(f[8]) // 股
  const amplitude = prevClose ? ((high - low) / prevClose) * 100 : null
  return {
    code: c,
    name: f[0],
    price: isNaN(price) ? null : price,
    prevClose: isNaN(prevClose) ? null : prevClose,
    open: isNaN(open) ? null : open,
    high: isNaN(high) ? null : high,
    low: isNaN(low) ? null : low,
    volume: isNaN(volume) ? null : volume,
    amplitude: amplitude == null || isNaN(amplitude) ? null : amplitude,
  }
}

async function fetchKline(c: string): Promise<Kline[]> {
  const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${c}&scale=240&ma=no&datalen=320`
  const text = await fetchText(url)
  let raw: any[] = []
  try {
    raw = JSON.parse(text)
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  return raw
    .map((k) => ({
      date: String(k.day),
      open: parseFloat(k.open),
      close: parseFloat(k.close),
      high: parseFloat(k.high),
      low: parseFloat(k.low),
      volume: parseFloat(k.volume),
    }))
    .filter((k) => !isNaN(k.close) && !isNaN(k.high) && !isNaN(k.low))
}

async function fetchIndex(c: string) {
  try {
    const text = await fetchText(`https://hq.sinajs.cn/list=${c}`)
    const m = text.match(/"([^"]*)"/)
    if (!m || !m[1]) return null
    const f = m[1].split(',')
    const price = parseFloat(f[3])
    const prevClose = parseFloat(f[2])
    if (!f[0] || isNaN(price) || isNaN(prevClose) || prevClose === 0) return null
    return { name: f[0], price, changePct: ((price - prevClose) / prevClose) * 100 }
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const { code } = await req.json()
    if (!code) {
      return new Response(JSON.stringify({ ok: false, error: '缺少 code 参数' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const c = normalize(code)
    const [quote, klines, index] = await Promise.all([fetchQuote(c), fetchKline(c), fetchIndex('sh000001')])
    if (!quote || quote.price == null) {
      return new Response(JSON.stringify({ ok: false, error: '未找到该股票行情，请检查代码' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    return new Response(
      JSON.stringify({ ok: true, ...quote, index, klines }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
