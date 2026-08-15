# 实物资产管理模块 — 交付说明

新增独立一级模块「资产」（`/assets`），与「记账」里的金融资产（现金/黄金/股票）彻底分离。沿用既有双模式数据层（`createRepo` + `useCollection`），**本地模式立即可用，配置 Supabase 后自动云端多端实时同步**。

## 五大子模块
1. **资产分类管理** — 预置 5 大基础类目（器材/家电/电子设备/食材/服饰），支持自定义一级+二级分类、类型（保修/时效/长效）、图标；预置类目可改名不可删。
2. **现有资产登记台账** — 通用基础字段（名称/分类/购买日期/单价·总价·数量·总价值/渠道/状态/备注/图片）+ 按分类类型**差异化时效字段**（保修类：起止+时长+剩余天数；时效类：生产+有效期+剩余天数；长效类：预期年限）。支持新增/编辑/删除/归档、CSV 批量导入(中文表头)/导出、JSON 全量导入导出。
3. **资产时效提醒** — 自动聚合「已过期/即将过期/已过保/闲置」，列表标红；首页(概览)+导航红点聚合；保修提前量、闲置月数阈值可配置。浏览器推送按你的选择**未启用**（如需可后续加）。
4. **待买清单规划** — 物品名/分类/预估单价·总价·数量/需求场景/预期采购时间/参考链接/备注/优先级/状态；顶部统计待采购预算、高优先级、待采购数量。
5. **数据统计与检索** — 关键词搜索 + 多条件筛选（分类/状态/过期·过保·闲置）；资产总数/总价值/本年度·月度购入支出/各类别占比/过期·过保·闲置汇总/待采购预算。

## 同步与部署
- 前端已集成，本地模式直接可用。
- 云端同步需执行 `supabase/schema.sql`（已追加 `asset_categories` / `asset_items` / `asset_wishlist` 三表 + `asset-images` 存储桶 + RLS 策略），在 Supabase SQL Editor 粘贴运行即可。

## 文件清单
- `src/views/AssetsView.vue`（主视图，五大子模块 Tab）
- `src/components/asset/AssetCategoryModal.vue`、`AssetItemModal.vue`、`AssetWishModal.vue`
- `src/lib/assetHelpers.ts`（类型/预置/时效计算/提醒聚合/统计/CSV 解析）
- `src/lib/assetImages.ts`（云端 Storage + 本地 Base64 压缩）
- `supabase/schema.sql`（新增表与桶）、`src/lib/dataIO.ts`（TABLES 已含三表）
- `src/router/index.ts`、`src/layouts/AppShell.vue`、`src/views/Overview.vue`（入口/红点/概览卡片）

## 验证
- `npm run build` 通过；dev server `http://localhost:5173/` 已就绪，新模块 HTTP 200。

## 备注
- 图片：云端上传到 Supabase 桶返回 URL；本地压缩为 Base64 内嵌（限制 5MB/张、最长边 1024px、最多 9 张），该方案对手机/电脑本地均可用。
- 统计沿用记账模块的「分整数累加」方案，规避小数精度导致分类占比之和≠总额的问题。
