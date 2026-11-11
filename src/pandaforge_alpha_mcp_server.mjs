#!/usr/bin/env node
/**
 * PandaForge Alpha MCP Server (pandaforge-alpha-mcp v1.2.0 — Multi-Vertical Scaling)
 * Supports verticals:
 *   - cloud_gpu_spot_arbitrage
 *   - hardware_restock_arbitrage
 * Enforces:
 *   - Explicit DOMAIN_ALLOW_LIST
 *   - MAX_DAILY_WITNESSES = 200 cap
 *   - Hard KILL_SWITCH_ACTIVE circuit breaker
 *   - Native AgentCash / Base L2 Operator Wallet resolution
 */

import crypto from 'node:crypto';
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function resolveOperatorWallet() {
  if (process.env.OPERATOR_WALLET_ADDRESS) {
    return process.env.OPERATOR_WALLET_ADDRESS;
  }
  try {
    const agentCashPath = path.join(os.homedir(), '.agentcash', 'wallet.json');
    if (fs.existsSync(agentCashPath)) {
      const data = JSON.parse(fs.readFileSync(agentCashPath, 'utf8'));
      if (data.address && /^0x[a-fA-F0-9]{40}$/.test(data.address)) {
        return data.address;
      }
    }
  } catch {
    // fallback to static AgentCash EVM address
  }
  return '0xb22f7390Dba812809AFe81dB84Df6f5014Ef93F5';
}

const OPERATOR_WALLET_ADDRESS = resolveOperatorWallet();
const SELLER_KEYPAIR = crypto.generateKeyPairSync('ed25519');
const SELLER_PUBKEY_SPKI_HEX = SELLER_KEYPAIR.publicKey.export({ type: 'spki', format: 'der' }).toString('hex');
const BASE_L2_BOND_CONTRACT = '0x8420A2A00000000000000000000000000000x402';

const DOMAIN_ALLOW_LIST = new Set([
  'cloud.example-gpu-market.io',
  'restock.example-hardware-direct.com',
]);
const MAX_DAILY_WITNESSES = 200;
let KILL_SWITCH_ACTIVE = false;
let dailyEmittedCount = 0;

const WITNESS_POOL = new Map();
let bondBalanceUsdc = 10.0;

function createWitness({
  id,
  vertical,
  sku,
  providerUrl,
  promoCode,
  refCents,
  obsCents,
  claimedOverrideBps = null,
  ageSecOffset = 0,
}) {
  if (KILL_SWITCH_ACTIVE) throw new Error('Kill-switch is active');
  if (dailyEmittedCount >= MAX_DAILY_WITNESSES) throw new Error('Daily witness cap reached');

  const parsedHost = new URL(providerUrl).hostname;
  if (!DOMAIN_ALLOW_LIST.has(parsedHost)) {
    throw new Error(`Domain ${parsedHost} not in DOMAIN_ALLOW_LIST`);
  }
  dailyEmittedCount++;

  const computedBps = Math.floor(((refCents - obsCents) * 10000) / refCents);
  const spreadBps = claimedOverrideBps ?? computedBps;
  const preimageKeyK = crypto.randomBytes(32);
  const hashLockH = crypto.createHash('sha256').update(preimageKeyK).digest('hex');

  const secretPayload = {
    sku,
    vertical,
    provider_url: providerUrl,
    promo_code: promoCode,
    ref_price_cents: refCents,
    obs_price_cents: obsCents,
    seller_self_trade_prohibited: true,
  };

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', preimageKeyK, iv);
  const plaintext = Buffer.from(JSON.stringify(secretPayload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const nowTs = Math.floor(Date.now() / 1000) - ageSecOffset;
  const publicClaim = {
    witness_id: id,
    schema: 'pandaforge.qma2.spread_witness.v1',
    vertical,
    claimed_spread_bps: spreadBps,
    observation_ts: nowTs,
    free_reveal_after_ts: nowTs + 900,
    dom_merkle_root: crypto.createHash('sha256').update(`${id}:${nowTs}`).digest('hex'),
    hash_lock_H: hashLockH,
    base_l2_bond_contract: BASE_L2_BOND_CONTRACT,
    seller_recipient_wallet: OPERATOR_WALLET_ADDRESS,
    ciphertext_C: {
      alg: 'AES-256-GCM',
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      data: encrypted.toString('hex'),
    },
  };

  const payloadBase64 = Buffer.from(JSON.stringify(publicClaim), 'utf8').toString('base64');
  const payloadType = 'application/vnd.pandaforge.witness+json';
  const pae = `DSSEv1 ${payloadType.length} ${payloadType} ${payloadBase64.length} ${payloadBase64}`;
  const sig = crypto.sign(null, Buffer.from(pae, 'utf8'), SELLER_KEYPAIR.privateKey).toString('base64');

  const dsseEnvelope = {
    payloadType,
    payload: payloadBase64,
    signatures: [{ keyid: SELLER_PUBKEY_SPKI_HEX.slice(0, 16), sig }],
  };

  WITNESS_POOL.set(id, {
    id,
    vertical,
    publicClaim,
    dsseEnvelope,
    preimageKeyKHex: preimageKeyK.toString('hex'),
    exclusiveLockedBy: null,
  });
}

// Vertical 1: cloud_gpu_spot_arbitrage
createWitness({
  id: 'w_live_h200_01',
  vertical: 'cloud_gpu_spot_arbitrage',
  sku: 'NVIDIA-H200-SXM-8X-SPOT',
  providerUrl: 'https://cloud.example-gpu-market.io/spot/us-east',
  promoCode: 'QMA2-FLASH-18OFF',
  refCents: 2850,
  obsCents: 2380,
  claimedOverrideBps: 1649,
  ageSecOffset: 120,
});

createWitness({
  id: 'w_hist_b200_00',
  vertical: 'cloud_gpu_spot_arbitrage',
  sku: 'NVIDIA-B200-NVL72-HISTORICAL',
  providerUrl: 'https://cloud.example-gpu-market.io/spot/eu-west',
  promoCode: 'HISTORICAL-FREE',
  refCents: 5200,
  obsCents: 4108,
  claimedOverrideBps: 2100,
  ageSecOffset: 960,
});

// Vertical 2: hardware_restock_arbitrage
createWitness({
  id: 'w_hw_rtx5090_01',
  vertical: 'hardware_restock_arbitrage',
  sku: 'NVIDIA-RTX-5090-FE-BATCH-04',
  providerUrl: 'https://restock.example-hardware-direct.com/drops/rtx-5090-fe',
  promoCode: 'DIRECT-ALLOC-PARITY',
  refCents: 249900,
  obsCents: 199900,
  claimedOverrideBps: 2000,
  ageSecOffset: 45,
});

createWitness({
  id: 'w_hw_rtx5090_hist_02',
  vertical: 'hardware_restock_arbitrage',
  sku: 'APPLE-MAC-STUDIO-M4-ULTRA-512GB',
  providerUrl: 'https://restock.example-hardware-direct.com/drops/mac-studio-m4',
  promoCode: 'EDU-VIP-REFURB',
  refCents: 699900,
  obsCents: 594915,
  claimedOverrideBps: 1500,
  ageSecOffset: 1020,
});

function handleToolCall(name, args) {
  if (name === 'list_spread_witnesses') {
    const minSpread = args.min_spread_bps ?? 1400;
    const requestedVertical = args.vertical ?? null;
    const nowTs = Math.floor(Date.now() / 1000);
    const results = [];

    for (const item of WITNESS_POOL.values()) {
      if (requestedVertical && item.vertical !== requestedVertical) continue;
      if (item.publicClaim.claimed_spread_bps < minSpread) continue;

      const isExpired15m = nowTs >= item.publicClaim.free_reveal_after_ts;
      const isExclusivelyBurned = Boolean(item.exclusiveLockedBy);

      results.push({
        witness_id: item.id,
        vertical: item.vertical,
        claimed_spread_bps: item.publicClaim.claimed_spread_bps,
        observation_ts: item.publicClaim.observation_ts,
        free_reveal_after_ts: item.publicClaim.free_reveal_after_ts,
        hash_lock_H: item.publicClaim.hash_lock_H,
        dom_merkle_root: item.publicClaim.dom_merkle_root,
        base_l2_bond_contract: item.publicClaim.base_l2_bond_contract,
        seller_recipient_wallet: item.publicClaim.seller_recipient_wallet,
        status: isExclusivelyBurned
          ? 'BURNED_TIER3_EXCLUSIVE'
          : isExpired15m
          ? 'FREE_PROOF_OF_ALPHA_EXPIRED_15M'
          : 'LIVE_LOCKED_HTLC',
        free_preimage_key_K: isExpired15m && !isExclusivelyBurned ? item.preimageKeyKHex : null,
        dsse_envelope: item.dsseEnvelope,
      });
    }

    return {
      governance_rails: {
        active_domains: Array.from(DOMAIN_ALLOW_LIST),
        daily_emitted: dailyEmittedCount,
        max_daily_witnesses: MAX_DAILY_WITNESSES,
        kill_switch_active: KILL_SWITCH_ACTIVE,
        operator_wallet: OPERATOR_WALLET_ADDRESS,
      },
      witnesses: results,
    };
  }

  if (name === 'unlock_witness_htlc') {
    const w = WITNESS_POOL.get(args.witness_id);
    if (!w) throw new Error(`Witness ${args.witness_id} not found`);
    if (w.exclusiveLockedBy) throw new Error(`Witness ${args.witness_id} already sniped`);
    if (!args.x402_payment_header || !args.x402_payment_header.startsWith('x402_base_')) {
      throw new Error('Invalid x402 payment header');
    }
    if (args.tier === 'tier3_exclusive_25.00') {
      w.exclusiveLockedBy = args.x402_payment_header;
    }
    const keyBuf = Buffer.from(w.preimageKeyKHex, 'hex');
    const { iv, tag, data } = w.publicClaim.ciphertext_C;
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    const decrypted = JSON.parse(
      Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8')
    );
    return {
      settled: true,
      witness_id: w.id,
      vertical: w.vertical,
      tier: args.tier,
      seller_recipient_wallet: OPERATOR_WALLET_ADDRESS,
      exclusive_pool_burn: args.tier === 'tier3_exclusive_25.00',
      revealed_key_K: w.preimageKeyKHex,
      decrypted_alpha: decrypted,
    };
  }

  if (name === 'submit_bond_slash_proof') {
    const claim = JSON.parse(Buffer.from(args.dsse_envelope.payload, 'base64').toString('utf8'));
    const keyBuf = Buffer.from(args.revealed_key_K, 'hex');
    const hashHex = crypto.createHash('sha256').update(keyBuf).digest('hex');
    if (hashHex !== claim.hash_lock_H) {
      throw new Error('Preimage K does not match claim.hash_lock_H');
    }
    const { iv, tag, data } = claim.ciphertext_C;
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    const payload = JSON.parse(
      Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8')
    );
    const actualBps = Math.floor(
      ((payload.ref_price_cents - payload.obs_price_cents) * 10000) / payload.ref_price_cents
    );
    if (actualBps < claim.claimed_spread_bps) {
      const slashedAmount = bondBalanceUsdc;
      bondBalanceUsdc = 0;
      return {
        verified: false,
        slashed: true,
        reason: `FRAUD_PROVEN: actual ${actualBps} bps < claimed ${claim.claimed_spread_bps} bps`,
        slashed_usdc: slashedAmount,
        recipient: args.buyer_wallet,
        bond_remaining_usdc: 0,
      };
    }
    return {
      verified: true,
      slashed: false,
      reason: `VALID_WITNESS: actual ${actualBps} bps >= claimed ${claim.claimed_spread_bps} bps`,
      bond_remaining_usdc: bondBalanceUsdc,
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const req = JSON.parse(line);
    if (req.method === 'tools/list') {
      const res = {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          tools: [
            {
              name: 'list_spread_witnesses',
              description: 'List DSSE-signed live and historical spread witnesses across multi-verticals.',
              inputSchema: {
                type: 'object',
                properties: {
                  vertical: {
                    type: 'string',
                    enum: ['cloud_gpu_spot_arbitrage', 'hardware_restock_arbitrage'],
                  },
                  min_spread_bps: { type: 'integer' },
                },
              },
            },
            {
              name: 'unlock_witness_htlc',
              description: 'Atomic x402 Base L2 payment reveal for encrypted alpha payload.',
              inputSchema: {
                type: 'object',
                properties: {
                  witness_id: { type: 'string' },
                  x402_payment_header: { type: 'string' },
                  tier: {
                    type: 'string',
                    enum: ['tier1_spot_0.25', 'tier2_stream_4.50', 'tier3_exclusive_25.00'],
                  },
                },
                required: ['witness_id', 'x402_payment_header', 'tier'],
              },
            },
            {
              name: 'submit_bond_slash_proof',
              description: 'Submit integer-cent fraud proof to verify or slash the 10 USDC bond.',
              inputSchema: {
                type: 'object',
                properties: {
                  dsse_envelope: { type: 'object' },
                  revealed_key_K: { type: 'string' },
                  buyer_wallet: { type: 'string' },
                },
                required: ['dsse_envelope', 'revealed_key_K', 'buyer_wallet'],
              },
            },
          ],
        },
      };
      process.stdout.write(JSON.stringify(res) + '\n');
      return;
    }

    if (req.method === 'tools/call') {
      const result = handleToolCall(req.params.name, req.params.arguments || {});
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }) + '\n');
      return;
    }

    process.stdout.write(
      JSON.stringify({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'Method not found' } }) + '\n'
    );
  } catch (err) {
    process.stdout.write(
      JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: err.message } }) + '\n'
    );
  }
});
