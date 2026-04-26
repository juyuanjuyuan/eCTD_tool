# Mac 版本调试 / 回归 Checklist

> 创建日期：2026-04-26
> 背景：mac:arm64 dmg 已经走完 H1-H7 七轮 hotfix，安装、登录、激活、创建序列(下拉 9 项)全部跑通。但真机最新一轮冒烟又冒出 **新 bug：创建序列后点击进入"填入文件"页（路由 `/sequences/:seqId`，即 EditorPage）显示纯白屏**。
> 这份 checklist 跟 `windows_version_checklist.md` **定位不同**：windows 是"出包前自检"，**mac 是"已经在真机上跑、出新 bug 时给 Mac 构建机上 agent 当排查手册 + 长期回归 checklist"**。每发现一个新 bug 就在 §2/§7 里加一条。

---

## 0. 心法（必读，每次让 agent 接手前先粘给它）

1. **白屏 ≠ 后端崩**。Electron 主窗口白屏时，后端进程通常还活着、HTTP API 还能 curl。先抓 **前端 Console + Network**，再考虑后端。直接去翻后端 log 找原因 90% 是浪费时间。
2. **沙箱跑通 ≠ 真机跑通**。H1-H7 全部走过这条弯路。任何"白屏修了"必须真机装新 dmg + 走完业务主链路 + 看 log 才算修。
3. **DevTools 是命门**。生产 dmg 里没开 DevTools 就基本没法调白屏 bug。**第一步永远是想办法在生产包里打开 DevTools**——见 §1.1。
4. **不要边猜边改**。Mac 阶段曾经 H1→H2→H3→H4 一路连环踩，根因是每次没等 root cause 就发新版本。今后白屏类必须先复现 + 抓 console error + 定位到具体文件/行/调用栈，**才允许改代码**。
5. **`npm run dev` 是 ground truth**。如果 dev 模式下点同一条路径不白屏、生产 dmg 白屏，**100% 是打包问题**（资源路径、SPA 兜底、lazy chunk、CSP、protocol 之类）。先做这个对照实验，决定下一步往哪个方向查。
6. **所有日志都在 userData**。Mac 上 electron-log 默认写 `~/Library/Logs/eCTDTool/main.log`；winston 后端 log 写 `~/Library/Application Support/eCTDTool/logs/`（看 backend `main.ts` 实际拼的 DATA_DIR）。开 `tail -F` 比追问"刚才报啥错"快十倍。

---

## 1. 调试基础设施（先把这套铺好，再开始改代码）

### 1.1 在生产 dmg 里强制打开 DevTools
当前 `desktop/main/window.ts` 是 `if (isDev) openDevTools()`，生产包不会自动开。三个方案任选其一：

**方案 A（推荐，零改代码）**：键盘呼出
- 启动 dmg → 主窗口聚焦 → **Cmd + Option + I** → DevTools 应弹出（detach 模式）
- 失败原因之一：Electron 31 默认禁用了快捷键；要在 `BrowserWindow` 的 `webPreferences.devTools: true`（默认 true，确认未被改成 false）

**方案 B（最稳）**：临时改代码强制开
```ts
// desktop/main/window.ts，在 win.loadURL(loadUrl) 之后加：
win.webContents.openDevTools({ mode: 'detach' });
```
- 重出包：`bash scripts/build-electron.sh mac:arm64`
- **这是临时调试包**，bug 修完后回滚

**方案 C（最优雅，长期）**：菜单项
- `desktop/main/menu.ts` 添加"View → Toggle DevTools"，accel = `CmdOrCtrl+Alt+I`，调 `win.webContents.toggleDevTools()`
- 永久保留，不需要重出调试包

### 1.2 看主进程日志（Electron main + backend stdout 合并）
- 路径优先级：
  1. `~/Library/Logs/eCTDTool/main.log` — electron-log 默认（`desktop/main/logger.ts` 实际配置）
  2. `~/Library/Application\ Support/eCTDTool/logs/` — winston 后端 log（`backend/src/main.ts` `DATA_DIR/logs/`）
- 命令：
  ```bash
  tail -F ~/Library/Logs/eCTDTool/main.log
  # 或 ls -la 一下确认实际路径
  ls -la ~/Library/Logs/ | grep -i ectd
  ls -la ~/Library/Application\ Support/ | grep -i ectd
  ```
- 启动 dmg 前先把 tail 跑起来，再点应用图标，所有日志都跑到屏幕上

### 1.3 backend 子进程独立调试
Electron main 里 fork 出 backend node 子进程；如果想绕过 Electron 直接 spawn backend 看裸日志：
```bash
# 找出装好的 backend bundle
APP="/Applications/eCTDTool.app"
RES="$APP/Contents/Resources"
ls "$RES/backend/"
# 直接跑（注意环境变量）
cd "$RES/backend"
DATA_DIR=$HOME/Library/Application\ Support/eCTDTool \
REFERENCE_DIR="$RES/reference/eCTD技术规范V1.1附件包" \
__PUBLIC_DIR__="$RES/frontend/dist" \
node main.js
```
- 看裸 stdout 比走 Electron IPC 中转更直接
- backend 起来后 curl 自己：`curl http://127.0.0.1:<port>/api/v1/health`

### 1.4 浏览器 + curl 隔离测试
即使在 dmg 里 EditorPage 白屏，也可以用普通浏览器对着同一个 backend 端口测：
```bash
# 找 backend 监听端口（log 里会打印）
grep -i "backend listening\|port" ~/Library/Logs/eCTDTool/main.log | tail -5
# 例如端口 41123
open "http://127.0.0.1:41123/sequences/<seqId>"
```
- 如果 Safari/Chrome 能正常打开同一路径，**问题就在 Electron-specific 行为**（CSP、protocol、preload、context isolation）
- 如果 Safari/Chrome 也白屏，**问题在前端代码本身或后端 API**，跟 Electron 无关

### 1.5 macOS 系统级调试工具
| 工具 | 看什么 | 命令 |
|---|---|---|
| Console.app | crash report、系统日志 | 应用程序 → 实用工具 → Console |
| Activity Monitor | backend node 子进程是否常驻、内存、CPU | 应用程序 → 实用工具 → Activity Monitor，搜 "node" |
| `lsof -i -P` | backend 监听端口 | `lsof -i -P \| grep -i listen \| grep -E "node\|electron"` |
| `sw_vers` | macOS 版本 | `sw_vers` |
| `arch` / `file` | 是 arm64 还是 x86_64 跑 | `file /Applications/eCTDTool.app/Contents/MacOS/eCTDTool` |
| `codesign -dv` | 签名状态 | `codesign -dv --verbose=4 /Applications/eCTDTool.app` |
| `spctl --assess` | Gatekeeper 评估 | `spctl --assess --verbose /Applications/eCTDTool.app` |

---

## 2. 当前 bug：创建序列后进入填入文件页白屏

### 2.1 复现步骤
1. 打开 dmg → 登录 admin → 激活
2. 创建项目 → 创建申请 → 创建序列（注册行为类型选其中一项）
3. 序列列表里点新建的那条 → URL 跳到 `/sequences/<seqId>` → **白屏**

期望：进入 `EditorPage`（`frontend/src/pages/editor/EditorPage.tsx`），左侧 CTDTree、中间编辑器、右侧 PropertiesPanel 三栏布局。

### 2.2 路径关键事实（让 agent 一看就知道在哪查）
- 路由配置：`frontend/src/App.tsx` line 58-66（`<Route path="/sequences/:seqId" element={<EditorPage/>}>`），用 `BrowserRouter`，**不是** HashRouter
- EditorPage 是 **lazy 懒加载**：`frontend/src/App.tsx:27` `const EditorPage = lazy(() => import('./pages/editor/EditorPage'))` — 这是白屏的头号嫌疑（chunk 加载失败）
- 主进程 loadURL 用 **`http://127.0.0.1:<port>/`**（H6 修后），不是 `file://`，所以 `BrowserRouter` 能用
- 后端 SPA 兜底：`backend/src/spa/spa.controller.ts:22` `@Get('*')` → 不是 API 路径就 sendFile(index.html)；静态资源走 `useStaticAssets(publicDir, { index: false })`（`backend/src/main.ts:183`）
- vite base 路径：默认 `/`（`frontend/vite.config.ts` 没设 `base`），bundle 出来的 index.html 引 `/assets/*.js`、`/assets/*.css`

### 2.3 嫌疑清单（按概率从高到低排，逐条排查）

#### 嫌疑 A — Lazy chunk JS 404（**最可能**）
**症状**：DevTools Console 出现红字 `Failed to fetch dynamically imported module: http://127.0.0.1:xxx/assets/EditorPage-xxxx.js`，Network 里那条 JS 是 404。

**根因可能性**：
- `frontend/dist/assets/` 没拷进 `Resources/frontend/dist/assets/`（rsync 漏了）
- `__PUBLIC_DIR__` env 指向不对，`useStaticAssets` 没找到 assets 目录
- `useStaticAssets(publicDir, { index: false })` 不递归 → 嵌套 assets 路径不被服务（**注意**：`{ index: false }` 只关 index 自动响应，并不影响子目录文件，所以这条概率低，但可以验证）

**排查命令**（在 Mac 终端跑）：
```bash
APP="/Applications/eCTDTool.app"
ls "$APP/Contents/Resources/frontend/dist/" 2>&1
ls "$APP/Contents/Resources/frontend/dist/assets/" 2>&1 | head -20
# 启动 app，然后 curl 后端拉 assets
curl -sI "http://127.0.0.1:<port>/assets/$(ls $APP/Contents/Resources/frontend/dist/assets/ | grep EditorPage | head -1)"
# 期望 200；404 就是这条
```

**修法**：
- 拷贝问题 → 检查 `scripts/build-electron.sh [4/6] desktop: stage resources` 是否拷了 frontend/dist；检查 `desktop/electron-builder.yml` 的 `extraResources` / `files` 段
- env 问题 → backend `main.ts` 看 `__PUBLIC_DIR__` 是怎么算的，确认在生产模式下指向 `Resources/frontend/dist/`
- 必要时让 `SpaController` 在 `__PUBLIC_DIR__` 缺失时直接 503，方便定位

#### 嫌疑 B — EditorPage 内部抛异常但没 ErrorBoundary
**症状**：Console 里有 `Uncaught Error: ...`、`TypeError: Cannot read property 'xxx' of undefined`，但页面停在白屏（Suspense fallback 永久 Spin 或直接空白）。

**根因可能性**：
- `useEditorStore` 初始 state 在 EditorPage 假设了某字段非空，序列刚创建数据为空时 crash
- `sequenceApi.getById(seqId)` 返回 404 / 500，前端没 catch（`backend/src/sequence/...` 是否对刚创建的空序列友好）
- `ctdApi.listNodes(seqId)` 当序列没初始化节点树时返回 `null`，前端 `.map(...)` 直接炸（**`needsInit` state 应该兜底**，但可能没起作用）
- 第一次进入触发的某个 useEffect 写 `setNodes(undefined as any)` 这类隐藏问题

**排查方式**：
1. DevTools Console 抓完整 stack
2. Network 看 `/api/v1/sequences/<seqId>`、`/api/v1/ctd-templates/...`、`/api/v1/sequences/<seqId>/nodes` 各是什么状态码
3. 在 EditorPage 顶层加 ErrorBoundary 让错误显式 → 至少能看到错误页而不是白屏

**修法**：
- 加 ErrorBoundary 在 `frontend/src/App.tsx` 最外层包一个 `<ErrorBoundary>`
- 修 EditorPage 内 null safety：`nodes?.map(...)` 而不是 `nodes.map(...)`

#### 嫌疑 C — 后端某个 API 返回非预期结构导致渲染失败
**症状**：Network 里相关 API 200 OK，但 response body 不对。

**根因可能性**：
- desktop 模式（SQLite）和 web 模式（PostgreSQL）的某个 API 输出 schema 有差异 — JSON 字段在 Prisma SQLite 下可能要走 `parseJsonField` 反序列化，某些 API 漏了
- 序列首创时 backend 应该自动初始化 CTD 节点树（参考 `sequence.service.ts` 的 `initializeNodes` 之类），但在 desktop 模式因为某种原因没触发

**排查方式**：
- DevTools Network → 抓每个相关 API 的 response → 跟 web 端（如果 web 还能跑）对比 schema
- 或者直接对着 backend 子进程 curl：
  ```bash
  curl -s http://127.0.0.1:<port>/api/v1/sequences/<seqId> -H "Authorization: Bearer <token>" | jq
  curl -s http://127.0.0.1:<port>/api/v1/sequences/<seqId>/nodes -H "Authorization: Bearer <token>" | jq
  ```
- token 从 DevTools → Application → Local Storage 里复制

#### 嫌疑 D — `BrowserRouter` 在硬刷新场景下走 backend SPA 兜底，但兜底返回非预期
**症状**：URL 显示 `/sequences/<seqId>`，但页面源码是 `Cannot GET /...` JSON 或 503 文本。

**根因可能性**：
- H6 修过 SPA fallback，但 `SpaController.serveSpa` 里 `__PUBLIC_DIR__` 缺失时返回 503 文本——白屏可能就是这个
- 路径里有特殊字符（seqId 是 cuid 之类没问题，但要排查）

**排查方式**：
- DevTools Network → 看打开 `/sequences/<seqId>` 这条主文档请求的 response → 应该是 `index.html` 的 HTML 内容；如果是 JSON / `SPA not built` 文本，就是 §2.3-A 或 SpaController 自身的问题

#### 嫌疑 E — Electron 主进程 will-navigate 拦截了路由
**症状**：URL 没变化、点击无响应。

**当前代码**：`desktop/main/window.ts:44` `win.webContents.on('will-navigate', ...)`，看里面是不是 `event.preventDefault()` 了所有跳转。

**注意**：React Router 的 client-side navigation 不会触发 `will-navigate`（它只改 history.state，不跳整页）；只有用 `<a href>` 或 `window.location` 整页跳才会触发。所以理论上不影响 SPA 内导航——但要确认。

#### 嫌疑 F — preload / contextIsolation / nodeIntegration 配置问题
**症状**：Console 报 `__dirname is not defined`、`require is not a function`、`process is not defined` 之类 Electron-specific 错误。

**当前代码**：`desktop/main/window.ts` BrowserWindow 的 webPreferences 段 + `desktop/preload/` 目录。看这些 flag。

**优先级**：低。如果 dmg 能登录、能创建序列（前面的页面都没白屏），preload 配置应该是对的，只有 EditorPage 这个特定页才白屏 → 这条排除。

#### 嫌疑 G — Tiptap / 富文本编辑器在 Electron 下加载字体/图标失败
**症状**：Console 报 `Failed to load font`、`net::ERR_FILE_NOT_FOUND`，但白屏现象前端代码炸在 Tiptap 初始化处。

**当前代码**：EditorPage 里只 import 了 CTDTree、FilePanel 等，没看到 Tiptap 直接 import；Tiptap 实际在 FilePanel 或更深的子组件里。

**排查**：先确认 Console 有无 font 相关 error，没有就跳过。

### 2.4 给 agent 的"复现-定位-修复-回归"四步流程

**Step 1 — 复现 + 抓证据**
```
1. 跑起来当前 dmg
2. 在 Mac 终端 tail -F ~/Library/Logs/eCTDTool/main.log（开一个窗口）
3. 启动应用，登录到能创建序列的状态
4. Cmd+Option+I 打开 DevTools（如果打不开，先做 §1.1 方案 B）
5. DevTools Console 切到 "All levels"，Network 切到 "Preserve log"
6. 触发白屏（点序列）
7. 截图保存：DevTools Console、DevTools Network（按 status code 排序，红色优先）、main.log 同时段
```

**Step 2 — 走 §2.3 嫌疑链定位**
- 按 A → B → C → D → E/F/G 顺序对，**每一条都先抓证据再判断是否命中**，不命中就跳下一条
- 命中后写一行 root cause 总结（"chunk 404 因为 vite-plugin-react-swc 没把 EditorPage 切到独立 chunk" 之类）

**Step 3 — 改代码**
- 改完 **沙箱 + 真机双跑**：
  ```bash
  cd frontend && npm run build
  # 沙箱：把 dist/ 拷过去 backend 起来，浏览器访问
  bash scripts/build-electron.sh mac:arm64
  # 真机：装新 dmg → 复现路径不再白屏
  ```

**Step 4 — 写回归测试 + 更新本 checklist §7**
- 把这次 root cause 的具体文件/行/原理写到 §7 表里
- 给 `__PUBLIC_DIR__` / chunk 加载/SPA 兜底添测试或 postbuild-verify 断言

---

## 3. Mac 构建机端到端冒烟（每次出新 dmg 必跑）

### 3.1 干净构建
- [ ] `git status` 干净
- [ ] `rm -rf backend/dist-embed desktop/dist desktop/release`
- [ ] `cd backend && npm install && npm rebuild better-sqlite3 bcrypt`
- [ ] `cd desktop && npm install`
- [ ] `cd frontend && npm install`
- [ ] `bash scripts/build-electron.sh mac:arm64`

### 3.2 build-electron.sh 每步必看（同 windows §3.2，Mac 关注点）
- [ ] `[1/6]` 末尾 `[build-embed] done.` + sanity check 全过
- [ ] `[2/6]` 末尾 `cv=XXX (apt=4 prt=2 rat=9 sqt=4) cvDep=XX stfCat=XX stfTag=XX` —— 缺一个数字立即停包（H7）
- [ ] `[2.5/6]` `electron-rebuild` 跑通，better-sqlite3 + bcrypt 都重编译成 Electron 31 ABI 125（**不是 Node ABI 115/127**）
- [ ] `[3/6]` `frontend/dist/index.html` 存在 + `frontend/dist/assets/*.js` 至少一个
- [ ] `[4/6]` `[4/6] reference XMLs staged: 6 files OK`（H7 stage-time check）
- [ ] `[5/6]` `desktop/release/eCTDTool-*.dmg` 出来
- [ ] `[5.5/6]` postbuild verify 全过：6 个 reference XML 在 `Resources/reference/eCTD技术规范V1.1附件包/` 下都在；first-run.db 的 cv_rat=9 等断言通过
- [ ] `[6/6]` SHA256SUMS 写出

### 3.3 真机冒烟（必走完，不要中途停）
- [ ] 装 dmg（拖入 Applications）
- [ ] **首次启动**：双击图标，等 5-10s 主窗口出现
  - [ ] 不是 `Cannot GET /` JSON（H6 回归点）
  - [ ] 不是空白窗口长时间挂起
  - [ ] 不是闪一下闪退（H1-H4 类型，看 main.log）
  - [ ] 看 `~/Library/Logs/eCTDTool/main.log` 没有 MODULE_NOT_FOUND / ENOENT / NODE_MODULE_VERSION mismatch / 受控词汇缺失等历史 H1-H7 错误
- [ ] 登录 `admin@ectd.com / admin123` → 首页
- [ ] 激活（用真实激活码或测试码）→ 看到 banner
- [ ] 创建项目 → 创建申请 → 创建序列：
  - [ ] 申请类型下拉 4 项（cnapt1-4）
  - [ ] **注册行为类型下拉 9 项（cnrat1-9）—— H7 主验证点**
  - [ ] 序列类型下拉 4 项（cnsqt1-4）
- [ ] **进入填入文件页（路由 `/sequences/:seqId` = EditorPage）—— 当前白屏 bug 复现点**
  - [ ] 左侧 CTDTree 出现，5 模块结构齐
  - [ ] 中间编辑器出现（即使没选节点也是空状态 placeholder，不是白屏）
  - [ ] 右侧 PropertiesPanel 出现
  - [ ] DevTools Console 无红字
- [ ] 选某个叶节点 → 上传 PDF → 看上传进度
- [ ] 触发验证 → 验证报告里看到 196 条完整性规则结果
- [ ] 模块 4/5 STF 标签下拉非空（H7 stf 验证点）
- [ ] 导出 ZIP / Word / PDF 各试一次（PDF 第一次卡 chromium 下载是已知 P1）
- [ ] 关窗 → dock 图标点击重开 → 不崩溃（H5 回归点）
- [ ] 退应用 → Activity Monitor 看 backend node 进程被清理（无孤儿）
- [ ] 重开应用 → 数据保留（项目还在、激活状态还在）

### 3.4 macOS 多版本回归（条件允许）
- [ ] macOS 14 Sonoma + arm64
- [ ] macOS 15 Sequoia + arm64
- [ ] Intel Mac（`mac:x64` 包，如果交付）

---

## 4. Mac H1-H7 历史坑回归点（每次出新版必检）

| 坑 | 表现 | 回归方式 | 防御位置 |
|---|---|---|---|
| **H1 native 模块没复制** | `Cannot find module '@prisma/client'` 启动闪退 | tail main.log 看 MODULE_NOT_FOUND | `scripts/build-electron.sh [1/6]` + postbuild verify |
| **H2 白名单删 .mjs** | `runtime/library.js` 找不到 | 同上 | `build-embed.js` 用黑名单 prune |
| **H3 native ABI mismatch** | `NODE_MODULE_VERSION 127 vs 125` | tail main.log 找 `NODE_MODULE_VERSION` | `[2.5/6] electron-rebuild` |
| **H4 winston 用相对路径** | `ENOENT: mkdir 'logs'` | 看 backend log 里日志路径绝对 | `backend/main.ts` 用 `DATA_DIR/logs` |
| **H5 BrowserWindow 销毁后引用未清** | 关窗后点 dock 图标 `Object has been destroyed` | dock 图标点击 → 主窗口重开 | `desktop/main/index.ts attachWindowLifecycle` |
| **H6 backend 不服务静态文件** | 主窗口显示 `Cannot GET /` JSON | 启动后看主窗口内容是 SPA 不是 JSON | `SpaController` + `useStaticAssets` |
| **H7 受控词汇 silent skip** | 创建序列下拉为空 | 创建序列时 cnrat 9 项可见 | 三道防线全部 fail-fast |

> 如果 §3.3 真机冒烟里**任何一条**触发上面的症状，回滚到对应 H 编号的 commit 看是否被 revert，或者看是不是在新代码里又写出了同模式的 silent-skip / 白名单 / 相对路径。

---

## 5. 给 Mac 构建机 agent 的 prompt 模板

复制下面这段直接粘贴到 Mac 上的 Claude Code，替换 `<...>` 占位即可：

````markdown
你现在在 Mac arm64 构建机上，工作目录 `<repo path>`，已 git pull 到最新。

任务：修 "创建序列后进入填入文件页（路由 /sequences/:seqId, EditorPage）白屏" 这个 bug。

读这两份文档为完整上下文：
- `docs/plans/mac_version_checklist.md`（这份排查手册，§2 是当前 bug 的全部嫌疑链）
- `docs/plans/software_upgrade.md`（项目历史 H1-H7 改动）

执行流程严格按 `mac_version_checklist.md` §2.4：
1. 先按 §1.1 方案 B 强制开 DevTools，重出包，装到 /Applications，复现白屏
2. 抓 DevTools Console + Network + main.log 证据，**不抓全证据不准动手改代码**
3. 按 §2.3 A → B → C → D → E/F/G 嫌疑链对，每条都先看证据再判断
4. 找到 root cause 后再改代码；改完沙箱 + 真机双跑回归
5. 修完更新 `docs/update_log.md` + `docs/plans/mac_version_checklist.md` §7（追加新坑表格行）

约束：
- 不允许"先改改试试"。每改一行都要有具体证据指向这行
- 不允许 silent skip（warn + return）。所有失败路径必须 throw 或显式 ErrorBoundary，参考 H7 的修法
- 改完代码必须 `cd backend && npx tsc --noEmit` + `cd frontend && npm run build` + `cd desktop && npx tsc --noEmit` 三个 tsc 都过
- 真机回归必须走完 `mac_version_checklist.md` §3.3 所有勾选项

完成判定：
- 真机装新 dmg，进入 /sequences/:seqId 不白屏，CTDTree + 中间编辑器 + PropertiesPanel 三栏都出现
- DevTools Console 0 红字
- main.log 0 ERROR
- 任何一项不达标都不算修完
````

---

## 6. 流程级 Don't List

- ❌ **不要不抓证据就改代码**。当前白屏 bug 至少 7 条嫌疑，盲改命中率 1/7
- ❌ **不要复用旧 dmg "再装一次试试"**。任何代码改动后必须 `rm -rf desktop/release` + 完整重出包
- ❌ **不要省 DevTools**。生产 dmg 没法开 DevTools 的话，先把 §1.1 方案 B 做了再说，绕过这一步直接改后端 = 100% 浪费时间
- ❌ **不要让 ErrorBoundary 缺位**。即使这次 bug 不是 React 错误，也建议在 `App.tsx` 顶层加一个，下次白屏才有错误页可看
- ❌ **不要混用 dev 和 prod**。dev 跑 vite + nodemon、prod 跑 bundle，bug 表现可能完全不同；调 prod bug 必须用 prod dmg
- ❌ **不要跳过 sanity check**。每次出包看到 `cv=238 ... apt=4 prt=2 rat=9 sqt=4` 那一行才算 [2/6] 通过，看不见就停下排查
- ❌ **不要边修边发**。修完先在 Mac 自己装一遍，确认走完 §3.3 全部勾选项，再 push / 通知客户

---

## 7. Mac 阶段后续新坑登记表（每发现一个 bug 就追加一行）

| 编号 | 日期 | 现象 | Root cause | 修复 commit | 修法位置 | 防御措施 |
|---|---|---|---|---|---|---|
| H1 | 2026-04-25 | 启动闪退 `Cannot find module '@prisma/client'` | `dist-embed` 漏拷 native modules | `25cd69f0` | `scripts/build-embed.js` | postbuild verify @prisma/client |
| H2 | 2026-04-25 | `runtime/library.js` 找不到 | 白名单过滤删了 .mjs 文件 | （E9 阶段） | `scripts/build-embed.js` | 改黑名单 prune |
| H3 | 2026-04-25 | `NODE_MODULE_VERSION 127 vs 125` | better-sqlite3 ABI 跟 Electron 不匹配 | （E9 阶段） | `scripts/build-electron.sh [2.5/6]` | electron-rebuild |
| H4 | 2026-04-25 | `ENOENT: mkdir 'logs'` | winston 相对路径 | （E9 阶段） | `backend/src/main.ts` | DATA_DIR 绝对路径 |
| H5 | 2026-04-26 | `Object has been destroyed`（dock 重开） | BrowserWindow 引用未置空 | `a7ed1568` | `desktop/main/index.ts` | attachWindowLifecycle |
| H6 | 2026-04-26 | 主窗口显示 `Cannot GET /` JSON | backend 不服务 SPA 静态文件 | `93858ea6` | `backend/src/spa/spa.controller.ts` + `main.ts` `useStaticAssets` | SpaModule 最后导入 |
| H7 | 2026-04-26 | 创建序列时注册行为类型下拉为空 | 受控词汇 silent skip + STF 漏 seed | `75742943` | `controlled-vocabulary.service.ts` + `build-firstrun-db.js` + `build-electron.sh` + `postbuild-verify.sh` | 三道防线全 fail-fast |
| H9 | 2026-04-26 | (a) 右键多实例节点 (2.3.S/3.2.S/2.3.P/3.2.P/2.7.3) 弹"添加实例"对话框时报 `o.map is not a function`；(b) 上传文件后进度条闪一下消失、新文件不立即出现，需切到别的 section 再回来才能看到 | **Bug A** = SQLite 模式 JSON-as-string 序列化漏洞：`prisma/schema.sqlite.prisma` 把 PG 的 `Json?` 字段降级成 `String?`，但 `getSequenceNodeTree` 直返 raw Prisma 结果，`templateNode.instanceKeyFields` 是 `"[\"substance\",\"manufacturer\"]"` 字符串，AddInstanceModal `keys.map(...)` 在字符串上调 `.map` 直接抛。**Bug B** = 本地存储 (`STORAGE_PROVIDER=local`) `LocalStorage` 同步 fs.writeFileSync 落盘，axios localhost 上传几十毫秒完成，`setUploading(true)→(false)` 一帧批次内 flush，进度条没机会绘制；新文件出现依赖 `loadFiles()` 异步触发的 `setFiles(data)`，期间 Bug A 的 `o.map` 命中会让 ErrorBoundary 接管，看似"上传失败"，切节点重 mount 才正常 | （pending push） | (1) `backend/src/ctd-template/ctd-template.service.ts:380-395` `getSequenceNodeTree` 出口对每个 `templateNode.instanceKeyFields` 走 `parseJsonField<string[]>`；(2) `backend/src/file/file.service.ts:790` `serializeAttachment` 把 `pdfAnalysis.complianceDetails` parse 出来归一化 `{errors:[], warnings:[]}`；(3) `frontend/src/components/AddInstanceModal.tsx:36` 防御层 `Array.isArray ? : typeof===string ? JSON.parse : []`；(4) `frontend/src/components/FilePanel.tsx:111` handleUpload 用 `message.loading('正在上传...', 0)` 持续 toast + 至少 400ms 可见时长 + 上传成功后 `setFiles((prev) => [newFile, ...prev])` 乐观更新（不等 loadFiles），dedupe by id | (1) plan 后续 audit 全部 SQLite-as-string 字段（`mentions` / `defaultStfCategories` / `contentJson`）确认 frontend 调用链不会 `.map`；(2) 考虑在 `backend/src/common` 加 `dual-provider-serializer.ts` 统一处理所有出口的 JSON 字段；(3) Electron 模式下所有 list endpoints 加 e2e 测试，覆盖 SQLite + JSON 字段往返 |
| H8 | 2026-04-26 | 创建序列后进入 /sequences/:seqId 白屏 + 选叶节点二次白屏（潜伏） | **Rules of Hooks 双违反**：(A) `EditorPage.tsx:310` `collectLeafNodeIds` `useCallback` 在 `if (loading) return` (l.289) + `if (!sequence) return` (l.297) 之后 — loading=true→false 的两次 render 间 hook 计数 +1 → React unmount 整个组件树 → 白屏；(B) `RichEditor/index.tsx:104` `if (!editor) return null` 之后挂 8 个 hooks — `useEditor` 首次返回 null、第二次返回 instance 时 hook 数从 3 跳到 11 → 同样 crash（修完 A 后用户能进 EditorPage 但点节点又白） | `38cfd6e0` | EditorPage l.290（hooks 全部上移）、RichEditor l.106-188（8 个 hooks 全部上移）、ErrorBoundary l.1（新建）、App.tsx l.43（包 ErrorBoundary） | (1) `eslint react-hooks/rules-of-hooks` 进 CI（已经在 `eslint.config.js` 默认规则里，违反即 error）；(2) `App.tsx` 包 `<ErrorBoundary>`，下次 React 渲染错误显示错误页（含错误信息+stack+componentStack+复位按钮）而非白屏；(3) 嫌疑 A/D（chunk 404 / SPA fallback）已通过 5 个 curl 实测排除并记录在 update_log，下次 agent 不必重查 |
| H10 | 2026-04-26 | 上传文件后进度条到 100%、文件**短暂出现**在列表里，紧接着列表又被刷成空（"页面闪一下"），需切到别的 section 再回来才看得见——即 H9(b) 在 commit `38cfd6e0` (M1 H10) 的乐观插入修法之后**仍残留**的 part | M1 H10 commit 加了 `setFiles((prev) => [newFile, ...prev])` 乐观插入，**但同一个 try 块里 350ms 后又调了 `loadFiles()`，`setFiles(data)` REPLACE 了乐观状态**。如果那次 GET `/nodes/:id/files` 没返回新文件，乐观插入被覆盖。GET 返回不到新文件的最可能原因（按概率从高到低）：**(α)** `file.controller.ts` 的 GET endpoint 没设 `Cache-Control` header，Electron Chromium 启发式缓存了上次的 list 响应；**(β)** 后端 `uploadFile` 返回的 `pdfAnalysis` 是 RAW Prisma record（SQLite 下 `complianceDetails` 是 JSON 字符串），跟 listFiles 经过 `serializeAttachment` 解析后的形状不一致——虽然不是文件消失的直接原因，但会让合规弹窗少渲染 errors/warnings；**(γ)** SQLite 写后读隔离极小概率 | （pending push） | (1) `frontend/src/components/FilePanel.tsx` handleUpload 把 `loadFiles()` 换成 **merge-additive 刷新**：服务器返回的 list 为 canonical，但乐观插入但服务器还没返回的 ghost 文件保留 — 即使 GET 返回缓存空列表，乐观插入也不会被错误覆盖；(2) `backend/src/file/file.service.ts` `uploadFile` + `uploadFileFromDisk` 两处 return 改为 `serializeAttachment({...attachment, pdfAnalysis})`，让 upload 响应跟 list 响应**形状完全一致**；(3) `backend/src/file/file.controller.ts` `listFiles` / `getFile` / `listReferenceableFiles` 三个 GET 加 `@Header('Cache-Control', 'no-store')`，杜绝 Chromium 缓存可能性 | (1) merge-additive 模式适合任何"乐观插入 + 异步刷新"场景，可作为模板复用到 study/document 等其他列表；(2) `Cache-Control: no-store` 应作为所有动态 list endpoints 默认；(3) 后端任何 create/update 端点的返回值都应该 `serializeAttachment`/`serializeXxx` 经过同一序列化函数，不能 raw spread Prisma record |
| ... | | | | | | |

> 修完一个 bug 立即把对应行的 root cause / commit / 修法位置 / 防御措施 填上，留给下一个 agent 当历史教训。

---

## 8. 完成标准

只有以下全部满足才允许 Mac 版本对外发布：

- [ ] §3.3 真机冒烟全部勾选项过
- [ ] DevTools Console 0 红字
- [ ] `~/Library/Logs/eCTDTool/main.log` 启动到关闭全程 0 ERROR、0 MODULE_NOT_FOUND、0 ENOENT
- [ ] §4 H1-H7 全部回归点不复现
- [ ] §7 表里所有"待修"行清零
- [ ] 至少一台 Mac 真机跑过完整 eCTD 序列创建 → 上传 PDF → 验证 → 导出 ZIP → ZIP 用 ERIS 验通过

---

> 这份 checklist 是开放的，每次 Mac 阶段出新 bug 就在 §7 加一行、必要时在 §2 复制嫌疑链结构再写一段当前 bug 的排查指南。**永远不要让一个 bug 没有"复现-定位-修复-回归"四步证据就关掉**。
