#!/usr/bin/env node
const crypto = require('crypto');
const { execSync } = require('child_process');

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

if (process.platform !== 'darwin') {
  console.error('Only macOS is supported for machine-id collection.');
  process.exit(1);
}

const cpu = run('sysctl -n machdep.cpu.brand_string');
const serial = run("ioreg -l | awk '/IOPlatformSerialNumber/ { print $4 }' | tr -d '\"'");
const mac = run("ifconfig en0 | awk '/ether/ {print $2}'");

const machineId = crypto
  .createHash('sha256')
  .update(`${cpu}${serial}${mac}`)
  .digest('hex')
  .slice(0, 16);

console.log(machineId);
