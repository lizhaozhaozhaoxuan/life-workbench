import dayjs from 'dayjs'

/**
 * 记账「一句话录入」本地解析器
 * ------------------------------------------------------------
 * 纯函数、零依赖（除 dayjs）、不联网、不上传，解析全程在本机完成。
 * 输入：一句自然语言，如「今天餐饮消费30元，备注海底捞」
 * 输出：结构化字段（收支类型 / 金额 / 分类 / 日期 / 备注）+ 未识别项提示
 */

export type FlowType = 'expense' | 'income'

export interface ParsedFlow {
  type: FlowType
  /** 解析出的金额；识别失败为 null（此时不应允许直接保存） */
  amount: number | null
  /** 匹配到的分类；未匹配时回落为「其他」，同时在 missing 里标记 */
  category: string
  note: string
  /** YYYY-MM-DD */
  trans_date: string
  /** 命中的原文片段，用于 UI 展示「我理解为…」 */
  hits: { type?: string; amount?: string; category?: string; date?: string; note?: string }
  /** 需要用户补充/确认的字段 */
  missing: Array<'amount' | 'category'>
}

export interface FlowCategorySets {
  expense: string[]
  income: string[]
}

/* ------------------------------ 中文数字 ------------------------------ */

const CN_DIGIT: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 壹: 1, 二: 2, 两: 2, 贰: 2, 三: 3, 叁: 3, 四: 4, 肆: 4,
  五: 5, 伍: 5, 六: 6, 陆: 6, 七: 7, 柒: 7, 八: 8, 捌: 8, 九: 9, 玖: 9
}
const CN_UNIT: Record<string, number> = {
  十: 10, 拾: 10, 百: 100, 佰: 100, 千: 1000, 仟: 1000, 万: 10000
}
const CN_NUM_CHARS = '零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟'

/**
 * 中文数字转阿拉伯数字，兼容口语省略：
 * 三十五→35、十五→15、一百二→120、一百零二→102、一千二→1200、两万三→23000
 */
export function cnIntToNumber(s: string): number {
  let result = 0
  let section = 0
  let cur = 0
  let lastUnit = 0
  let sawZero = false
  for (const ch of s) {
    if (ch === '零' || ch === '〇') {
      sawZero = true
      cur = 0
      continue
    }
    if (ch in CN_DIGIT) {
      cur = CN_DIGIT[ch]
      continue
    }
    if (ch in CN_UNIT) {
      const u = CN_UNIT[ch]
      if (u === 10000) {
        section = (section + cur) * 10000
        result += section
        section = 0
      } else {
        section += (cur === 0 ? 1 : cur) * u
      }
      cur = 0
      lastUnit = u
      sawZero = false
    }
  }
  if (cur > 0) {
    // 口语省略单位：一百二 → 一百二十；但「一百零二」里 零 之后的数字仍是个位
    if (!sawZero && lastUnit >= 100) section += cur * (lastUnit / 10)
    else section += cur
  }
  return result + section
}

const round2 = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100

/* ------------------------------ 金额 ------------------------------ */

interface AmountHit {
  value: number
  raw: string
}

const VERBS = '花|花了|消费|付|支付|付款|充值|充|交费|缴费|交|买|买了|收|收入|赚|入账|进账|到账'

function extractAmount(text: string): AmountHit | null {
  // A) 阿拉伯数字 + 货币单位（最可靠）
  let m = text.match(/(\d+(?:\.\d{1,2})?)\s*(?:元|块钱|块|RMB|rmb|¥|￥)/)
  if (m) return { value: Number(m[1]), raw: m[0].trim() }

  // B) 中文数字 + 货币单位，支持「三十五块五」这类口语小数
  m = text.match(new RegExp(`([${CN_NUM_CHARS}]+)\\s*(?:元|块钱|块)(?:([${CN_NUM_CHARS}])(?:毛|角)?)?`))
  if (m) {
    const intPart = cnIntToNumber(m[1])
    const dec = m[2] ? (CN_DIGIT[m[2]] ?? 0) / 10 : 0
    return { value: round2(intPart + dec), raw: m[0].trim() }
  }

  // C) 动词 + 阿拉伯数字（无单位），如「消费30」
  m = text.match(new RegExp(`(?:${VERBS})\\D{0,4}?(\\d+(?:\\.\\d{1,2})?)`))
  if (m) return { value: Number(m[1]), raw: m[0].trim() }

  // D) 动词 + 中文数字（无单位），如「花了二十」
  m = text.match(new RegExp(`(?:${VERBS})\\D{0,4}?([${CN_NUM_CHARS}]+)`))
  if (m) return { value: cnIntToNumber(m[1]), raw: m[0].trim() }

  // E) 兜底：先剔除日期型数字（3号 / 5月 / 8点），再取第一个独立数字
  const cleaned = text.replace(/\d{1,4}\s*[年月日号点时分]/g, ' ')
  m = cleaned.match(/(\d+(?:\.\d{1,2})?)/)
  if (m) return { value: Number(m[1]), raw: m[0] }

  return null
}

/* ------------------------------ 收支类型 ------------------------------ */

const INCOME_WORDS = [
  '收入', '工资', '薪水', '月薪', '收到', '收款', '进账', '入账', '到账',
  '报销', '退款', '退钱', '退货', '兼职', '副业', '外快', '稿费', '红包',
  '压岁钱', '礼金', '分红', '利息', '奖金', '绩效', '补贴', '收益',
  '赚了', '赚', '卖了', '中奖'
]
const EXPENSE_WORDS = [
  '消费', '花了', '花', '买了', '买', '支付', '付款', '付了', '付',
  '充值', '充', '交费', '缴费', '交了', '交', '吃', '喝', '打车',
  '加油', '请客', '报名', '订', '租', '罚款', '扣款', '扣了'
]

function detectType(text: string): { type: FlowType; hit?: string } {
  let inc = 0
  let exp = 0
  let incHit = ''
  let expHit = ''
  for (const w of INCOME_WORDS) {
    if (text.includes(w)) {
      inc += w.length
      if (w.length > incHit.length) incHit = w
    }
  }
  for (const w of EXPENSE_WORDS) {
    if (text.includes(w)) {
      exp += w.length
      if (w.length > expHit.length) expHit = w
    }
  }
  if (inc === 0 && exp === 0) return { type: 'expense' }
  return inc > exp ? { type: 'income', hit: incHit } : { type: 'expense', hit: expHit }
}

/* ------------------------------ 分类同义词 ------------------------------ */

/** 同义词 → 预设分类名（必须与 EXPENSE_PRESETS / INCOME_PRESETS 中的名字一致） */
const CAT_SYNONYMS: Record<string, string[]> = {
  餐饮: ['吃饭', '早餐', '早饭', '午餐', '午饭', '晚餐', '晚饭', '夜宵', '宵夜', '外卖', '火锅', '海底捞', '食堂', '咖啡', '奶茶', '饮料', '快餐', '早点', '烧烤', '麻辣烫', '零食', '水果', '下馆子', '面馆', '饭'],
  交通: ['打车', '滴滴', '地铁', '公交', '加油', '汽油', '停车', '高铁', '火车', '机票', '飞机', '过路费', '洗车', '违章', '共享单车', '单车', '车费'],
  购物: ['淘宝', '京东', '拼多多', '超市', '日用品', '快递', '网购', '商场', '便利店', '买菜'],
  居家: ['房租', '水费', '电费', '燃气', '物业', '家具', '保洁', '家电', '装修', '维修', '宽带费'],
  医疗: ['看病', '医院', '买药', '药费', '挂号', '体检', '牙医', '门诊', '住院', '药'],
  话费: ['话费', '流量', '手机费', '宽带', '通讯费'],
  礼物: ['礼物', '送礼', '礼品', '生日礼', '伴手礼', '回礼'],
  学习: ['买书', '书', '课程', '学费', '网课', '培训', '考试', '报名费', '教材', '补习', '驾校', '资料费'],
  娱乐: ['电影', '游戏', '演出', '演唱会', 'ktv', 'KTV', '剧本杀', '门票', '密室', '桌游', '酒吧', '网吧', '台球'],
  服饰: ['衣服', '裤子', '鞋', '鞋子', '外套', '内衣', '帽子', '袜子', '裙子', '羽绒服'],
  旅行: ['旅游', '旅行', '酒店', '民宿', '景区', '度假', '签证', '跟团', '导游', '露营'],
  社交: ['请客', '随礼', '份子钱', '聚会', '聚餐', '人情'],
  订阅: ['订阅', '会员', '网盘', '软件', '续费', 'vip', 'VIP', '会员费'],
  数码: ['手机', '电脑', '耳机', '键盘', '相机', '充电器', '平板', '显示器', '鼠标', '硬盘', '数码'],
  美容: ['美容', '理发', '美发', '护肤', '化妆', '医美', '面膜', '剪头', '洗发', '美甲'],
  宠物: ['宠物', '猫粮', '狗粮', '猫砂', '铲屎', '宠物医院', '猫', '狗'],
  保险: ['保险', '保费', '车险', '寿险', '重疾险'],
  工资: ['工资', '薪水', '月薪', '奖金', '绩效', '补贴', '加班费'],
  理财: ['理财', '分红', '利息', '基金', '股票', '收益', '定期', '余额宝'],
  兼职: ['兼职', '副业', '外包', '私活', '稿费', '外快'],
  红包: ['红包', '压岁钱', '礼金'],
  退款: ['退款', '退钱', '退货', '报销']
}

function detectCategory(
  text: string,
  type: FlowType,
  sets: FlowCategorySets
): { category: string | null; hit?: string } {
  // 只在该类型的预设集合里找，避免「红包」这类跨类词串味（支出随礼 vs 收入红包）
  const allowed = type === 'expense' ? sets.expense : sets.income
  const candidates: Array<{ cat: string; weight: number; hit: string }> = []
  for (const cat of allowed) {
    // 1) 分类名本身直接出现，权重最高（如句子里明说「餐饮」）
    if (cat && cat !== '其他' && text.includes(cat)) {
      candidates.push({ cat, weight: 100 + cat.length, hit: cat })
    }
    // 2) 同义词命中
    for (const syn of CAT_SYNONYMS[cat] || []) {
      if (syn && text.includes(syn)) candidates.push({ cat, weight: 10 + syn.length, hit: syn })
    }
  }
  if (!candidates.length) return { category: null }
  candidates.sort((a, b) => b.weight - a.weight)
  return { category: candidates[0].cat, hit: candidates[0].hit }
}

/* ------------------------------ 日期 ------------------------------ */

const WEEK_MAP: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7,
  '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7
}

function extractDate(text: string): { date: string; hit?: string } {
  const today = dayjs()

  // 绝对日期：2026年5月3日 / 2026-5-3
  let m = text.match(/(\d{4})\s*[年/\-]\s*(\d{1,2})\s*[月/\-]\s*(\d{1,2})\s*[日号]?/)
  if (m) {
    const d = dayjs(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    if (d.isValid()) return { date: d.format('YYYY-MM-DD'), hit: m[0] }
  }
  // 5月3日（当年）
  m = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/)
  if (m) {
    const d = today.month(Number(m[1]) - 1).date(Number(m[2]))
    if (d.isValid()) return { date: d.format('YYYY-MM-DD'), hit: m[0] }
  }
  // 相对日
  if (/大前天/.test(text)) return { date: today.subtract(3, 'day').format('YYYY-MM-DD'), hit: '大前天' }
  if (/前天/.test(text)) return { date: today.subtract(2, 'day').format('YYYY-MM-DD'), hit: '前天' }
  if (/(昨天|昨日|昨儿)/.test(text)) return { date: today.subtract(1, 'day').format('YYYY-MM-DD'), hit: '昨天' }
  if (/(明天|明日)/.test(text)) return { date: today.add(1, 'day').format('YYYY-MM-DD'), hit: '明天' }
  if (/(今天|今日|刚才|刚刚|今儿)/.test(text)) return { date: today.format('YYYY-MM-DD'), hit: '今天' }
  // 上上周三 / 上周三 / 周三 / 星期日
  m = text.match(/(上上|上|下|这|本)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天1-7])/)
  if (m) {
    const target = WEEK_MAP[m[2]]
    const cur = today.day() === 0 ? 7 : today.day() // 以周一为一周起点
    let diff = target - cur
    if (m[1] === '上') diff -= 7
    else if (m[1] === '上上') diff -= 14
    else if (m[1] === '下') diff += 7
    return { date: today.add(diff, 'day').format('YYYY-MM-DD'), hit: m[0] }
  }
  // 3号 / 3日（当月）
  m = text.match(/(?:^|[^\d])(\d{1,2})\s*[日号]/)
  if (m) {
    const day = Number(m[1])
    if (day >= 1 && day <= 31) return { date: today.date(day).format('YYYY-MM-DD'), hit: m[0].trim() }
  }
  // 缺省：今天
  return { date: today.format('YYYY-MM-DD') }
}

/* ------------------------------ 备注 ------------------------------ */

function extractNote(text: string): { note: string; matchedText: string } {
  // 显式标记：备注X / 说明X / 记录X / 注明X
  const m = text.match(/(?:备注|说明|记录|注明|补充)[:：是为]?\s*(.+)$/)
  if (m) {
    return { note: m[1].trim().replace(/^[，,、。\s]+/, ''), matchedText: m[0] }
  }
  // 逗号后的最后一段，且不含金额/日期线索，则判为备注
  const segs = text.split(/[，,。；;！!？?]/).map((s) => s.trim()).filter(Boolean)
  if (segs.length > 1) {
    const last = segs[segs.length - 1]
    const looksLikeNote =
      !!last &&
      !/\d/.test(last) &&
      !/[元块角毛钱]/.test(last) &&
      !/(今天|昨天|前天|周|星期|月|号)/.test(last) &&
      last.length <= 24
    if (looksLikeNote) return { note: last, matchedText: last }
  }
  return { note: '', matchedText: '' }
}

/* ------------------------------ 主入口 ------------------------------ */

export function parseFlowSentence(raw: string, sets: FlowCategorySets): ParsedFlow {
  const text = (raw || '').trim()
  const hits: ParsedFlow['hits'] = {}
  const todayStr = dayjs().format('YYYY-MM-DD')

  if (!text) {
    return { type: 'expense', amount: null, category: '其他', note: '', trans_date: todayStr, hits, missing: ['amount', 'category'] }
  }

  // 1) 先挖出备注并从工作串剔除 —— 避免「海底捞」这类词污染分类判断
  const noteRes = extractNote(text)
  const working = noteRes.matchedText ? text.replace(noteRes.matchedText, ' ') : text

  // 2) 收支类型
  const t = detectType(working)
  if (t.hit) hits.type = t.hit

  // 3) 金额
  const amt = extractAmount(working)
  const amount = amt ? round2(amt.value) : null
  if (amt) hits.amount = amt.raw

  // 4) 分类（限定在该类型下）
  const c = detectCategory(working, t.type, sets)
  if (c.category) hits.category = c.hit

  // 5) 日期
  const d = extractDate(working)
  if (d.hit) hits.date = d.hit

  // 6) 备注
  if (noteRes.note) hits.note = noteRes.note

  const missing: ParsedFlow['missing'] = []
  if (!amount || amount <= 0) missing.push('amount')
  if (!c.category) missing.push('category')

  return {
    type: t.type,
    amount: amount && amount > 0 ? amount : null,
    category: c.category || '其他',
    note: noteRes.note,
    trans_date: d.date,
    hits,
    missing
  }
}
