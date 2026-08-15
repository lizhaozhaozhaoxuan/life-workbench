# 个人全维度工作台 — 交付概览

一个跨端（手机/桌面浏览器）的个人全维度工作台 PWA，聚合**工作 / 生活 / 运动 / 学习 / 财务**五大维度，支持云端实时同步、离线合并与浏览器提醒。

## 已交付内容

| 模块 | 能力 |
| --- | --- |
| **概览仪表盘** | 今日统计（待办高/中/低、运动打卡+部位、学习评分、收支结余、纪念日提醒）+ 每周趋势图（运动/学习评分/收支分类饼图/工作完成率）+ 环比提示，卡片点击跳转 |
| **工作** | 轻量待办：优先级、截止/提醒时间、逾期提醒、看板/列表双视图、完成撤销 |
| **生活** | 易忘清单（一次性/周期提醒）+ 纪念日（公历/农历倒计时、提前提醒） |
| **运动** | 视频跟练打卡、部位分类、连续天数、本周/本月统计 |
| **学习** | 英语/粤语跟练 + 评分（手动星级 / 语音评测 API 预留）、练习日历与趋势、计算机路线打卡、自定义学习站点 |
| **记账** | 收支记录 + 资产管理（银行卡/微信/支付宝/现金/黄金/股票）+ 股票行情 + 资产趋势快照 |

## 技术与工程

- **前端**：Vue 3 (Composition API) · Vite · TypeScript · Tailwind · Pinia · Vue Router · Chart.js
- **后端/同步**：Supabase（Postgres + RLS + Realtime + Auth）
- **离线**：PWA Service Worker + localStorage 写队列，联网自动合并
- **提醒**：浏览器 Notification（待办到期 / 纪念日提前 / 易忘事项）

## 运行方式

```bash
npm install
cp .env.example .env          # 可选：填入 Supabase 配置
npm run dev                   # http://localhost:5173
```

> **零配置演示模式**：不填 Supabase 配置即自动进入本地存储模式（无需登录），可完整体验界面与交互；填好 Supabase 配置即切换为云端实时同步。

## 上线到云端（已内置配置）

1. 在 Supabase 执行 `supabase/schema.sql`（建表 + RLS）。
2. 把 `Project URL` / `anon key` 填入 `.env`。
3. 静态托管：已备 `vercel.json` / `netlify.toml`，构建命令 `npm run build`，产物 `dist/`。

## 验证状态

- `npm install` ✅ · `vite build` ✅（26 资源预缓存，gzip 主包 ~107KB） · dev server `http://localhost:5173` 返回 200 ✅
- 类型检查：`npm run typecheck`（vue-tsc，独立，不影响 build）

## 已知边界 / 后续

- **语音评测**：需配置 `VITE_SPEECH_API_URL/KEY`，集成点在 `src/views/StudyView.vue` 的 `speechScore()`（接 MediaRecorder 录音 → 评测服务 → 解析分数）；未配置时退回手动星级评分。
- **股票行情**：浏览器直连第三方接口受 CORS 限制，失败时回退手动填价；生产建议用 Supabase Edge Function 代理。
- **App 推送**：当前用浏览器通知满足 PWA 提醒，跨端 App 推送需接入 Web Push（VAPID + 服务端）。
