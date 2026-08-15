# 个人全维度工作台 (Life Workbench)

一个手机 / 电脑均可访问的**模块化仪表盘**式个人工作台，聚合工作、生活、运动、学习、财务五大维度，配实时同步与浏览器提醒。基于 **Vue 3 + Vite + TypeScript + PWA**，后端使用 **Supabase（Postgres + Realtime + Auth）**。

## ✨ 功能模块

| 模块 | 能力 |
| --- | --- |
| 概览 | 今日统计（待办/运动/学习/收支/纪念日）+ 每周趋势图（运动、学习评分、收支分类饼图、工作完成率）+ 环比提示，卡片点击跳转 |
| 工作 | 轻量待办：优先级、截止/提醒时间、逾期提醒、看板/列表双视图、完成撤销 |
| 生活 | 易忘清单（周期提醒）+ 纪念日（公历/农历倒计时、提前提醒） |
| 运动 | 视频跟练打卡、部位分类、连续天数、本周/本月统计 |
| 学习 | 英语/粤语跟练 + 评分（手动星级 / 语音评测 API）、练习日历、路线打卡、自定义站点 |
| 记账 | 收支记录 + 资产管理（银行卡/微信/支付宝/现金/黄金/股票）+ 股票行情 + 资产趋势快照 |

## 🧱 技术栈

- **前端**：Vue 3 (Composition API) · Vite · TypeScript · Tailwind CSS · Pinia · Vue Router · Chart.js
- **后端/同步**：Supabase（PostgreSQL + Row Level Security + Realtime + Auth + Storage）
- **离线**：Service Worker (PWA) + localStorage 写队列自动合并
- **提醒**：浏览器 Notification API（待办到期 / 纪念日提前 / 易忘事项）

## 🚀 本地运行

```bash
npm install
cp .env.example .env      # 填入 Supabase 配置（见下）
npm run dev               # http://localhost:5173
```

> **零配置演示模式**：若不填 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`，应用会自动降级为**本地存储模式**（无需登录），所有数据存于浏览器 localStorage，可完整体验 UI 与交互。填好 Supabase 配置后即切换为云端实时同步。

## ☁️ Supabase 配置

1. 在 [supabase.com](https://supabase.com) 新建项目。
2. 打开 **SQL Editor**，粘贴运行 `supabase/schema.sql`（建表 + RLS 策略）。
3. 项目 **Settings → API** 复制 `Project URL` 与 `anon public key`，填入 `.env`。
4. 在 Authentication → Providers 确认 Email 登录开启。

> RLS 策略保证每个用户只能访问自己的数据（`auth.uid() = user_id`）。

## 🔔 实时同步 & 离线合并

- 在线：所有写操作即时落库，并通过 Supabase Realtime 订阅，多端相互即时可见。
- 离线：写操作进入 localStorage 队列并乐观更新本地缓存；恢复网络后自动重放合并（最后写入胜出）。
- 本地模式：单机持久化，无云端。

## 🔔 提醒通知

应用启动会请求浏览器通知权限。后台每分钟扫描：
- 待办 `remind_at` 到点
- 易忘清单提醒时间
- 纪念日距离 `advance_days` 内

> 跨端推送（App 推送）需接入 Web Push（VAPID + 服务端），当前用浏览器通知满足桌面/移动端 PWA 提醒；进阶可接 OneSignal 或 Supabase Edge Function 触发。

## 📊 高级功能

- **语音评测（英语/粤语自动打分）**：配置 `VITE_SPEECH_API_URL` 与 `VITE_SPEECH_API_KEY` 后启用。集成点位于 `src/views/StudyView.vue` 的 `speechScore()`（接入 MediaRecorder 录音 → 上传评测服务 → 解析分数）。未配置时使用手动 1–5 星评分。
- **股票实时行情**：学习/记账模块「更新行情」调用腾讯公开接口 best-effort；浏览器跨域受限时回退手动填价。生产建议用 Supabase Edge Function 代理（见 `src/lib/stock.ts`）。
- **资产趋势自动快照**：记账页「记录今日快照」写入 `asset_snapshots`，绘制总资产折线。

## 📦 部署（静态托管）

已内置 `vercel.json` 与 `netlify.toml`（SPA rewrite）。构建：

```bash
npm run build        # 输出 dist/
```

- **Vercel**：导入仓库，Framework 选 Vite，构建命令 `npm run build`，输出 `dist`。
- **Netlify**：构建命令 `npm run build`，发布目录 `dist`。
- 配置环境变量（Supabase URL/Key）于托管平台的环境变量设置中。

## 📁 目录结构

```
supabase/schema.sql      # 数据库表 + RLS
src/
  lib/        # supabase 客户端、数据层(db)、lunar、stock、chart
  composables/# useCollection / useTheme / useReminders
  stores/     # auth (Pinia)
  layouts/    # AppShell 布局壳
  components/ # Modal 等
  views/      # Overview / Work / Life / Finance / Workout / Study
  router/     # 路由 + 登录守卫
```

## ✅ 可扩展性

标签、训练部位、收支分类、学习分类均为自由文本或 `user_prefs` 自定义，便于随时增删。
