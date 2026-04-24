#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function toBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function dateFromNow(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

const args = parseArgs(process.argv);
const customer = args.customer;
const machineId = args.machineId;
const days = Number(args.days || 365);
const privateKeyPath = args.privateKey || path.resolve('tools/keys/private.pem');
const outputPath = args.out || '';

if (!customer || !machineId) {
  console.error('Usage: node tools/issue-license/issue-license.js --customer "Acme" --machineId "abcdef1234567890" [--days 365] [--privateKey tools/keys/private.pem] [--out license.txt]');
  process.exit(1);
}

if (!/^[a-f0-9]{16}$/i.test(machineId)) {
  console.error('[ERROR] machineId must be 16 hex chars.');
  process.exit(1);
}

if (!fs.existsSync(privateKeyPath)) {
  console.error(`[ERROR] private key not found: ${privateKeyPath}`);
  process.exit(1);
}

const issuedAt = new Date().toISOString().slice(0, 10);
const payload = {
  customer,
  machineId: machineId.toLowerCase(),
  issuedAt,
  expiresAt: dateFromNow(days),
  nonce: crypto.randomBytes(12).toString('hex'),
};

const payloadJson = JSON.stringify(payload);
const signer = crypto.createSign('RSA-SHA256');
signer.update(payloadJson);
signer.end();

const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
const signature = signer.sign(privateKey);

const code = `${toBase64Url(payloadJson)}.${signature.toString('base64url')}`;

if (outputPath) {
  fs.writeFileSync(outputPath, code, 'utf8');
  console.log(`[OK] license written to ${outputPath}`);
} else {
  console.log(code);
}
