import * as path from 'path';
import log from 'electron-log/main';

/**
 * Configure electron-log:
 *   - Console transport (debug builds; production stays warn+).
 *   - File transport rotated daily into `<userData>/logs/main.log`,
 *     keeping ~7 days of history.
 *
 * The backend child process's stdout/stderr is piped into log.info/warn by
 * `backend-process.ts`, so logs from both processes interleave in the same
 * file in chronological order — no need for users to look at two places.
 */
export function configureLogger(logsDir: string): void {
  log.initialize();

  const logFile = path.join(logsDir, 'main.log');
  log.transports.file.resolvePathFn = () => logFile;
  log.transports.file.maxSize = 10 * 1024 * 1024; // 10 MB before rotation
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

  if (process.env.NODE_ENV === 'production') {
    log.transports.console.level = 'warn';
    log.transports.file.level = 'info';
  } else {
    log.transports.console.level = 'debug';
    log.transports.file.level = 'debug';
  }

  log.info(`electron-log writing to ${logFile}`);
}
