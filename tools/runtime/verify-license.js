#!/usr/bin/env node
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');

function fail(message, code = 1) {
  console.error(`[LICENSE] ${message}`);
  process.exit(code);
}

function getMachineFingerprint() {
  const override = process.env.LICENSE_MACHINE_ID_OVERRIDE;
  if (override) return override.toLowerCase();

  const platform = process.platform;
  if (platform !== 'darwin') {
    fail(`unsupported runtime platform: ${platform}. current launcher only supports macOS.`);
  }

  const cpu = execSync('sysctl -n machdep.cpu.brand_string', { encoding: 'utf8' }).trim();
  const serial = execSync("ioreg -l | awk '/IOPlatformSerialNumber/ { print $4 }' | tr -d '\"'", { encoding: 'utf8' }).trim();
  const mac = execSync("ifconfig en0 | awk '/ether/ {print $2}'", { encoding: 'utf8' }).trim();

  return crypto.createHash('sha256').update(`${cpu}${serial}${mac}`).digest('hex').slice(0, 16);
}

function fromBase64Url(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function verify({ licenseFile, publicKeyFile }) {
  if (!fs.existsSync(licenseFile)) fail(`license file not found: ${licenseFile}`);
  if (!fs.existsSync(publicKeyFile)) fail(`public key file not found: ${publicKeyFile}`);

  const raw = fs.readFileSync(licenseFile, 'utf8').trim();
  const [payloadPart, signaturePart] = raw.split('.');
  if (!payloadPart || !signaturePart) fail('invalid license format');

  const payloadJson = fromBase64Url(payloadPart);
  const payload = JSON.parse(payloadJson);
  const signature = Buffer.from(signaturePart, 'base64url');

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(payloadJson);
  verifier.end();

  const publicKey = fs.readFileSync(publicKeyFile, 'utf8');
  const valid = verifier.verify(publicKey, signature);
  if (!valid) fail('signature verification failed');

  const now = new Date().toISOString().slice(0, 10);
  if (payload.expiresAt < now) fail(`license expired on ${payload.expiresAt}`);

  const machineId = getMachineFingerprint();
  if (payload.machineId !== machineId) {
    fail(`machineId mismatch. expected=${payload.machineId}, current=${machineId}`);
  }

  console.log(`[LICENSE] OK customer=${payload.customer} expiresAt=${payload.expiresAt}`);
}

const licenseFile = process.argv[2];
const publicKeyFile = process.argv[3];

if (!licenseFile || !publicKeyFile) {
  fail('usage: node tools/runtime/verify-license.js <license-file> <public-key-file>');
}

verify({ licenseFile, publicKeyFile });
