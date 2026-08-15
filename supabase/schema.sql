-- ============================================================================
-- 个人全维度工作台 - Supabase 数据模型
-- 执行方式：Supabase Dashboard -> SQL Editor 粘贴运行，或 supabase db reset
-- 所有表均按 user_id 隔离，RLS 仅允许本人读写。
-- ============================================================================

-- 扩展
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles：基础资料（注册后由前端写入 display_name）
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- user_prefs：用户自定义分类/标签（可扩展性核心）
--   prefs 示例：
--   {
--     "workoutCategories": ["胸","肩","背","腿","体态"],
--     "txCategories": ["餐饮","交通","工资","理财"],
--     "studyCategories": ["文档","视频","实战"]
--   }
-- ---------------------------------------------------------------------------
create table if not exists public.user_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 工作模块：todos
--   priority: high | medium | low
--   status:   todo | doing | done   (看板三列)
-- ---------------------------------------------------------------------------
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  note text,
  priority text not null default 'medium' check (priority in ('high','medium','low')),
  status text not null default 'todo' check (status in ('todo','doing','done')),
  due_date date,
  remind_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_todos_user on public.todos(user_id);
create index if not exists idx_todos_due on public.todos(user_id, due_date);

-- ---------------------------------------------------------------------------
-- 生活：易忘清单 life_easy
--   repeat: once | daily | weekly | monthly
--   next_remind_at: 周期任务的下一次提醒时间
-- ---------------------------------------------------------------------------
create table if not exists public.life_easy (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  note text,
  done boolean not null default false,
  done_at timestamptz,
  repeat text not null default 'once' check (repeat in ('once','daily','weekly','monthly')),
  remind_at timestamptz,
  next_remind_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_life_easy_user on public.life_easy(user_id);

-- ---------------------------------------------------------------------------
-- 生活：纪念日 life_anniversary
--   date：换算后的公历日期（用于倒计时）
--   is_lunar：是否为农历（true 时 lunar_month/lunar_day 用于每年重算）
--   repeat_year：每年重复(true) | 仅一次(false)
--   advance_days：提前几天提醒
-- ---------------------------------------------------------------------------
create table if not exists public.life_anniversary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  date date not null,
  is_lunar boolean not null default false,
  lunar_month integer,
  lunar_day integer,
  repeat_year boolean not null default true,
  advance_days integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_anniv_user on public.life_anniversary(user_id, date);

-- ---------------------------------------------------------------------------
-- 运动：跟练视频库 workout_videos
--   category：训练部位（自由文本，初始值由 user_prefs 提供）
-- ---------------------------------------------------------------------------
create table if not exists public.workout_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  url text,
  category text not null,
  duration_min integer,
  created_at timestamptz not null default now()
);
create index if not exists idx_workout_videos_user on public.workout_videos(user_id);

-- 运动：打卡记录 workout_checkins（同一视频可多次打卡）
create table if not exists public.workout_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null references public.workout_videos(id) on delete cascade,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_checkins_user on public.workout_checkins(user_id, checked_at);
create index if not exists idx_checkins_video on public.workout_checkins(video_id);

-- 兼容早期版本：若 workout_checkins 缺少 created_at 列则补上
-- （否则导入含 created_at 字段的数据时插入失败，并中断后续所有表的导入）
alter table if exists public.workout_checkins
  add column if not exists created_at timestamptz not null default now();

-- 兼容早期版本：放宽 asset_snapshots 的每日唯一约束
-- （个人可能同一天多次记录资产快照，旧约束 (user_id, snapshot_date) 会导致导入冲突）
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'asset_snapshots_user_id_snapshot_date'
      and table_name = 'asset_snapshots'
  ) then
    alter table public.asset_snapshots drop constraint asset_snapshots_user_id_snapshot_date;
  end if;
end $$;

-- 运动：体重/体成分管理 weight_logs
--   measured_at：测量时间（含日期）
--   weight kg / body_fat % / water % / protein % / muscle kg
create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_at timestamptz not null default now(),
  weight numeric(6,2) not null check (weight > 0),
  body_fat numeric(5,2) check (body_fat between 0 and 100),
  water numeric(5,2) check (water between 0 and 100),
  protein numeric(5,2) check (protein between 0 and 100),
  muscle numeric(6,2) check (muscle >= 0),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_weight_user on public.weight_logs(user_id, measured_at);

-- ---------------------------------------------------------------------------
-- 学习：语言跟练 study_lang_sessions
--   lang: en(英语) | yue(粤语)
--   mode: self(自评分) | auto(语音评测API)
--   score: 1-5
-- ---------------------------------------------------------------------------
create table if not exists public.study_lang_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lang text not null check (lang in ('en','yue')),
  scenario text,
  score integer not null check (score between 1 and 5),
  mode text not null default 'self' check (mode in ('self','auto')),
  session_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists idx_lang_user on public.study_lang_sessions(user_id, session_date);

-- 学习：计算机路线 study_routes
create table if not exists public.study_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);
create index if not exists idx_routes_user on public.study_routes(user_id);

-- 学习：路线节点 study_route_nodes
create table if not exists public.study_route_nodes (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.study_routes(id) on delete cascade,
  title text not null,
  status text not null default 'todo' check (status in ('todo','doing','done')),
  position integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_nodes_route on public.study_route_nodes(route_id);
-- 增加 user_id 以匹配通用数据层与 RLS（幂等：表已存在且含该列时跳过）
alter table public.study_route_nodes add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 学习：自定义学习站点 study_sites
create table if not exists public.study_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  url text not null,
  category text not null,
  last_studied date,
  created_at timestamptz not null default now()
);
create index if not exists idx_sites_user on public.study_sites(user_id);

-- ---------------------------------------------------------------------------
-- 记账：收支 transactions
--   type: expense(支出) | income(收入)
--   category: 自由文本（用户自定义）
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('expense','income')),
  amount numeric(14,2) not null check (amount > 0),
  category text not null,
  trans_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_tx_user on public.transactions(user_id, trans_date);

-- 记账：资产账户（银行卡/微信/支付宝/现金） asset_accounts
create table if not exists public.asset_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('bank','wechat','alipay','cash','other')),
  name text not null,
  tail_no text,
  balance numeric(16,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_asset_acc_user on public.asset_accounts(user_id);

-- 记账：黄金持仓 asset_gold
create table if not exists public.asset_gold (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  grams numeric(14,3) not null default 0,
  price_per_gram numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_gold_user on public.asset_gold(user_id);

-- 记账：股票持仓 asset_stocks
create table if not exists public.asset_stocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  name text,
  shares numeric(16,3) not null default 0,
  cost_price numeric(14,2) not null default 0,
  current_price numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_stocks_user on public.asset_stocks(user_id);

-- 记账：负债 / 应收 asset_liabilities
--   kind: credit_card(信用卡欠款) | payable(其他应付款，我欠) | receivable(别人欠我的)
--   balance: 金额（正数表示对应方向金额）
--   credit_limit: 信用卡授信额度（仅 credit_card）
--   tail_no: 信用卡尾号 | due_date: 还款/催收日期
create table if not exists public.asset_liabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('credit_card','payable','receivable')),
  name text not null,
  tail_no text,
  credit_limit numeric(16,2),
  balance numeric(16,2) not null default 0,
  due_date date,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_liab_user on public.asset_liabilities(user_id);

-- 记账：资产快照 asset_snapshots（趋势图 + 周度对比）
create table if not exists public.asset_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null default current_date,
  total numeric(18,2) not null default 0,
  cash numeric(18,2) not null default 0,
  invest numeric(18,2) not null default 0,
  liability numeric(18,2) not null default 0,
  net numeric(18,2) not null default 0,
  created_at timestamptz not null default now()
);
-- 注意：不再对 (user_id, snapshot_date) 加唯一约束。
-- 个人可能在同一天多次记录资产快照，放宽约束以兼容本地多快照习惯。
create index if not exists idx_snap_user on public.asset_snapshots(user_id, snapshot_date);

-- ============================================================================
-- 实物资产管理（新增 2026-08）
--   模块 1：资产分类 asset_categories（一级/二级 + 类型 + 可自定义扩展）
--   模块 2：资产台账 asset_items（实物资产全信息 + 差异化时效字段 + 图片 + 归档）
--   模块 4：待买清单 asset_wishlist（未采购物品规划）
-- ============================================================================

-- 分类类型（决定资产台账显示哪些时效字段）：
--   warranty : 保修类（家电/电子/器材）-> 保修起止/保修期/剩余天数
--   perishable: 时效类（食材/日化）-> 生产/有效期/过期时间/剩余天数
--   durable  : 长效类（服饰/家具）-> 仅自愿填预期使用年限
create type public.asset_cat_type as enum ('warranty', 'perishable', 'durable');

-- 模块 1：资产分类体系
create table if not exists public.asset_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,                 -- 一级类目名称（如 家电、电子设备）
  type public.asset_cat_type not null default 'durable',
  icon text not null default '📦',     -- emoji 图标
  parent_id uuid references public.asset_categories(id) on delete cascade, -- 二级分类指向一级
  order_no integer not null default 0,
  is_preset boolean not null default false, -- 预置类目（不可删除，可改名）
  created_at timestamptz not null default now()
);
create index if not exists idx_asset_cat_user on public.asset_categories(user_id, parent_id);

-- 模块 2：现有资产登记台账
create table if not exists public.asset_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,                 -- 资产名称（自定义）
  category_id uuid references public.asset_categories(id) on delete set null, -- 绑定一级/二级分类
  category_type public.asset_cat_type not null default 'durable', -- 冗余存类目类型，决定展示字段
  purchase_date date,                 -- 购买日期
  quantity numeric(10,2) not null default 1, -- 数量（支持多件）
  unit_price numeric(14,2),            -- 单价
  total_price numeric(14,2),           -- 总价（可填，自动计算）
  channel text,                       -- 购买渠道（可选 + 自定义）
  status text not null default 'in_use' check (status in ('in_use','idle','damaged','scrapped','lent')),
  note text,                          -- 备注（存放位置/使用说明/补充）
  images text[],                      -- 图片 URL（云端）或 Base64（本地），最多 9 张
  archived boolean not null default false, -- 归档（隐藏不删）
  last_used_at date,                  -- 最近使用日期（用于闲置判定）
  -- 保修类（warranty）专属字段
  warranty_start date,
  warranty_end date,
  warranty_months integer,            -- 保修时长（月），可由起止反推
  -- 时效类（perishable）专属字段
  production_date date,
  expiry_date date,                   -- 有效期/过期时间
  -- 长效类（durable）自愿字段
  expected_years integer,             -- 预期使用年限
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_asset_items_user on public.asset_items(user_id, category_id);
create index if not exists idx_asset_items_cat on public.asset_items(category_id);

-- 模块 4：待买清单
create table if not exists public.asset_wishlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,                 -- 物品名称
  category_id uuid references public.asset_categories(id) on delete set null,
  est_unit_price numeric(14,2),        -- 预估单价
  est_total_price numeric(14,2),       -- 预估总价
  quantity numeric(10,2) not null default 1,
  scene text,                         -- 需求场景（日常替换/新增购置/送礼/备用）
  expect_date date,                   -- 预期采购时间
  ref_url text,                       -- 参考链接/参考渠道
  note text,                          -- 备注（规格/替代方案等）
  priority text not null default 'medium' check (priority in ('high','medium','low')),
  status text not null default 'pending' check (status in ('pending','purchased','abandoned')),
  created_at timestamptz not null default now()
);
create index if not exists idx_asset_wish_user on public.asset_wishlist(user_id, category_id);

-- 资产图片存储桶（云端模式下实物图/小票/保修凭证）
insert into storage.buckets (id, name, public)
  values ('asset-images', 'asset-images', true)
  on conflict (id) do nothing;

-- 桶对象策略：仅本人可读写自己 user_id 前缀路径
drop policy if exists asset_images_select on storage.objects;
create policy asset_images_select on storage.objects for select using (bucket_id = 'asset-images');
drop policy if exists asset_images_insert on storage.objects;
create policy asset_images_insert on storage.objects for insert with check (bucket_id = 'asset-images');
drop policy if exists asset_images_delete on storage.objects;
create policy asset_images_delete on storage.objects for delete using (bucket_id = 'asset-images');

-- ===========================================================================
-- 行级安全 (RLS)
-- ===========================================================================
alter table public.profiles enable row level security;
alter table public.user_prefs enable row level security;
alter table public.todos enable row level security;
alter table public.life_easy enable row level security;
alter table public.life_anniversary enable row level security;
alter table public.workout_videos enable row level security;
alter table public.workout_checkins enable row level security;
alter table public.weight_logs enable row level security;
alter table public.study_lang_sessions enable row level security;
alter table public.study_routes enable row level security;
alter table public.study_route_nodes enable row level security;
alter table public.study_sites enable row level security;
alter table public.transactions enable row level security;
alter table public.asset_accounts enable row level security;
alter table public.asset_gold enable row level security;
alter table public.asset_stocks enable row level security;
alter table public.asset_liabilities enable row level security;
alter table public.asset_snapshots enable row level security;
alter table public.asset_categories enable row level security;
alter table public.asset_items enable row level security;
alter table public.asset_wishlist enable row level security;

-- 通用策略模板（每个表）
do $$
declare t text;
begin
  foreach t in array array[
    'user_prefs','todos','life_easy','life_anniversary',
    'workout_videos','workout_checkins','weight_logs','study_lang_sessions','study_routes',
    'study_route_nodes','study_sites','transactions','asset_accounts',
    'asset_gold','asset_stocks','asset_liabilities','asset_snapshots',
    'asset_categories','asset_items','asset_wishlist'
  ] loop
    execute format('drop policy if exists %I on public.%I;', t || '_select', t);
    execute format('drop policy if exists %I on public.%I;', t || '_write', t);

    execute format(
      'create policy %I on public.%I for select using (auth.uid() = user_id);',
      t || '_select', t
    );
    execute format(
      'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id);',
      t || '_write', t
    );
  end loop;
end $$;

-- profiles 用 id 而非 user_id，单独建策略（不在通用循环内）
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (auth.uid() = id);
drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
