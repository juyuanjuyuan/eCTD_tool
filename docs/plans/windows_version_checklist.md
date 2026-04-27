# Windows 版本出包 Checklist

> 创建日期：2026-04-26
> 背景：mac:arm64 dmg 已经在 E9 阶段经过 H1-H7 七轮 hotfix 修通，跑过真机端到端冒烟。Windows nsis exe 是下一个交付目标。**绝对不要边出边改边踩同一个坑**——这份 checklist 是 Mac 阶段交学费交出来的，每一条都对应一个具体的失败案例。
> 使用方式：每出一版 Windows 安装包前，**逐条勾选**。出现疑问回到对应 Mac 案例查 root cause。

---

## 0. 心法（必读）

1. **沙箱跑通 ≠ 客户机跑通**。Mac 阶段 H1-H7 全部都是沙箱过、真机崩。任何带 native binding / 文件系统假设 / 进程模型 / 路径推断 / 受控词汇预填 的改动，**必须真机装 + 走完业务主链路 + 看 log**。
2. **Build 期红才是好红**。出包脚本任何一步缺文件、缺数据，**立刻 exit 1**，不要 warn + 继续。所有"warn 一句然后 return"都是 H7 类型隐患的种子。
3. **bundle 产物倾向"全拷 + 黑名单 prune"，不是白名单**。白名单总会漏 transitive、漏 exports map 默认变体（H1-H2 翻车两次）。
4. **路径推断在跨平台一定要 EMBEDDED env 显式分支**，不要赌 `__dirname` 或 `process.cwd()` 在 dev / bundled / Mac / Windows 下含义一致（H6 / H7 STF 路径都踩过）。
5. **Postbuild verify 是构建期的钢闸**，不是测试机的安慰。文件存在 + sqlite3 内容断言 + native 模块对应 ABI 三件套必须在出包脚本里跑。

---

## 1. 准备：Windows 构建机（一次性）

构建可以在 Mac 上交叉跑（electron-builder 支持），但**至少做一次原生 Windows 构建机出包验证**。Mac 交叉编译 + Windows 真机装通过的 dmg 仍可能在 Windows 上踩别的坑。

### 1.1 Windows 构建机硬件 / 软件准备
- [ ] Windows 10 21H2+ 或 Windows 11，x64
- [ ] 装 Visual Studio Build Tools（含 MSVC v143、Windows 10/11 SDK）—— better-sqlite3 / bcrypt 需 native 编译
- [ ] 装 Node.js 20.x（与 backend `package.json#engines` 对齐，与构建机 Mac 上一致）
- [ ] 装 Git for Windows（含 Git Bash）—— `scripts/build-electron.sh` 是 bash 脚本，原生 cmd/PowerShell 跑不了
- [ ] **或者** 装 WSL2 + Ubuntu，所有命令在 WSL 里跑（推荐：跟 CI 环境更接近）
- [ ] 装 sqlite3 CLI（`scripts/postbuild-verify.sh` 用它做内容断言；Windows 没自带）
  - choco install sqlite，或下 sqlite-tools 解压到 PATH
- [ ] Windows Defender 排除目录（加速构建）：
  - `<repo>/backend/node_modules`
  - `<repo>/backend/dist-embed`
  - `<repo>/desktop/node_modules`
  - `<repo>/desktop/release`
- [ ] 第三方杀软（360、腾讯管家等）**临时关闭实时防护**或加白名单。Mac 阶段没踩，Windows 阶段大概率踩

### 1.2 代码签名证书
- [ ] 申请 EV 代码签名证书（DigiCert / Sectigo / GlobalSign）—— OV 证书 SmartScreen 需积累信誉，EV 立即被信任
- [ ] PFX 文件 + 密码 备好，或 USB token（HSM）插上构建机
- [ ] 配置环境变量：
  - `WIN_CSC_LINK`：PFX 文件路径（绝对路径）或 base64 字符串
  - `WIN_CSC_KEY_PASSWORD`：PFX 密码
- [ ] 选择 timestamp server：`http://timestamp.digicert.com` 或 `http://timestamp.sectigo.com`
- [ ] 在 `desktop/electron-builder.yml` 的 `win` 段补 `signtoolOptions.signingHashAlgorithms: ['sha256']`、`signtoolOptions.timeStampServer: <url>`
- [ ] 测试：先签一个 hello world exe 跑通流程，再签真包

> **未签名 exe 的现实后果**：SmartScreen 阻止 + 杀软误报 + 用户失去信任。客户拿到时基本"装不上"。EV 证书是必经投资，绕不过。

### 1.3 测试机准备（≥3 台）
- [ ] **干净 Win11 24H2** 一台（默认 Defender 启用、UAC 默认级别、英文用户名）
- [ ] **干净 Win10 22H2** 一台（更老的环境，覆盖大多数客户）
- [ ] **中文用户名 Windows** 一台（用户名含汉字如"李四"，覆盖 `C:\Users\李四\AppData\Local\` 路径中文场景）—— `app.getPath('userData')` 返回值带中文，`better-sqlite3` open db、Prisma URL 生成都会被这个考验
- [ ] 可选：装 360 / 腾讯管家的一台（中国客户主流杀软真机验证）

---

## 2. 出包前源码自检（A 段，源码侧）

### 2.1 跨平台 native 模块 ABI
- [ ] **schema.prisma + schema.sqlite.prisma** 的 `binaryTargets` 含 `windows`（Mac 阶段已加，确认未被 revert）
- [ ] `npx prisma generate`（postgres schema）+ `npm run prisma:sqlite:generate` 跑完后，`backend/node_modules/.prisma/client/` 下应有：
  - [ ] `query_engine-windows.dll.node`（Prisma postgres 引擎，Windows x64）
  - [ ] `libquery_engine-darwin*.dylib.node`（Mac，跨平台留着也不冲突）
  - [ ] `libquery_engine-debian-openssl-3.0.x.so.node`（Linux，CI/dev 用）
  - 如果缺 windows 引擎 → 重跑 generate；还缺则在 schema 里逐个加 `binaryTargets`
- [ ] `backend/src/generated/prisma-sqlite/` 同上结构
- [ ] **better-sqlite3**：Windows 上 ABI 只能在 Windows 上 build。如果 Mac 上交叉打 win 包，必须靠 `@electron/rebuild --arch=x64 --platform=win32`，会去下 prebuild 而非本机编译；prebuild-install 在 Mac 上能下 windows-x64 prebuild，但**前提是 better-sqlite3 当前版本对应 prebuild 存在**（去 GitHub release 验证）
- [ ] **bcrypt**：同上。bcrypt 的 windows prebuild 经常缺，备选方案是改用 `bcryptjs`（纯 JS，跨平台）；或 Windows 构建机上做原生编译

### 2.2 路径与 URL 编码
- [x] **DATABASE_URL 格式**：`backend/src/main.ts` 和 `desktop/main/backend-process.ts` 在 Windows 上拼 `file:C:/Users/.../data.db`（正斜杠、无三斜杠）。**W1-H2 真机安装首启补坑**：`file:///C:/...` 虽是标准 file URL，但 Prisma SQLite 6.x 在 Windows 上会报 SQLite `Error code 14: Unable to open the database file`；而此前 `resolveDatabaseFile()` 又会把 `file:///C:/...` 误解析成 `///C:/...` 并造成 `C:\C:\Users\...`。现状：运行时生成 Prisma 可打开的 `file:C:/...`；解析端用 `fileURLToPath()` 兼容 `file:///C:/...` 和 `file:C:/...`；`embedded-paths.spec.ts` 覆盖两种 Windows URL 与相对 dev DB。
- [ ] **path 拼接全部走 `path.join`**，不允许字符串字面量 `'/'` 拼接路径（grep 全仓 `+ '/'`、`+ '\\\\'`、`'/' +` 找出可疑用法）
- [ ] **URL 永远用 `/`**，不要走 `path.join` 拼 URL：`http://127.0.0.1:${port}/api/v1/...` 是 URL，`path.join` 会在 Windows 把 `/` 变 `\`
- [ ] **MAX_PATH 260 字符限制**：`backend/dist-embed/node_modules/<deep>/` 测一下最深路径长度。命令：
  - `find backend/dist-embed -type f | awk '{print length, $0}' | sort -rn | head -5`
  - 超 240 警惕；超 260 直接挂。处理方案：`npm dedupe` 拍平 + electron-builder 的 `nsis.unicode: true` + 用户安装路径不要选太深
- [ ] **Windows 保留文件名**：上传文件命名规范里 grep `CON\|PRN\|AUX\|NUL\|COM[1-9]\|LPT[1-9]`，确认 backend `file.service.ts` 上传过滤会拒绝这些（Mac 阶段没做这个过滤——是 Windows 独有威胁；客户上传一个 `prn.pdf` 就会让 Windows 拒收）

### 2.3 SIGTERM / 进程模型
- [ ] **SIGTERM 在 Windows 上的语义**：Windows 上 `child.kill('SIGTERM')` 实际是 `TerminateProcess`，**不会触发** `process.on('SIGTERM')` handler。`backend/src/main.ts` 如果只监听 `SIGTERM`，Windows 下优雅关闭失效，db 可能 dirty
  - 修复：`backend/src/main.ts` 同时监听 `SIGINT`、`SIGBREAK`，并在 Windows 上用 `process.on('message', ...)` 接收 IPC 终止信号（Electron main 通过 IPC 发更可靠）
  - `desktop/main/backend-process.ts` 的 `stopChild()` 在 Windows 上 SIGTERM 1s 等不到 exit 直接 `taskkill /F /PID` 强杀
- [ ] **child_process.fork 在 Windows 的 stdio**：fork 的 child 在 Windows 上 stdout 默认行缓冲行为跟 Mac 不一致，`READY <port>` 这个 fallback 信号可能延迟到。优先级：IPC `process.send({type:'ready',port})` 主信号，stdout `READY <port>` 备份。`waitForReady()` 已经双通道了，这是对的，照做即可
- [ ] **process group 清理**：Windows 上没 `kill -- -PID`（杀整个进程组）的概念。如果 backend 进程 fork 了孙子进程（puppeteer 拉的 chromium、bull worker 等），父进程被 SIGKILL 时孙子可能成孤儿。处理：在 backend 启动时记录所有自己起的子进程 pid，关闭时显式 `taskkill /T /PID` 杀子树

### 2.4 数据目录与权限
- [ ] **userData 路径**：Windows 上 `app.getPath('userData')` 返回 `%LOCALAPPDATA%\ectd-desktop\` 还是 `%APPDATA%\ectd-desktop\`？
  - 默认 `%APPDATA%\ectd-desktop\`（roaming，用户跨机漫游可见）
  - 单机版本 + 大数据量场景建议改 Local：`app.setPath('userData', path.join(app.getPath('appData').replace('Roaming','Local'), 'ectd-desktop'))`
  - 但要跟 Mac 的 `~/Library/Application Support/ectd-desktop/` 路径风格对齐，**所有 path 拼接代码必须只用 `app.getPath('userData')`**，不要硬编码盘符 / `%APPDATA%`
- [ ] **中文用户名路径**：在中文用户名机器上启动后，看：
  - `<userData>/data.db` 能否创建（better-sqlite3 open）
  - log 里 `DATABASE_URL` 字段是否乱码（控制台输出 cp936 vs 文件 UTF-8）
  - SQLite 查询能否跑（路径是 db 自己 open 时持有，无碍，但 backup/restore 路径要校验）
- [ ] **Program Files 安装权限**：`electron-builder.yml` `nsis.perMachine: false`（Mac 阶段已设）—— 用户级安装到 `%LOCALAPPDATA%\Programs\eCTDTool\`，免 UAC，免 Resources 只读冲突
- [ ] **多用户隔离**：A 用户激活，B 用户登录同机器，看到的应该是 B 自己的未激活状态（machine-id 一样但 license 表 per-user-data-dir 隔离）。卸载器**必须保留 `%APPDATA%\ectd-desktop\`**，否则升级即丢数据。在 NSIS uninstaller 脚本里写 `RMDir /r` **不能** 跨进 userData 目录

### 2.5 受控词汇 + first-run.db（H7 主修复，Windows 必须复用）
- [ ] **构建机能读到 reference**：`<repo>/reference/eCTD技术规范V1.1附件包/` 完整 checked out（Git LFS / .gitignore 都不要排除它）
- [ ] **构建期 fail-fast**：`npm run build:firstrun-db` 跑通，输出末尾必须有 `apt=4 prt=2 rat=9 sqt=4` 字段，少一项整个构建红
- [ ] **Stage-time check**：`scripts/build-electron.sh [4/6]` 已加 6 XML 存在性硬校验，跑构建时观察这条日志：
  - `[4/6] reference XMLs staged: 6 files OK`
  - 没看到这行就是被跳过了
- [ ] **Postbuild verify**：`scripts/postbuild-verify.sh` 现在用 `find -name "eCTDTool.app"` 找 .app —— Windows 包是 .exe + asar，结构完全不同。**必须**给 postbuild-verify 加 windows 分支，找 `desktop/release/win-unpacked/resources/backend/` 而非 `eCTDTool.app/Contents/Resources/backend/`。具体路径以电构 nsis 实际输出为准，第一次跑完 `find desktop/release -name "first-run.db"` 看在哪
- [ ] **运行期自愈**：受控词汇 service 现在 per-vocabulary 自愈（H7 修），不需要 windows 单独适配
- [ ] **真机验证**：装好 exe 打开"创建序列"，确认下拉 9 项 cnrat 都在。Mac 那台冒过这个烟，Windows 也必须各 3 台测试机各冒一遍

### 2.6 Machine ID 跨平台
- [ ] **`desktop/main/machine-id.ts` 三平台分支齐**（Mac 阶段 E7 已实现：darwin → IOPlatformUUID、win32 → wmic + registry MachineGuid、linux → /etc/machine-id）
  - **Windows 实测**：在 cmd / PowerShell 都不可用的会话里 `wmic csproduct get UUID` 是否返回有效值（Win11 24H2 已弃用 wmic！）
  - 备选 Windows 命令：`powershell -c "(Get-CimInstance Win32_ComputerSystemProduct).UUID"` 或 `reg query HKLM\SOFTWARE\Microsoft\Cryptography /v MachineGuid`
- [ ] **`backend/src/license/license.service.ts` 的 shell fallback**：必须三平台齐，且**算法跟 Electron main 完全一致**（同一 sha256 输入），否则 Electron 注入的 machine-id 跟 backend 算的对不上 → 所有激活码失效
- [ ] **`tools/runtime/get-machine-id.js`**：subagent 报告说**目前只有 macOS 分支**，Windows 客户端采集会 `process.exit(1)` 失败。必须补 Windows 分支后再发布，否则你给客户激活前的"采集机器码"步骤 Windows 客户没法做。
  - **必须改完才出包**，不然激活流程死循环

### 2.7 Shell 脚本 / 编码
- [ ] **`scripts/build-electron.sh` 在 Windows 上跑**：用 Git Bash 或 WSL，cmd/PowerShell 不行
- [ ] 脚本里的 Unix 工具映射：
  - `rsync` → Git Bash 自带 / WSL 自带 ✓
  - `shasum -a 256` 或 `sha256sum` → Git Bash 自带 ✓
  - `hdiutil`（Mac dmg 工具）→ Windows 上不会调用，安全
  - `cp -a` → Git Bash / WSL 都支持 ✓
- [ ] **路径传给 NSIS / electron-builder 时格式**：脚本变量始终用正斜杠 `/foo/bar`，但传给原生 Windows 程序（如 signtool）时要 `cygpath -w` 转成 `C:\foo\bar`。electron-builder 内部已经处理，脚本层一般不需要管
- [ ] **控制台编码**：Windows 默认 cp936（中文）/ cp437（英文），Node.js 输出 UTF-8 中文会乱。`electron-log` 写文件用 UTF-8 没事；构建脚本里 `echo "==> [1/6]"` 这种英文输出无碍；如果脚本里有中文 echo（grep 一下）需要 `chcp 65001` 切 UTF-8 终端
- [ ] `LANG` env 在 Windows 下 Node 不读，改成无害（已有 fallback `'en_US.UTF-8'`）

### 2.8 Puppeteer / PDF 导出
- [ ] **Windows 上 Chromium 路径**：puppeteer 默认下到 `%USERPROFILE%\.cache\puppeteer\`，desktop 装好后第一次 PDF 导出会卡很久下 chromium，且需要联网。Mac 阶段没冒过这个烟，Windows 一样有问题。
  - **必修**：要么 `puppeteer-core` + 硬编 chromium 路径用 Electron 内置（找 `process.resourcesPath` 下的 Electron Chromium），要么把 chromium 打进 dmg/exe 一起发（puppeteer 7+ 的 `PUPPETEER_DOWNLOAD_PATH` 配合 build 期下载 + extraResources 打包）
  - 这是 P1 项，不影响首版能装能用，但客户用 PDF 导出就会触发
- [ ] 中文字体：Windows 自带 SimSun（宋体）、SimHei（黑体）、Microsoft YaHei（微软雅黑）；Mac 自带"宋体"、"黑体"。`document_export.md` 里 PDF 模板的 `font-family` 应该带 fallback 链：`'SimSun', '宋体', serif`

### 2.9 防火墙 / 网络
- [ ] **首次启动 Windows Defender Firewall** 弹"允许应用通过防火墙"对话框（127.0.0.1 监听本身不需要外网，但 Windows 仍会提示）。文档里加一条客户操作说明，或在 NSIS 安装时预 grant：
  - `netsh advfirewall firewall add rule name="eCTDTool" dir=in action=allow program="<install>\eCTDTool.exe" enable=yes profile=any`
  - 在 NSIS 的 `installSection` 里调用
- [ ] 多网卡（VPN、WSL2 bridge、Hyper-V switch）：backend 始终监听 `127.0.0.1:0`（OS 分配端口），Electron renderer 通过 IPC 拿到端口再 loadURL，路径很稳。但如果有任何代码用 `0.0.0.0` 或 `os.networkInterfaces()` 选 IP，多网卡会选错。grep 确认

---

## 3. 出包流程（B 段，构建机侧）

### 3.1 一次干净构建
- [ ] `git status` 干净，无 untracked node_modules / dist-embed / release 残留
- [ ] **删 `backend/dist-embed/`、`desktop/dist/`、`desktop/release/`** 强制全新 build（不要 incremental）
- [ ] `cd backend && npm install`、`cd desktop && npm install`、`cd frontend && npm install`
- [ ] `cd backend && npm rebuild better-sqlite3 bcrypt` —— 把 native 拉回 host Node ABI（H3 教训）
- [ ] `bash scripts/build-electron.sh win` —— 只跑这一条，其余流水线自己串

### 3.2 build-electron.sh 每步必看
- [ ] `[1/6] backend: prisma generate (postgres + sqlite) + build:embed` —— 末尾有 `[build-embed] done.` + sanity check 全过
- [ ] `[2/6] backend: produce first-run.db snapshot` —— 末尾打印 `cv=XXX (apt=4 prt=2 rat=9 sqt=4) cvDep=XX stfCat=XX stfTag=XX`，**少一个数字 = 构建红，停下排查**（H7 hard assertions）
- [ ] `[2.5/6] backend: native module rebuild` —— `electron-rebuild` 跑通；产出能看到 better-sqlite3 + bcrypt 重编译为 windows-x64 ABI
- [ ] `[3/6] frontend: vite production build` —— `frontend/dist/index.html` + `frontend/dist/assets/*.js` 至少 1 个
- [ ] `[4/6] desktop: stage resources` —— **必须看到** `[4/6] reference XMLs staged: 6 files OK`（H7 stage-time check）；缺一个直接退出
- [ ] `[5/6] desktop: tsc + electron-builder (win)` —— 产出 `desktop/release/eCTDTool Setup 1.0.0.exe`（命名以 electron-builder 实际为准）
- [ ] `[5.5/6] post-build verify` —— **关键**！这一步 Windows 必须先适配，详见 §3.3
- [ ] `[6/6] SHA256SUMS.txt` —— 输出 `SHA256SUMS.txt 写入 1 行`

### 3.3 postbuild-verify.sh 必须先做 Windows 适配
**当前脚本只支持 Mac**（`find -name "eCTDTool.app"`、`Contents/Resources/backend/`、`libquery_engine-darwin*.dylib.node`）。Windows 出包**不能直接复用**，必须先改。

- [ ] 加 Windows 分支：
  ```bash
  if [[ "$target" == "win"* ]]; then
    APP=$(find "$RELEASE_DIR" -maxdepth 4 -name "win-unpacked" -type d | head -1)
    RES="$APP/resources/backend"   # 实际路径以 electron-builder 输出为准
    ENGINE_GLOB="query_engine-windows.dll.node"
  else
    APP=$(find "$RELEASE_DIR" -maxdepth 3 -name "eCTDTool.app" -type d | head -1)
    RES="$APP/Contents/Resources/backend"
    ENGINE_GLOB="libquery_engine-darwin*.dylib.node"
  fi
  ```
- [ ] better-sqlite3 native 路径在 Windows 是 `node_modules/better-sqlite3/build/Release/better_sqlite3.node`，**文件名相同**（不是 .dll，是 .node 后缀），但 PE 格式不同。可以加 `file` 命令验证（不强求）
- [ ] sqlite3 内容断言（H7 加的那 9 条）跨平台兼容，无需改

### 3.4 代码签名验证
- [ ] 出包后 `signtool verify /pa /v "desktop/release/eCTDTool Setup 1.0.0.exe"` 输出 "Successfully verified"
- [ ] 用 PowerShell `Get-AuthenticodeSignature` 检查证书链 + timestamp 有效
- [ ] 在另一台无证书的 Windows 上下载 exe，看 SmartScreen 提示（EV 证书应该不弹"未识别"，OV 证书可能弹）

---

## 4. 测试机冒烟（C 段，必须 3 台）

### 4.1 干净 Win11 24H2（默认环境）
- [ ] 双击 exe → SmartScreen 评估（应放行）→ NSIS 向导 → 默认目录安装
- [ ] 桌面 + 开始菜单快捷方式都创建了
- [ ] 双击桌面快捷方式启动
- [ ] **第一次启动**等 5-10s，看到主窗口（不是错误对话框、不是 dock 图标无窗口）
- [ ] 主窗口加载完，**不是 `Cannot GET /` JSON**（H6 教训）
- [ ] 看主窗口是激活页（如果客户机未激活）或登录页
- [ ] **登录** `admin@ectd.com / admin123` → 进首页（bcrypt + auto-seed admin 通的证据）
- [ ] **激活**（用真实激活码或测试激活码）→ 看到 banner 显示客户名 + 到期日
- [ ] **创建项目** → 创建申请 → **创建序列**，弹窗里：
  - [ ] 申请类型下拉 4 项（cnapt1-4）
  - [ ] 注册行为类型下拉 9 项（cnrat1-9）—— **H7 主验证点**
  - [ ] 序列类型下拉 4 项（cnsqt1-4）
- [ ] 上传一个 PDF 到某个叶节点 → 触发验证 → 验证报告里看到完整性规则结果（CTD 模板 + 完整性规则 196 条都装了）
- [ ] 模块 4/5 STF 文件标签下拉非空（H7 stf seeding 的验证点）
- [ ] 导出 ZIP / Word / PDF 各试一次：
  - [ ] ZIP 能下载，结构合规（用 ERIS 或解压看 index.xml + cn-regional.xml）
  - [ ] Word 能下载，能用 Office 打开
  - [ ] PDF 能下载，能用 Adobe Reader 打开。**第一次 PDF 导出会卡很久**（puppeteer 下 chromium）—— 如果 §2.8 没修，这是预期行为；客户会觉得卡死
- [ ] 关窗 → dock 图标点击重开 → 不崩溃（H5 类型回归——其实 Windows 没 dock，但有 taskbar，关窗后再点 taskbar 应当能重开）
- [ ] 退出应用 → 用 Process Explorer 看 backend node 进程是否被清理（孤儿进程检查）
- [ ] 重开应用 → 数据保留（项目还在、激活状态还在）
- [ ] **看 log**：`%APPDATA%\ectd-desktop\logs\main.log`（路径以 Electron `app.getPath('userData')` 实际为准）
  - 不该有 `MODULE_NOT_FOUND`
  - 不该有 `ENOENT`（H4 教训）
  - 不该有 `Cannot find module '@prisma/client'`（H1-H2 教训）
  - 不该有 `NODE_MODULE_VERSION` mismatch（H3 教训）
  - 不该有 `Object has been destroyed`（H5 教训）
  - 不该有 `received SIGTERM` 后立即 crash（§2.3 windows 信号教训）
  - 不该有 `受控词汇 reference 目录不存在` warn（H7 教训）

### 4.2 干净 Win10 22H2（向后兼容）
- [ ] 同 4.1 全套，重点关注 SmartScreen 在 Win10 的行为差异、Defender 行为差异
- [ ] 装 `Microsoft Visual C++ Redistributable` 是否提示（better-sqlite3 / bcrypt 依赖）—— 现代 prebuild 通常静态链接，不应该需要

### 4.3 中文用户名机器
- [ ] 用一个用户名为"李四"或类似汉字的本地账户登录
- [ ] 装 exe → 启动
- [ ] **关键检查**：
  - [ ] `C:\Users\李四\AppData\Local\ectd-desktop\data.db` 能否创建（better-sqlite3 open 中文路径）
  - [ ] backend log 里路径是否乱码
  - [ ] Prisma `DATABASE_URL` 形如 `file:C:\Users\李四\AppData\Local\ectd-desktop\data.db` 能否被解析（§2.2 风险点）
  - [ ] 创建项目能正常落库
- [ ] 如果失败：要么改 `DATABASE_URL` 三斜杠正斜杠格式，要么 `app.setPath('userData', ...)` 改到非中文路径

### 4.4（可选）杀软真机
- [ ] 装 360 / 腾讯管家的机器
- [ ] 下载 exe → 看是否被实时拦截
- [ ] 安装时是否被中断
- [ ] 启动后 backend 子进程是否被杀
- [ ] 如有问题：（a）EV 证书会大幅降低误报；（b）向 360/腾讯白名单提交（流程慢，几周到几月）；（c）配送时附文档教用户如何加白

---

## 5. 客户配送（D 段）

### 5.1 配送清单
- [ ] `desktop/release/eCTDTool Setup 1.0.0.exe`（已签名）
- [ ] `desktop/release/SHA256SUMS.txt`
- [ ] 《Windows 安装指南.pdf》—— 内容包括：
  - 系统要求（Win10 21H2+ / Win11，x64，2GB RAM）
  - SmartScreen 放行步骤
  - 360 / 腾讯管家加白名单步骤
  - 防火墙首次启动允许步骤
  - 数据目录位置（`%APPDATA%\ectd-desktop\`）
  - 卸载注意事项（保留 / 删除数据）
- [ ] 《Windows 激活流程.pdf》—— 关键点：在 Windows 上获取机器码的方式（不是 Mac 命令）
  - 客户运行 `node tools\runtime\get-machine-id.js`（前提 §2.6 已修），或装好后从应用"关于"页复制机器码

### 5.2 客户首装支援
- [ ] 远程协助安装（首批客户）
- [ ] 收集：Windows 版本、用户名是否含中文、杀软清单、首次启动 log 截图
- [ ] 任何安装失败 → 立即 hotfix（参考 Mac 阶段 H1-H7 的响应速度）

---

## 6. Mac 阶段交学费的 7 个具体坑（Windows 一定一定不要再犯）

| 坑 | Mac 案例 | Windows 类比威胁 | 防御位置 |
|---|---|---|---|
| **H1 native 模块没复制进 dist-embed** | `Cannot find module '@prisma/client'` | 同 | `build-embed.js` 整包 cp + postbuild verify §3.3 |
| **H2 白名单过滤删 .mjs 文件** | `runtime/library.js` 找不到 | 同 | 已用黑名单 prune，不要回退 |
| **H3 native ABI mismatch** | `NODE_MODULE_VERSION 127 vs 125` | Windows ABI 也独立，必须 electron-rebuild --arch=x64 --platform=win32 | §2.1 + §3.2 [2.5/6] |
| **H4 winston 用相对路径** | `ENOENT: mkdir 'logs'` | Windows Resources 目录也只读 | `main.ts` 用 DATA_DIR 绝对路径，已修，不要回退 |
| **H5 BrowserWindow 销毁后引用未置空** | `TypeError: Object has been destroyed` | Windows 没 dock activate 但有 taskbar 重开 | `desktop/main/index.ts` `attachWindowLifecycle()` 已修，不要回退 |
| **H6 backend 不服务静态文件** | `Cannot GET /` JSON | 同 | `SpaController` + `useStaticAssets` 已修，不要回退 |
| **H7 受控词汇 silent skip** | 注册行为类型下拉为空 | 同 | 三道防线全部 fail-fast 已修，不要回退 |

> **核心方法论教训**：每一个坑都源于"warn + skip 而非 throw"。Windows 出包前请逐条 grep `console.warn`、`logger.warn`、`log.warn`、`return` 找类似模式。

---

## 7. 流程级 Don't List

- ❌ **不要边出包边改代码**。改了代码就是新一轮，必须从 §3.1 干净构建重来
- ❌ **不要用 `git add -A` 提交**。`backend/node_modules/` 在 Mac 阶段两次误进 git history（109fcd1b、64f5fdcb），到现在还有遗留。Windows 阶段每次 commit 前 `git status` + `git diff --stat` 双检
- ❌ **不要复用 Mac 阶段的 `desktop/release/` 目录**。Windows 出包之前先 `rm -rf desktop/release`
- ❌ **不要靠"沙箱跑通就发"**。Mac 阶段 H1-H7 全部沙箱过、真机崩。Windows 阶段同样
- ❌ **不要省 `scripts/postbuild-verify.sh`**。任何一条断言失败立刻停包，不要"先发再改"
- ❌ **不要忽视 native 模块版本号**。Electron 31 → Node ABI 125；Node 20 → ABI 115；Node 22 → ABI 127。出包前 `node --version` + `electron --version` 都要看，确认 electron-rebuild 用对了 target ABI

---

## 8. 完成标准

只有以下全部满足才允许首版 Windows exe 发货：

- [ ] §1 全部勾选
- [ ] §2 全部勾选（特别是 §2.5 H7 类型 + §2.6 machine-id 客户端工具）
- [ ] §3 build-electron.sh + postbuild-verify.sh **都加了 Windows 分支**且跑通
- [ ] §4.1 干净 Win11 + §4.2 Win10 + §4.3 中文用户名 三台测试机全部冒烟通过
- [ ] §5 配送资料齐
- [ ] 测试机一周内无 crash 复现
- [ ] 至少一台机器跑过完整 eCTD 序列创建 → 上传 PDF → 验证 → 导出 ZIP → ZIP 用 ERIS 验通过

---

> 这份 checklist 不是"建议"，是 Mac 阶段付出 7 轮 hotfix + 一次客户机崩溃换来的硬清单。每一条不勾掉就发，复刻 Mac 阶段的痛苦是肯定的。
