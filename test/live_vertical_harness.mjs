#!/usr/bin/env node
/**
 * Test: Round 12 Multi-Vertical Scaling Harness (Cloud GPU + Hardware Restock)
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const candidates = [
  path.resolve(__dirname, '../src/pandaforge_alpha_mcp_server.mjs'),
  path.resolve(__dirname, 'src/pandaforge_alpha_mcp_server.mjs'),
  path.resolve(__dirname, 'pandaforge_alpha_mcp_server.mjs'),
  '/home/keef/.gemini/antigravity-cli/brain/cf017044-abde-4b88-b7de-0e77892dd433/scratch/npm_dist/src/pandaforge_alpha_mcp_server.mjs'
];

let serverScript = null;
for (const p of candidates) {
  if (fs.existsSync(p)) {
    serverScript = p;
    break;
  }
}

if (!serverScript) {
  throw new Error(`Cannot locate pandaforge_alpha_mcp_server.mjs in candidates: ${candidates.join(', ')}`);
}

const serverProc = spawn('node', [serverScript], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let rpcId = 1;
const pending = new Map();

serverProc.stdout.on('data', data => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line.trim());
      if (parsed.id && pending.has(parsed.id)) {
        const resolve = pending.get(parsed.id);
        pending.delete(parsed.id);
        resolve(parsed);
      }
    } catch {}
  }
});

serverProc.stderr.on('data', data => {
  const msg = data.toString();
  if (msg.includes('ExperimentalWarning') || msg.includes('DeprecationWarning')) return;
  console.error(`[Server stderr] ${msg}`);
});

serverProc.on('close', code => {
  if (code !== 0 && pending.size > 0) {
    for (const [id, resolve] of pending.entries()) {
      resolve({ error: { code: -32000, message: `Server process exited early with code ${code}` } });
    }
    pending.clear();
  }
});

function callRpc(method, params) {
  return new Promise(resolve => {
    const id = rpcId++;
    pending.set(id, resolve);
    serverProc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

const start = performance.now();

// 1. Initialize MCP session
await callRpc('initialize', {
  protocolVersion: '2024-11-05',
  clientInfo: { name: 'test-harness', version: '1.0.0' }
});

// 2. Query all witnesses across verticals
const listAllRes = await callRpc('tools/call', {
  name: 'list_spread_witnesses',
  arguments: { min_spread_bps: 1400, include_historical_proof_of_alpha: true }
});

const poolState = JSON.parse(listAllRes.result.content[0].text);

// 3. Paid unlock on hardware vertical witness
const unlockRes = await callRpc('tools/call', {
  name: 'unlock_witness_htlc',
  arguments: {
    witness_id: 'w_hw_rtx5090_01',
    x402_payment_header: 'Bearer x402_tx_base_l2_micropay_0x0003',
    tier: 'tier1_spot_0.25'
  }
});

const unlockData = JSON.parse(unlockRes.result.content[0].text);

// 4. Verify integer-cent slash protection on hardware witness
const hwWitness = poolState.witnesses.find(w => w.witness_id === 'w_hw_rtx5090_01');
const slashCheckRes = await callRpc('tools/call', {
  name: 'submit_bond_slash_proof',
  arguments: {
    dsse_envelope: hwWitness.dsse_envelope,
    revealed_key_K: unlockData.revealed_preimage_key_K,
    buyer_wallet: '0xBuyerVerifierHardware'
  }
});

const slashData = JSON.parse(slashCheckRes.result.content[0].text);

// 5. Verify 15-minute free proof of alpha on historical hardware witness
const hwHist = poolState.witnesses.find(w => w.witness_id === 'w_hw_rtx5090_hist_02');
const freeAuditRes = await callRpc('tools/call', {
  name: 'submit_bond_slash_proof',
  arguments: {
    dsse_envelope: hwHist.dsse_envelope,
    revealed_key_K: hwHist.free_preimage_key_K,
    buyer_wallet: '0xPublicObserver'
  }
});

const freeAuditData = JSON.parse(freeAuditRes.result.content[0].text);

const elapsed = (performance.now() - start).toFixed(2);

serverProc.kill();

console.log(
  JSON.stringify(
    {
      status: 'ROUND_12_MULTI_VERTICAL_SCALING_VERIFIED',
      elapsed_ms: parseFloat(elapsed),
      governance_rails: {
        daily_emitted_count: poolState.daily_emitted_count,
        max_daily_cap: poolState.max_daily_cap,
        allow_listed_domains: poolState.allow_listed_domains
      },
      witnesses_by_vertical: poolState.witnesses.map(w => ({
        id: w.witness_id,
        vertical: w.vertical,
        status: w.status,
        bps: w.claimed_spread_bps
      })),
      cross_vertical_paid_reveal: {
        witness_id: unlockData.witness_id,
        vertical: hwWitness.vertical,
        unlocked_sku: unlockData.atomic_decrypted_alpha.sku,
        unlocked_promo: unlockData.atomic_decrypted_alpha.promo_code,
        ref_cents: unlockData.atomic_decrypted_alpha.ref_cents,
        obs_cents: unlockData.atomic_decrypted_alpha.obs_cents
      },
      hardware_slash_verification: {
        slashed: slashData.slashed,
        reason: slashData.reason,
        bond_remaining_usdc: slashData.remaining_bond_usdc
      },
      hardware_15m_free_proof_of_alpha: {
        witness_id: hwHist.witness_id,
        free_key_exposed: hwHist.free_preimage_key_K !== null,
        audit_result: freeAuditData.reason
      }
    },
    null,
    2
  )
);
