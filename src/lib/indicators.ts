// 技术指标与股票分析（纯计算，无副作用）
// 输入历史日K线即可计算 MACD / KDJ / RSI / BOLL / 均线，
// 并结合当日行情与大盘情绪生成短期、长期操作建议。

export type Kline = {
  date: string
  open: number
  close: number
  high: number
  low: number
  volume: number
}

export type RawQuote = {
  ok?: boolean
  code?: string
  name?: string
  price?: number | null
  prevClose?: number | null
  open?: number | null
  high?: number | null
  low?: number | null
  volume?: number | null
  turnoverRate?: number | null
  amplitude?: number | null
  pe?: number | null
  index?: { name: string; price: number; changePct: number } | null
  klines?: Kline[]
  error?: string
}

// ---- 基础序列 ----
export function ma(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = []
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= n) sum -= values[i - n]
    out.push(i >= n - 1 ? sum / n : null)
  }
  return out
}

export function ema(values: number[], n: number): number[] {
  const k = 2 / (n + 1)
  const out: number[] = []
  let prev = values[0]
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k)
    out.push(prev)
  }
  return out
}

export function macd(closes: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(closes, fast)
  const emaSlow = ema(closes, slow)
  const dif = closes.map((_, i) => emaFast[i] - emaSlow[i])
  const dea = ema(dif, signal)
  const hist = dif.map((d, i) => (d - dea[i]) * 2)
  return { dif, dea, hist }
}

export function kdj(klines: Kline[], n = 9) {
  const K: number[] = []
  const D: number[] = []
  const J: number[] = []
  let prevK = 50
  let prevD = 50
  for (let i = 0; i < klines.length; i++) {
    const start = Math.max(0, i - n + 1)
    const window = klines.slice(start, i + 1)
    const lowN = Math.min(...window.map((w) => w.low))
    const highN = Math.max(...window.map((w) => w.high))
    const rsv = highN === lowN ? 50 : ((klines[i].close - lowN) / (highN - lowN)) * 100
    const k = (2 / 3) * prevK + (1 / 3) * rsv
    const d = (2 / 3) * prevD + (1 / 3) * k
    const j = 3 * k - 2 * d
    K.push(k)
    D.push(d)
    J.push(j)
    prevK = k
    prevD = d
  }
  return { K, D, J }
}

export function rsi(closes: number[], n = 14): (number | null)[] {
  const out: (number | null)[] = []
  let gain = 0
  let loss = 0
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      out.push(null)
      continue
    }
    const diff = closes[i] - closes[i - 1]
    const g = Math.max(0, diff)
    const l = Math.abs(Math.min(0, diff))
    if (i < n) {
      gain += g
      loss += l
      out.push(null)
    } else if (i === n) {
      gain /= n
      loss /= n
      out.push(loss === 0 ? 100 : 100 - 100 / (1 + gain / loss))
    } else {
      gain = (gain * (n - 1) + g) / n
      loss = (loss * (n - 1) + l) / n
      out.push(loss === 0 ? 100 : 100 - 100 / (1 + gain / loss))
    }
  }
  return out
}

export function boll(closes: number[], n = 20, k = 2) {
  const mid = ma(closes, n)
  const upper: (number | null)[] = []
  const lower: (number | null)[] = []
  for (let i = 0; i < closes.length; i++) {
    if (i < n - 1) {
      upper.push(null)
      lower.push(null)
      continue
    }
    const window = closes.slice(i - n + 1, i + 1)
    const mean = window.reduce((a, b) => a + b, 0) / n
    const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / n
    const sd = Math.sqrt(variance)
    upper.push(mean + k * sd)
    lower.push(mean - k * sd)
  }
  return { mid, upper, lower }
}

const fix = (v: number | null | undefined, d = 2) => (v == null || isNaN(v) ? null : Number(v.toFixed(d)))
const last = <T,>(arr: T[]) => arr[arr.length - 1]
const prev = <T,>(arr: T[]) => arr[arr.length - 2]

export type AnalysisResult = {
  ok: boolean
  error?: string
  day?: {
    price: number
    changePct: number | null
    amplitude: number | null
    turnoverRate: number | null
    volumeRatio: number | null
    pe: number | null
    summary: string
  }
  sentiment?: { label: string; score: number; summary: string; indexText: string }
  indicators?: {
    macd: { text: string; status: '金叉' | '死叉' | '多头' | '空头' }
    kdj: { text: string; status: '超买' | '超卖' | '金叉' | '死叉' | '中性' }
    rsi: { text: string; status: '超买' | '超卖' | '中性' }
    boll: { text: string; position: '上轨上方' | '通道中' | '下轨下方' }
    ma: { text: string; bull: boolean }
  }
  signals?: string[]
  shortTerm?: string
  longTerm?: string
  profit?: { pct: number; text: string } | null
}

export function analyzeStock(q: RawQuote, costPrice?: number): AnalysisResult {
  if (!q.ok || !q.klines || q.klines.length < 30) {
    return {
      ok: false,
      error: q.error || 'K线数据不足（需 ≥30 个交易日），无法计算技术指标。可能是未部署 Edge Function 代理，或该代码无行情。',
    }
  }
  const klines = q.klines
  const closes = klines.map((k) => k.close)
  const price = q.price != null ? q.price : last(closes)
  const prevClose = q.prevClose != null ? q.prevClose : klines[klines.length - 2]?.close ?? last(closes)

  // ---- 当日行情 ----
  const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : null
  const amplitude = q.amplitude != null ? q.amplitude : prevClose ? ((q.high! - q.low!) / prevClose) * 100 : null
  // 量比：今日量 / 近5日均量（不含今日）
  let volumeRatio: number | null = null
  const todayVol = q.volume != null ? q.volume : last(klines).volume
  if (klines.length > 6 && todayVol != null) {
    const past = klines.slice(-6, -1).map((k) => k.volume).filter((v) => !isNaN(v))
    const avg = past.reduce((a, b) => a + b, 0) / (past.length || 1)
    if (avg > 0) volumeRatio = todayVol / avg
  }

  // ---- 市场情绪（结合大盘 + 量能 + 个股强弱）----
  const idx = q.index
  const idxPct = idx?.changePct ?? 0
  let score = 0
  if (changePct != null) score += changePct * 3 // 当日涨幅贡献
  if (idxPct) score += idxPct * 4 // 大盘贡献更大
  if (volumeRatio != null) score += volumeRatio > 1.5 ? 8 : volumeRatio < 0.7 ? -8 : 0
  score = Math.max(-100, Math.min(100, Math.round(score)))
  let sentLabel = '中性'
  if (score >= 25) sentLabel = '偏多'
  else if (score >= 50) sentLabel = '看多'
  else if (score <= -25) sentLabel = '偏空'
  else if (score <= -50) sentLabel = '看空'
  const strongerThanIdx = changePct != null && changePct - idxPct > 0.5
  const sentSummary = `个股当日${changePct != null ? (changePct >= 0 ? '上涨' : '下跌') + Math.abs(changePct).toFixed(2) + '%' : '—'}${
    strongerThanIdx ? '，强于大盘' : ''
  }；${volumeRatio != null ? (volumeRatio > 1.5 ? '明显放量' : volumeRatio < 0.7 ? '明显缩量' : '量能平稳') : '量能未知'}。综合情绪${sentLabel}。`
  const indexText = idx ? `${idx.name} ${idx.changePct >= 0 ? '+' : ''}${idx.changePct.toFixed(2)}%` : '大盘数据缺失'

  // ---- 技术指标 ----
  const m = macd(closes)
  const kd = kdj(klines)
  const r = rsi(closes)
  const b = boll(closes)
  const ma5 = last(ma(closes, 5))
  const ma20 = last(ma(closes, 20))
  const ma60 = last(ma(closes, 60))

  // MACD 金叉/死叉判断
  let macdStatus: AnalysisResult['indicators']!['macd']['status'] = last(m.dif) > last(m.dea) ? '多头' : '空头'
  if (last(m.dif) > last(m.dea) && prev(m.dif) <= prev(m.dea)) macdStatus = '金叉'
  else if (last(m.dif) < last(m.dea) && prev(m.dif) >= prev(m.dea)) macdStatus = '死叉'
  const macdText = `DIF ${fix(last(m.dif))} / DEA ${fix(last(m.dea))} / 柱 ${fix(last(m.hist))}（${macdStatus}）`

  // KDJ
  const jv = last(kd.J)
  const kv = last(kd.K)
  const dv = last(kd.D)
  let kdjStatus: AnalysisResult['indicators']!['kdj']['status'] = '中性'
  if (jv > 100) kdjStatus = '超买'
  else if (jv < 0) kdjStatus = '超卖'
  else if (kv > dv && prev(kd.K) <= prev(kd.D)) kdjStatus = '金叉'
  else if (kv < dv && prev(kd.K) >= prev(kd.D)) kdjStatus = '死叉'
  const kdjText = `K ${fix(kv)} / D ${fix(dv)} / J ${fix(jv)}（${kdjStatus}）`

  // RSI
  const rv = last(r)
  let rsiStatus: AnalysisResult['indicators']!['rsi']['status'] = '中性'
  if (rv != null) {
    if (rv > 70) rsiStatus = '超买'
    else if (rv < 30) rsiStatus = '超卖'
  }
  const rsiText = `RSI(14) ${rv != null ? fix(rv) : '—'}（${rsiStatus}）`

  // BOLL
  const upper = last(b.upper)
  const midB = last(b.mid)
  const lower = last(b.lower)
  let position: AnalysisResult['indicators']!['boll']['position'] = '通道中'
  if (upper != null && price > upper) position = '上轨上方'
  else if (lower != null && price < lower) position = '下轨下方'
  const bollText = `上 ${fix(upper)} / 中 ${fix(midB)} / 下 ${fix(lower)}（${position}）`

  // 均线
  const bull = ma5 != null && ma20 != null && ma60 != null && ma5 > ma20 && ma20 > ma60
  const maText = `MA5 ${fix(ma5)} / MA20 ${fix(ma20)} / MA60 ${fix(ma60)}（${bull ? '多头排列' : ma5! < ma20! && ma20! < ma60! ? '空头排列' : '纠缠'}）`

  const signals: string[] = []
  if (macdStatus === '金叉') signals.push('MACD 金叉')
  if (macdStatus === '死叉') signals.push('MACD 死叉')
  if (kdjStatus === '金叉') signals.push('KDJ 金叉')
  if (kdjStatus === '死叉') signals.push('KDJ 死叉')
  if (kdjStatus === '超买') signals.push('KDJ 超买')
  if (kdjStatus === '超卖') signals.push('KDJ 超卖')
  if (rsiStatus === '超买') signals.push('RSI 超买')
  if (rsiStatus === '超卖') signals.push('RSI 超卖')
  if (bull) signals.push('均线多头')
  if (position === '上轨上方') signals.push('触及布林上轨')
  if (position === '下轨下方') signals.push('触及布林下轨')

  // ---- 短期操作建议 (1-5 天) ----
  let shortTerm = ''
  const bullish = (macdStatus === '金叉' || macdStatus === '多头') && kdjStatus !== '超买' && kdjStatus !== '死叉'
  const bearish = (macdStatus === '死叉' || macdStatus === '空头') && kdjStatus !== '超卖' && kdjStatus !== '金叉'
  if (bullish && (volumeRatio == null || volumeRatio >= 1)) {
    shortTerm = '短期偏多：MACD 与 KDJ 共振向上，量能配合时可轻仓参与，关注前高压力；设好止损（如跌破 MA5/MA20）。'
  } else if (bearish) {
    shortTerm = '短期偏空：MACD/KDJ 走弱，建议观望或减仓，等待指标再次金叉、量能放大再考虑。'
  } else if (kdjStatus === '超买' || rsiStatus === '超买' || position === '上轨上方') {
    shortTerm = '短期有超买迹象：短线勿追高，可逢高部分止盈，回调至中轨附近再看承接。'
  } else if (kdjStatus === '超卖' || rsiStatus === '超卖' || position === '下轨下方') {
    shortTerm = '短期超卖：有反弹需求，可小仓试探，但需确认 MACD 不再创新低、量能回补。'
  } else {
    shortTerm = '短期震荡：多空信号不明显，建议观望为主，等方向选择（放量突破或破位）再跟进。'
  }

  // ---- 长期操作建议 (周/月) ----
  let longTerm = ''
  if (bull && macdStatus !== '死叉') {
    longTerm = '中长期趋势偏多：均线多头排列，MACD 红柱未明显收敛，可依托 MA20/中轨持有，回踩不破可加仓。'
  } else if (!bull && macdStatus !== '金叉') {
    longTerm = '中长期趋势偏弱：均线空头或纠缠，建议控制仓位、以观望为主，待趋势反转（均线重新多头）再布局。'
  } else {
    longTerm = '中长期方向中性：趋势尚在整理，建议波段操作、高抛低吸，留意 MACD 与均线的最终选择。'
  }
  if (costPrice && costPrice > 0) {
    const pct = ((price - costPrice) / costPrice) * 100
    if (pct >= 0) longTerm += ` 当前持仓盈利 +${pct.toFixed(2)}%，可让利润奔跑但注意止盈保护。`
    else longTerm += ` 当前持仓浮亏 ${pct.toFixed(2)}%，需评估基本面是否变化，控制下行风险。`
  }

  const profit =
    costPrice && costPrice > 0
      ? {
          pct: ((price - costPrice) / costPrice) * 100,
          text: `${((price - costPrice) / costPrice) * 100 >= 0 ? '盈利' : '浮亏'} ${Math.abs(((price - costPrice) / costPrice) * 100).toFixed(2)}%`,
        }
      : null

  return {
    ok: true,
    day: {
      price,
      changePct: fix(changePct),
      amplitude: fix(amplitude),
      turnoverRate: fix(q.turnoverRate, 2),
      volumeRatio: fix(volumeRatio, 2),
      pe: fix(q.pe, 2),
      summary: `现价 ¥${price}，较昨收${changePct != null ? (changePct >= 0 ? '+' : '') + changePct.toFixed(2) + '%' : '—'}，振幅 ${amplitude != null ? amplitude.toFixed(2) : '—'}%，换手 ${q.turnoverRate != null ? q.turnoverRate.toFixed(2) : '—'}%，量比 ${volumeRatio != null ? volumeRatio.toFixed(2) : '—'}，市盈率 ${q.pe != null ? q.pe.toFixed(2) : '—'}。`,
    },
    sentiment: { label: sentLabel, score, summary: sentSummary, indexText },
    indicators: {
      macd: { text: macdText, status: macdStatus },
      kdj: { text: kdjText, status: kdjStatus },
      rsi: { text: rsiText, status: rsiStatus },
      boll: { text: bollText, position },
      ma: { text: maText, bull },
    },
    signals,
    shortTerm,
    longTerm,
    profit,
  }
}
