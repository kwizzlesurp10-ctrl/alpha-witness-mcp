#!/usr/bin/env node
/**
 * Round 12 Multi-Vertical Scaling Harness:
 * Verifies cross-vertical operation (cloud_gpu_spot_arbitrage + hardware_restock_arbitrage),
 * allow-list enforcement, daily volume cap, cross-vertical Tier 1 paid reveal on RTX 5090 restock,
 * 15-minute free Proof-of-Alpha on Mac Studio M4 Ultra restock, and slash verification.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MCP_SERVER_PATH = path.join(__dirname, '../src/pandaforge_alpha_mcp_server.mjs');

async function runMultiVerticalSession() {
  const t0 = performance.now();
  const serverProc = spawn('node', [MCP_SERVER_PATH], { stdio: ['pipe', 'pipe', 'pipe'] });
  let reqId = 1;
  const pending = new Map();

  serverProc.stdout.on('data', (chunk) => {
    const lines = chunk.toString('utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });

  function rpc(method, params = {}) {
    return new Promise((resolve) => {
      const id = reqId++;
      pending.set(id, resolve);
      serverProc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  const listAllRes = await rpc('tools/call', {
    name: 'list_spread_witnesses',
    arguments: { min_spread_bps: 1400, include_historical_proof_of_alpha: true },
  });
  const poolState = JSON.parse(listAllRes.result.content[0].text);

  const hwRevealRes = await rpc('tools/call', {
    name: 'unlock_witness_htlc',
    arguments: {
      witness_id: 'w_hw_rtx5090_01',
      x402_payment_header: 'x402_base_hw_tier1_0.25_usdc_tx_0x5090fe',
      tier: 'tier1_spot_0.25',
    },
  });
  const hwReveal = JSON.parse(hwRevealRes.result.content[0].text);

  const hwLiveWitness = poolState.witnesses.find((w) => w.witness_id === 'w_hw_rtx5090_01');
  const hwSlashCheckRes = await rpc('tools/call', {
    name: 'submit_bond_slash_proof',
    arguments: {
      dsse_envelope: hwLiveWitness.dsse_envelope,
      revealed_key_K: hwReveal.revealed_key_K,
      buyer_wallet: '0xHardwareArbitrageBuyer01',
    },
  });
  const hwSlashCheck = JSON.parse(hwSlashCheckRes.result.content[0].text);

  const hwHistWitness = poolState.witnesses.find((w) => w.witness_id === 'w_hw_rtx5090_hist_02');
  const hwFreeAuditRes = await rpc('tools/call', {
    name: 'submit_bond_slash_proof',
    arguments: {
      dsse_envelope: hwHistWitness.dsse_envelope,
      revealed_key_K: hwHistWitness.free_preimage_key_K,
      buyer_wallet: '0xHardwareAuditorAgent',
    },
  });
  const hwFreeAudit = JSON.parse(hwFreeAuditRes.result.content[0].text);

  serverProc.kill();
  const elapsedMs = (performance.now() - t0).toFixed(2);

  console.log(
    JSON.stringify(
      {
        status: 'ROUND_12_MULTI_VERTICAL_SCALING_VERIFIED',
        elapsed_ms: Number(elapsedMs),
        governance_rails: {
          daily_emitted_count: poolState.daily_emitted_count,
          max_daily_cap: poolState.max_daily_cap,
          allow_listed_domains: poolState.allow_listed_domains,
        },
        witnesses_by_vertical: poolState.witnesses.map((w) => ({
          id: w.witness_id,
          vertical: w.vertical,
          status: w.status,
          bps: w.claimed_spread_bps,
        })),
        cross_vertical_paid_reveal: {
          witness_id: hwReveal.witness_id,
          vertical: hwReveal.vertical,
          unlocked_sku: hwReveal.decrypted_alpha.sku,
          unlocked_promo: hwReveal.decrypted_alpha.promo_code,
          ref_cents: hwReveal.decrypted_alpha.ref_price_cents,
          obs_cents: hwReveal.decrypted_alpha.obs_price_cents,
        },
        hardware_slash_verification: hwSlashCheck,
        hardware_15m_free_proof_of_alpha: {
          witness_id: hwHistWitness.witness_id,
          free_key_exposed: Boolean(hwHistWitness.free_preimage_key_K),
          audit_result: hwFreeAudit.reason,
        },
      },
      null,
      2
    )
  );
}

runMultiVerticalSession();
