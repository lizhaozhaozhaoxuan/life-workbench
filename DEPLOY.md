# 部署指南（公网访问 + 手机/电脑多端同步）

目标：把工作台部署到公网 HTTPS，任何网络下手机/电脑都能访问；PWA 可"添加到主屏幕"像原生 App。
数据层已接 Supabase 云端，无需再建表。

## 已为你准备好的部分（无需再改）
- `netlify.toml`：构建命令、`dist/` 发布目录、SPA 回退（`/*`→`/index.html`），以及构建期环境变量
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`（Netlify 服务器端构建时内联，避免线上变本地模式）。
- 已 `git init` 并提交全部源码（`.env`、`node_modules`、`dist` 已被 `.gitignore` 排除）。

## 你只需执行 3 步

### 1) GitHub 新建仓库（网页，约 1 分钟）
- 打开 https://github.com/new
- Repository name 填 `life-workbench`（或任意）
- **不要**勾选 "Add a README file" / "Add .gitignore" / "Add license"（仓库里已有）
- 点 Create repository

### 2) 关联并首次推送（在你本机终端跑）
```bash
cd /Users/lizhaoxuan/WorkBuddy/2026-07-26-09-39-00
git remote add origin https://github.com/<你的用户名>/life-workbench.git
git branch -M main
git push -u origin main
```
> 首次 push 会要求 GitHub 登录（浏览器或 Personal Access Token）。

### 3) Netlify 关联 GitHub 部署（网页，约 1 分钟）
- 打开 https://app.netlify.com/ 并登录（可用 GitHub 账号直接登录）
- 点 "Add new site" → "Import an existing project" → 选 GitHub
- 授权后选择 `life-workbench` 仓库
- Build command / Publish directory 会自动读取 `netlify.toml`（无需手填）
- 点 Deploy site
- 部署完成后会得到一个 `xxx.netlify.app` 域名，可改成自定义子域名（Site settings → Domain management）

## 验证
- 用手机（切到流量/非家庭 WiFi）打开 `https://<你的站点>.netlify.app`
- 登录账号 → 在「资产」新增一条待买项，电脑端刷新应实时出现（Supabase Realtime 多端同步）
- 浏览器里对站点选"安装/添加到主屏幕"，即变 PWA

## 以后更新代码
直接 `git push`，Netlify 会自动重新构建并上线，无需再手动操作。

## 可选：自定义域名
Netlify Domain management 里添加你自己的域名并按提示改 DNS（CNAME 到 `xxx.netlify.app`）。
免费 TLS 证书自动签发。

## 回退 / 本地调试
本地仍有 `npm run dev`（局域网 `192.168.31.96:5173`）可直接开发；`.env` 仅本地使用，
线上构建走 `netlify.toml` 里的变量，二者独立、互不干扰。
