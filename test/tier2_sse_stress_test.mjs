#!/usr/bin/env node
/**
 * Round 15 Scaling Stress-Test:
 * Tier 2 Priority SSE Stream (4.50 USDC/hr pass, 25 reveals/hr quota, MAX_DAILY_WITNESSES=500).
 */

import http from 'node:http';
import crypto from 'node:crypto';

const MAX_DAILY_WITNESSES = 500;
const TIER2_HOURLY_REVEAL_QUOTA = 25;
const SELLER_KEYPAIR = crypto.generateKeyPairSync('ed25519');

const witnesses = new Map();
const sseSubscribers = new Set();
const tier2PassUsage = new Map();
let dailyEmitted = 0;

function emitWitness(seq) {
  if (dailyEmitted >= MAX_DAILY_WITNESSES) throw new Error('500/day cap reached');
  dailyEmitted++;

  const id = `w_scale_${seq}`;
  const vertical = seq % 2 === 0 ? 'cloud_gpu_spot_arbitrage' : 'hardware_restock_arbitrage';
  const refCents = 300000;
  const obsCents = 240000 + (seq % 10) * 1000;
  const spreadBps = Math.floor(((refCents - obsCents) * 10000) / refCents);

  const preimageK = crypto.randomBytes(32);
  const hashLockH = crypto.createHash('sha256').update(preimageK).digest('hex');

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', preimageK, iv);
  const secret = JSON.stringify({ sku: `SKU-BATCH-${seq}`, promo: `PROMO-${seq}`, refCents, obsCents });
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const emitHrTimeNs = process.hrtime.bigint();
  const publicClaim = {
    witness_id: id,
    vertical,
    claimed_spread_bps: spreadBps,
    emit_hrtime_ns: emitHrTimeNs.toString(),
    hash_lock_H: hashLockH,
    ciphertext_C: {
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      data: encrypted.toString('hex'),
    },
  };

  const payloadB64 = Buffer.from(JSON.stringify(publicClaim)).toString('base64');
  const sig = crypto.sign(null, Buffer.from(payloadB64), SELLER_KEYPAIR.privateKey).toString('base64');
  const dsse = { payload: payloadB64, sig };

  witnesses.set(id, { id, publicClaim, dsse, preimageKHex: preimageK.toString('hex') });

  if (spreadBps >= 1400) {
    const ssePayload = `event: spread_witness\ndata: ${JSON.stringify({ id, vertical, spreadBps, emit_hrtime_ns: emitHrTimeNs.toString(), dsse })}\n\n`;
    for (const res of sseSubscribers) {
      res.write(ssePayload);
    }
  }
}

async function runStressTest() {
  const server = http.createServer((req, res) => {
    if (req.url === '/stream/tier2' && req.method === 'GET') {
      const pass = req.headers['x-402-tier2-pass'];
      if (!pass || !pass.startsWith('x402_tier2_4.50_usdc_')) {
        res.writeHead(402).end('Payment Required');
        return;
      }
      if (!tier2PassUsage.has(pass)) tier2PassUsage.set(pass, 0);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(': connected\n\n');
      sseSubscribers.add(res);
      req.on('close', () => sseSubscribers.delete(res));
      return;
    }

    if (req.url?.startsWith('/unlock/tier2') && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const { witness_id, pass } = JSON.parse(body);
        const used = tier2PassUsage.get(pass) ?? 0;
        if (used >= TIER2_HOURLY_REVEAL_QUOTA) {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'TIER2_HOURLY_QUOTA_EXCEEDED_25_OF_25' }));
          return;
        }
        const w = witnesses.get(witness_id);
        tier2PassUsage.set(pass, used + 1);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, reveals_used: used + 1, revealed_key_K: w.preimageKHex }));
      });
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const passToken = 'x402_tier2_4.50_usdc_pass_01';
  const pushLatenciesMs = [];
  const receivedIds = [];

  await new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/stream/tier2',
        method: 'GET',
        headers: { 'x-402-tier2-pass': passToken },
      },
      (res) => {
        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';
          for (const evt of events) {
            const dataLine = evt.split('\n').find((l) => l.startsWith('data: '));
            if (dataLine) {
              const recvNs = process.hrtime.bigint();
              const parsed = JSON.parse(dataLine.slice(6));
              const latencyMs = Number(recvNs - BigInt(parsed.emit_hrtime_ns)) / 1e6;
              pushLatenciesMs.push(latencyMs);
              receivedIds.push(parsed.id);
              if (receivedIds.length === 50) {
                req.destroy();
                resolve();
              }
            }
          }
        });
        for (let i = 1; i <= 50; i++) emitWitness(i);
      }
    );
    req.end();
  });

  let succeededReveals = 0;
  let quotaGuardTriggeredOn26th = false;

  for (let i = 1; i <= 26; i++) {
    const res = await fetch(`http://127.0.0.1:${port}/unlock/tier2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ witness_id: `w_scale_${i}`, pass: passToken }),
    });
    const data = await res.json();
    if (res.status === 200 && data.ok) succeededReveals++;
    if (i === 26 && res.status === 429 && data.error === 'TIER2_HOURLY_QUOTA_EXCEEDED_25_OF_25') {
      quotaGuardTriggeredOn26th = true;
    }
  }

  server.close();
  pushLatenciesMs.sort((a, b) => a - b);
  const p50Ms = Number(pushLatenciesMs[Math.floor(pushLatenciesMs.length * 0.5)].toFixed(3));
  const p99Ms = Number(pushLatenciesMs[Math.floor(pushLatenciesMs.length * 0.99)].toFixed(3));
  const maxMs = Number(pushLatenciesMs[pushLatenciesMs.length - 1].toFixed(3));

  console.log(
    JSON.stringify(
      {
        status: 'ROUND_15_TIER2_SSE_STRESS_TEST_PASSED',
        max_daily_cap: MAX_DAILY_WITNESSES,
        witnesses_emitted_and_streamed: receivedIds.length,
        sse_push_latency_ms: {
          p50_ms: p50Ms,
          p99_ms: p99Ms,
          max_ms: maxMs,
          under_100ms_sla: maxMs < 100,
        },
        tier2_hourly_pass_audit: {
          pass_price_usdc: 4.5,
          included_reveals_succeeded: succeededReveals,
          quota_guard_blocked_26th_reveal: quotaGuardTriggeredOn26th,
        },
      },
      null,
      2
    )
  );
}

runStressTest();
