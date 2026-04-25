# eCTD Desktop (Electron)

Software_upgrade / E5–E8 deliverable. Wraps the existing NestJS backend +
React frontend into a single-binary desktop app for Mac and Windows.

## 一次性准备

```bash
# 1. 装依赖（在每个目录各跑一遍）
cd backend && npm install
cd ../frontend && npm install
cd ../desktop && npm install

# 2. 生成 SQLite Prisma client（产物在 backend/src/generated/prisma-sqlite/）
cd ../backend && npm run prisma:sqlite:generate
```

## 出包

构建产物落在 `desktop/release/`：

```bash
# 在 Mac 构建机（出 dmg arm64 + x64）
bash scripts/build-electron.sh mac

# 单一 arch
bash scripts/build-electron.sh mac:arm64
bash scripts/build-electron.sh mac:x64

# 在 Win 构建机（出 nsis exe x64）
bash scripts/build-electron.sh win
```

脚本步骤（来源 `scripts/build-electron.sh`）：
1. `cd backend && npm run prisma:sqlite:generate && npm run build:embed` — 出 `backend/dist-embed/backend.bundle.js`（≈9.5 MB）
2. `cd backend && npm run build:firstrun-db` — 出 `backend/prisma/first-run.db`（≈576 KB，含全部 CTD 模板 + 受控词汇 + 默认管理员），脚本完后会移到 `dist-embed/`
3. `cd frontend && npm run build` — vite production
4. `cd desktop && rsync` reference XML → `desktop/resources/reference/`
5. `cd desktop && npx tsc + electron-builder` — 出 dmg / exe
6. 写 `release/SHA256SUMS.txt`

## 签名 / 公证（出对外版必需）

### Mac

```bash
# Apple Developer Program ($99/年) 注册后拿到这三个：
export APPLE_ID="you@company.com"
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"   # appleid.apple.com 生成
export APPLE_TEAM_ID="ABCDE12345"                          # developer.apple.com → Membership

# 改 desktop/electron-builder.yml: mac.notarize: true

bash scripts/build-electron.sh mac
# electron-builder 会自动调 `notarytool submit --wait`
```

### Windows

```bash
# 拿到 EV 代码签名证书（USB token 或 Azure Key Vault）
export WIN_CSC_LINK="/path/to/cert.pfx"
export WIN_CSC_KEY_PASSWORD="..."

bash scripts/build-electron.sh win
```

未签名版本仍可发，但客户首次双击会有 Gatekeeper / SmartScreen 警告（要右键→打开 / 更多信息→仍要运行）。

## 真机测试关键检查

参考 `docs/plans/software_upgrade.md` §2.3 Release Gate **C 段**。最高优先级 5 条：

1. **C3** 启动 < 5s 出窗口（首启 < 10s）。如果黑屏看 `<userData>/Library/Application Support/eCTDTool/logs/main.log` 第一行能定位
2. **C4** 首启自动建 `<userData>/data.db`（从 `first-run.db` 复制）+ 释放 reference 到 `<userData>/reference/`
3. **C5** 激活页指纹 → 用 `tools/issue-license/issue-license.js --customer "测试" --machineId <16hex>` 签一年码 → 粘回去激活成功跳 `/projects`
4. **C7** Cmd+Q（Mac）/ 关窗（Win）后 `pgrep -f backend.bundle` 应为空
5. **C10** 把整个 `<userData>` 拷到第二台机器 → 启动应该激活码失效（指纹变了）

## 目录结构

```
desktop/
├── package.json              ← electron + electron-builder + electron-log
├── tsconfig.json             ← CommonJS, target ES2022
├── electron-builder.yml      ← appId / mac dmg arm64+x64 / win nsis x64
├── build/
│   └── entitlements.mac.plist  ← Hardened Runtime 必需的 jit / unsigned-memory / library-validation 三件套
├── main/
│   ├── index.ts              ← 入口：whenReady → boot()
│   ├── single-instance.ts    ← requestSingleInstanceLock + focus 已有窗口
│   ├── data-dir.ts           ← 初始化 userData + 复制 first-run.db + 释放 reference
│   ├── secrets.ts            ← 持久化 JWT_SECRET / STORAGE_PRESIGN_SECRET
│   ├── machine-id.ts         ← 跨平台指纹（mac/win/linux），缓存到 machine-id.txt
│   ├── backend-process.ts    ← fork backend.bundle.js + 等 READY + graceful stop
│   ├── window.ts             ← BrowserWindow（contextIsolation/sandbox=on）
│   ├── menu.ts               ← 文件/编辑/视图/窗口/帮助
│   ├── tray.ts               ← 系统托盘
│   ├── ipc.ts                ← preload IPC handlers
│   └── logger.ts             ← electron-log → <userData>/logs/main.log
└── preload/
    └── index.ts              ← contextBridge.exposeInMainWorld('electronAPI', {...})
```

## 数据目录

| 平台 | 路径 |
|---|---|
| macOS | `~/Library/Application Support/eCTDTool/` |
| Windows | `%APPDATA%\eCTDTool\` |

```
<userData>/
├── data.db               ← SQLite（首启从 first-run.db 复制）
├── files/                ← 上传文件（LocalStorage 后端）
├── logs/main.log         ← electron-log 滚动 10MB
├── reference/            ← 首启从 resources/reference/ 解压
├── machine-id.txt        ← 机器指纹缓存
└── secrets.json          ← JWT 密钥 (chmod 600)
```

## 开发态运行（不出包）

```bash
# 同一台机器调试，需要 backend bundle 先 build
cd backend && npm run build:embed
cd ../desktop && npm run dev
```

`npm run dev` 内部 = `tsc + electron .`。生产构建用 `build:mac` / `build:win`。
