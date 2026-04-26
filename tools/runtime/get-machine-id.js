#!/usr/bin/env node
/**
 * Cross-platform machine-id collector. Run on the customer's machine *before*
 * activation: the output (16 hex chars) is the value the customer pastes into
 * the activation portal so the issued license is bound to that exact machine.
 *
 * Algorithm: sha256(cpu + boardSerial + firstNonZeroMac).slice(0, 16)
 *
 * MUST stay byte-for-byte compatible with:
 *   - desktop/main/machine-id.ts  (Electron-side; same seed, same hash)
 *   - backend/src/license/license.service.ts collectFingerprint()
 * If you change the algorithm here, change those two too — every existing
 * activation breaks otherwise.
 */
const crypto = require('crypto');
const os = require('os');
const { execSync } = require('child_process');

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function tryRun(cmd, fallback = '') {
  try {
    return sh(cmd);
  } catch {
    return fallback;
  }
}

function firstUsefulMac() {
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

function collectDarwin() {
  const cpu = sh('sysctl -n machdep.cpu.brand_string');
  const serial = sh("ioreg -l | awk '/IOPlatformSerialNumber/ { print $4 }' | tr -d '\"'");
  let mac = tryRun("ifconfig en0 | awk '/ether/ {print $2}'");
  if (!mac) mac = firstUsefulMac();
  return { cpu, serial, mac };
}

function collectWin32() {
  // wmic is deprecated in Win11 24H2 and removed from new installs. Try wmic
  // first (faster, works everywhere it exists), then fall back to PowerShell
  // CIM cmdlets which are present on every supported Windows.
  let cpu = '';
  let serial = '';

  const cpuOut = tryRun('wmic cpu get ProcessorId /value');
  cpu = (cpuOut.match(/ProcessorId=([^\r\n]+)/) || [])[1]?.trim() || '';
  if (!cpu) {
    const ps = tryRun(
      'powershell -NoProfile -Command "(Get-CimInstance Win32_Processor).ProcessorId"'
    );
    cpu = ps.split('\n')[0]?.trim() || '';
  }

  const boardOut = tryRun('wmic baseboard get SerialNumber /value');
  serial = (boardOut.match(/SerialNumber=([^\r\n]+)/) || [])[1]?.trim() || '';
  if (!serial || serial.toLowerCase() === 'to be filled by o.e.m.') {
    const ps = tryRun(
      'powershell -NoProfile -Command "(Get-CimInstance Win32_BaseBoard).SerialNumber"'
    );
    const psSerial = ps.split('\n')[0]?.trim();
    if (psSerial) serial = psSerial;
  }
  if (!serial) {
    // Last resort: registry MachineGuid (stable across reboots, written once at install)
    const reg = tryRun('reg query HKLM\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid');
    const m = reg.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/);
    if (m) serial = m[1].trim();
  }

  const mac = firstUsefulMac();
  return { cpu, serial, mac };
}

function collectLinux() {
  const cpu = tryRun("grep 'model name' /proc/cpuinfo | head -1");
  let serial = tryRun('cat /sys/class/dmi/id/board_serial 2>/dev/null');
  if (!serial) serial = tryRun('cat /etc/machine-id 2>/dev/null');
  if (!serial) serial = 'linux-no-board-serial';
  const mac = firstUsefulMac();
  return { cpu, serial, mac };
}

let parts;
if (process.platform === 'darwin') {
  parts = collectDarwin();
} else if (process.platform === 'win32') {
  parts = collectWin32();
} else if (process.platform === 'linux') {
  parts = collectLinux();
} else {
  console.error(`Unsupported platform: ${process.platform}`);
  process.exit(1);
}

const seed = `${parts.cpu}${parts.serial}${parts.mac}`.trim();
if (!seed) {
  console.error('Unable to collect any machine fingerprint source on this platform.');
  console.error(`  cpu=<${parts.cpu}> serial=<${parts.serial}> mac=<${parts.mac}>`);
  process.exit(1);
}

const machineId = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
console.log(machineId);
