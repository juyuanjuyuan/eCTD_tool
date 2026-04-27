import { fork, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log/main';
import type { AppSecrets } from './secrets';
import type { DataDirPaths } from './data-dir';

export interface BackendStartOptions {
  paths: DataDirPaths;
  machineId: string;
  secrets: AppSecrets;
  /** Override path to the bundle; defaults to resourcesPath/backend/backend.bundle.js. */
  bundlePath?: string;
  /** Max ms to wait for `READY <port>` before failing. */
  readyTimeoutMs?: number;
}

export interface BackendHandle {
  port: number;
  pid: number;
  baseUrl: string;
  process: ChildProcess;
  stop: (timeoutMs?: number) => Promise<void>;
}

/**
 * Spawn the backend bundle as a Node child process with all the env vars
 * the bundle's main.ts expects, then wait for the `{type:'ready', port}`
 * IPC message (or `READY <port>` line on stdout as a fallback) before
 * resolving.
 *
 * Source of truth for env list: `grep -rohE "process\\.env\\.[A-Z_]+" backend/src | sort -u`
 * — this function MUST cover every variable the backend reads, otherwise some
 * code paths blow up only when a specific request hits them.
 */
export async function startBackend(options: BackendStartOptions): Promise<BackendHandle> {
  const bundlePath =
    options.bundlePath ??
    path.join((process as any).resourcesPath ?? path.resolve(__dirname, '..', '..'), 'backend', 'backend.bundle.js');

  if (!fs.existsSync(bundlePath)) {
    throw new Error(
      `backend bundle not found at ${bundlePath}. Run "cd backend && npm run build:embed" first.`,
    );
  }

  const resourcesBackend = path.dirname(bundlePath);
  const env = buildBackendEnv(options, resourcesBackend);

  log.info(`forking backend bundle: ${bundlePath}`);
  log.debug(`backend env (sensitive values redacted): ${redactEnv(env)}`);

  const child = fork(bundlePath, [], {
    env,
    silent: true, // capture stdout/stderr ourselves
    serialization: 'json',
  });

  // Pipe child stdio into electron-log (one line per record).
  child.stdout?.on('data', (chunk: Buffer) => {
    chunk
      .toString('utf8')
      .split('\n')
      .filter(Boolean)
      .forEach((line) => log.info(`[backend] ${line}`));
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    chunk
      .toString('utf8')
      .split('\n')
      .filter(Boolean)
      .forEach((line) => log.warn(`[backend stderr] ${line}`));
  });

  const port = await waitForReady(child, options.readyTimeoutMs ?? 30000);

  const handle: BackendHandle = {
    port,
    pid: child.pid!,
    baseUrl: `http://127.0.0.1:${port}`,
    process: child,
    stop: (timeoutMs = 5000) => stopChild(child, timeoutMs),
  };
  log.info(`backend ready on ${handle.baseUrl} (pid ${handle.pid})`);
  return handle;
}

function buildBackendEnv(
  options: BackendStartOptions,
  resourcesBackend: string,
): NodeJS.ProcessEnv {
  const { paths, machineId, secrets } = options;
  return {
    // Inherit a minimal set: PATH and locale only. Don't leak random parent env
    // into a child that is supposed to be a clean prod runtime.
    PATH: process.env.PATH,
    LANG: process.env.LANG ?? 'en_US.UTF-8',
    LC_ALL: process.env.LC_ALL,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,

    // Mode
    NODE_ENV: 'production',
    EMBEDDED: 'true',
    LOG_LEVEL: 'info',

    // Networking
    PORT: '0', // OS-assigned random port
    PUBLIC_BASE_URL: '', // same-origin

    // Database — Prisma SQLite on Windows accepts `file:C:/...` but rejects
    // standards-style `file:///C:/...` with SQLite error 14.
    DB_PROVIDER: 'sqlite',
    DATABASE_URL: toFileUrl(paths.dbFile),
    AUTO_MIGRATE: 'true',
    AUTO_SEED: 'true',
    MIGRATIONS_DIR: path.join(resourcesBackend, 'prisma', 'migrations.sqlite'),
    PRISMA_SQLITE_CLIENT_PATH: path.join(resourcesBackend, 'generated', 'prisma-sqlite'),

    // Cache + queue (no Redis / Bull in desktop build)
    CACHE_PROVIDER: 'memory',
    QUEUE_PROVIDER: 'sync',

    // Storage
    STORAGE_PROVIDER: 'local',
    DATA_DIR: paths.userData,
    STORAGE_PRESIGN_SECRET: secrets.storagePresignSecret,

    // Reference XML location for ControlledVocabulary seed
    REFERENCE_DIR: path.join(paths.referenceDir, 'eCTD技术规范V1.1附件包'),

    // License + JWT
    MACHINE_ID: machineId,
    LICENSE_ENFORCE: 'true',
    JWT_SECRET: secrets.jwtSecret,
    JWT_REFRESH_SECRET: secrets.jwtRefreshSecret,
    JWT_EXPIRES_IN: '7d',
    JWT_REFRESH_EXPIRES_IN: '30d',
  };
}

function toFileUrl(absPath: string): string {
  if (process.platform === 'win32') {
    const fwd = absPath.replace(/\\/g, '/');
    if (/^[A-Za-z]:\//.test(fwd)) return `file:${fwd}`;
    if (fwd.startsWith('//')) return `file:${fwd}`;
    return `file:${fwd}`;
  }
  return `file:${absPath}`;
}

function redactEnv(env: NodeJS.ProcessEnv): string {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (!v) continue;
    if (/SECRET|TOKEN|PASSWORD|KEY/i.test(k)) {
      out[k] = `<${v.length} chars>`;
    } else {
      out[k] = v;
    }
  }
  return JSON.stringify(out, null, 2);
}

function waitForReady(child: ChildProcess, timeoutMs: number): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`backend did not signal READY within ${timeoutMs}ms`));
    }, timeoutMs);

    const onMessage = (msg: any) => {
      if (settled) return;
      if (msg && msg.type === 'ready' && typeof msg.port === 'number') {
        settled = true;
        clearTimeout(timer);
        resolve(msg.port);
      } else if (msg && msg.type === 'error') {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`backend reported error: ${msg.error}`));
      }
    };

    const onStdout = (chunk: Buffer) => {
      if (settled) return;
      const text = chunk.toString('utf8');
      const match = text.match(/^READY\s+(\d+)/m);
      if (match) {
        settled = true;
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    };

    const onExit = (code: number | null, signal: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`backend exited prematurely (code=${code} signal=${signal})`));
    };

    child.on('message', onMessage);
    child.stdout?.on('data', onStdout);
    child.once('exit', onExit);
  });
}

async function stopChild(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;

  log.info(`stopping backend pid=${child.pid}`);

  await new Promise<void>((resolve) => {
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    child.once('exit', finish);

    if (process.platform === 'win32') {
      // On Windows, `child.kill('SIGTERM')` is implemented as TerminateProcess
      // — it does NOT trigger the backend's SIGTERM handler, so Nest's
      // shutdown hooks never run and the SQLite WAL can be left dirty. Ask
      // the backend to flush via IPC instead, then escalate to taskkill /T
      // (kills the whole tree, including any puppeteer chromium grandchildren)
      // if it doesn't exit in time.
      try {
        child.send({ type: 'shutdown' });
      } catch (err) {
        log.warn(`backend IPC shutdown failed: ${(err as Error).message}`);
      }
    } else {
      child.kill('SIGTERM');
    }

    setTimeout(() => {
      if (resolved) return;
      if (process.platform === 'win32') {
        log.warn(`backend pid=${child.pid} did not exit in ${timeoutMs}ms; taskkill /F /T`);
        try {
          // /T kills the whole tree (puppeteer, etc.); /F is force.
          // execSync is acceptable here — we're tearing down at app exit.
          require('child_process').execSync(`taskkill /F /T /PID ${child.pid}`, {
            stdio: ['ignore', 'ignore', 'ignore'],
          });
        } catch (err) {
          log.warn(`taskkill failed: ${(err as Error).message}`);
          try {
            child.kill('SIGKILL');
          } catch {
            // ignore
          }
        }
      } else {
        log.warn(`backend pid=${child.pid} did not exit in ${timeoutMs}ms; SIGKILL`);
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }
      // give it a final 1s grace to deliver `exit` event
      setTimeout(finish, 1000);
    }, timeoutMs);
  });
}
