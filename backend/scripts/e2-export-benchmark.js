#!/usr/bin/env node
/**
 * E2-8 benchmark (sync/in-process export simulation).
 *
 * Simulates processing 50 files / 5GB total payload in a sequential
 * in-process pipeline (desktop sync queue mode), and reports:
 * - total elapsed time
 * - throughput
 * - peak RSS memory
 *
 * NOTE:
 * This benchmark focuses on memory/throughput characteristics of
 * synchronous in-process handling and avoids allocating 5GB at once.
 */
const crypto = require('crypto');

function toMB(bytes) {
  return bytes / 1024 / 1024;
}

function readEnvInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const fileCount = readEnvInt('BENCH_FILE_COUNT', 50);
  const totalGB = readEnvInt('BENCH_TOTAL_GB', 5);
  const chunkMB = readEnvInt('BENCH_CHUNK_MB', 1);

  const totalBytes = totalGB * 1024 * 1024 * 1024;
  const perFileBytes = Math.floor(totalBytes / fileCount);
  const chunkBytes = chunkMB * 1024 * 1024;
  const chunksPerFile = Math.ceil(perFileBytes / chunkBytes);

  const chunk = Buffer.alloc(chunkBytes, 0x61);
  let peakRss = process.memoryUsage().rss;
  const started = process.hrtime.bigint();

  for (let i = 0; i < fileCount; i++) {
    const hash = crypto.createHash('sha256');
    for (let j = 0; j < chunksPerFile; j++) {
      hash.update(chunk);
      const rss = process.memoryUsage().rss;
      if (rss > peakRss) peakRss = rss;
    }
    // simulate "export output produced" and immediately released
    hash.digest('hex');
  }

  const ended = process.hrtime.bigint();
  const elapsedSec = Number(ended - started) / 1e9;
  const throughputMBps = toMB(totalBytes) / elapsedSec;

  console.log(JSON.stringify({
    scenario: `${fileCount} files / ${totalGB}GB`,
    fileCount,
    totalGB,
    chunkMB,
    elapsedSec: Number(elapsedSec.toFixed(2)),
    throughputMBps: Number(throughputMBps.toFixed(2)),
    peakRssMB: Number(toMB(peakRss).toFixed(2)),
    timestamp: new Date().toISOString(),
  }, null, 2));
}

main().catch((err) => {
  console.error('[e2-export-benchmark] failed:', err);
  process.exit(1);
});

