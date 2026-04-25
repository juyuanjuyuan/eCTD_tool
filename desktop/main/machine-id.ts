import { execSync } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import log from 'electron-log/main';

/**
 * E7: cross-platform machine fingerprint collection.
 *
 * Algorithm: sha256(cpu + boardSerial + firstNonZeroMac).slice(0, 16)
 *
 * Platform sources:
 *   - macOS: `sysctl -n machdep.cpu.brand_string` + `ioreg IOPlatformSerialNumber` + `ifconfig en0 ether`
 *   - Windows: `wmic cpu get ProcessorId` + `wmic baseboard get SerialNumber` + first network MAC
 *   - Linux (dev only): `/proc/cpuinfo` + `/sys/class/dmi/id/board_serial` + `ip link`
 *
 * The result is cached to `<userData>/machine-id.txt` so transient hardware
 * blips (network reset, sleep/wake) cannot drift the fingerprint and
 * invalidate the activation. Deleting that file recomputes; the value should
 * still match (assuming hardware unchanged).
 *
 * IMPORTANT: must produce the same bytes as `tools/runtime/get-machine-id.js`
 * and `backend/src/license/license.service.ts`'s shell fallback. If you change
 * the algorithm here, change those two too — otherwise existing licenses break.
 */
export function getMachineId(userDataDir: string): string {
  const cacheFile = path.join(userDataDir, 'machine-id.txt');

  // 1) cached
  if (fs.existsSync(cacheFile)) {
    try {
      const cached = fs.readFileSync(cacheFile, 'utf8').trim().toLowerCase();
      if (/^[a-f0-9]{16}$/.test(cached)) {
        return cached;
      }
      log.warn(`machine-id.txt content invalid (${cached}), recomputing`);
    } catch (err) {
      log.warn(`machine-id.txt read failed: ${(err as Error).message}`);
    }
  }

  // 2) compute
  const id = computeMachineId();

  // 3) persist (best-effort)
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(cacheFile, id, 'utf8');
  } catch (err) {
    log.warn(`machine-id.txt write failed: ${(err as Error).message}`);
  }

  return id;
}

function computeMachineId(): string {
  const platform = process.platform;
  let cpu = '';
  let serial = '';
  let mac = '';

  try {
    if (platform === 'darwin') {
      cpu = sh('sysctl -n machdep.cpu.brand_string');
      serial = sh(`ioreg -l | awk '/IOPlatformSerialNumber/ { print $4 }' | tr -d '"'`);
      mac = sh(`ifconfig en0 | awk '/ether/ {print $2}'`);
      // some Macs (M-series, no en0 wifi) require fallback to en1/en2
      if (!mac) {
        mac = firstUsefulMac();
      }
    } else if (platform === 'win32') {
      const cpuOut = sh('wmic cpu get ProcessorId /value');
      cpu = (cpuOut.match(/ProcessorId=([^\r\n]+)/) || [])[1]?.trim() || '';
      const boardOut = sh('wmic baseboard get SerialNumber /value');
      serial = (boardOut.match(/SerialNumber=([^\r\n]+)/) || [])[1]?.trim() || '';
      // wmic + getmac can be flaky; use os.networkInterfaces() instead
      mac = firstUsefulMac();
    } else {
      // Linux (dev only)
      cpu = sh(`grep "model name" /proc/cpuinfo | head -1`).trim();
      try {
        serial = sh(`cat /sys/class/dmi/id/board_serial 2>/dev/null`).trim();
      } catch {
        serial = 'linux-no-board-serial';
      }
      mac = firstUsefulMac();
    }
  } catch (err) {
    log.warn(`Machine fingerprint partial collection failure: ${(err as Error).message}`);
  }

  const seed = `${cpu}${serial}${mac}`.trim();
  if (!seed) {
    // Last-ditch fallback: hostname (unstable but better than crashing)
    log.error('All fingerprint sources empty; falling back to hostname');
    return crypto.createHash('sha256').update(os.hostname()).digest('hex').slice(0, 16);
  }
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
}

function sh(cmd: string): string {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function firstUsefulMac(): string {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.internal) continue;
      if (!iface.mac) continue;
      if (iface.mac === '00:00:00:00:00:00') continue;
      return iface.mac;
    }
  }
  return '';
}
