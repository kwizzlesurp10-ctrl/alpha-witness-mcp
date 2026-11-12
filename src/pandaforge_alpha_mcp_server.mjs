#!/usr/bin/env node
/**
 * @pandaforge/alpha-witness-mcp Server
 * Model Context Protocol (MCP) Server for Verifiable Spread Witnesses & Live Intent Arbitrage.
 */

import readline from 'node:readline';
import crypto from 'node:crypto';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = {
  name: 'pandaforge-alpha-witness-mcp',
  version: '1.2.0'
};

const MCP_TOOLS = [
  {
    name: 'list_spread_witnesses',
    description: 'List DSSE-signed live and historical spread witnesses across verticals.',
    inputSchema: {
      type: 'object',
      properties: {
        vertical: { type: 'string' },
        min_spread_bps: { type: 'integer', default: 1400 },
        include_historical_proof_of_alpha: { type: 'boolean', default: true }
      },
      required: ['min_spread_bps']
    }
  },
  {
    name: 'unlock_witness_htlc',
    description: 'Verify x402 Base L2 USDC payment header and atomically reveal preimage_key_K.',
    inputSchema: {
      type: 'object',
      properties: {
        witness_id: { type: 'string' },
        x402_payment_header: { type: 'string' },
        tier: { type: 'string', enum: ['tier1_spot_0.25', 'tier2_stream_4.50', 'tier3_exclusive_25.00'] }
      },
      required: ['witness_id', 'x402_payment_header', 'tier']
    }
  },
  {
    name: 'submit_bond_slash_proof',
    description: 'Submit a deterministic integer-cent fraud proof to verify or slash the 10 USDC bond.',
    inputSchema: {
      type: 'object',
      properties: {
        dsse_envelope: { type: 'object' },
        revealed_key_K: { type: 'string' },
        buyer_wallet: { type: 'string' }
      },
      required: ['dsse_envelope', 'revealed_key_K', 'buyer_wallet']
    }
  }
];

function canonicalJson(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

function computeDomMerkleRoot(elements) {
  const leaves = elements.map(e => crypto.createHash('sha256').update(canonicalJson(e)).digest('hex'));
  return crypto.createHash('sha256').update(leaves.join('')).digest('hex');
}

function encryptSecretAlpha(payloadObj, keyHex) {
  const iv = crypto.randomBytes(12);
  const key = Buffer.from(keyHex, 'hex');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let enc = cipher.update(JSON.stringify(payloadObj), 'utf8', 'hex');
  enc += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return {
    alg: 'AES-256-GCM',
    iv: iv.toString('hex'),
    tag,
    data: enc
  };
}

const keyPair = crypto.generateKeyPairSync('ed25519');

function signDsse(payloadObj) {
  const canonicalBytes = Buffer.from(canonicalJson(payloadObj), 'utf8');
  const b64Payload = canonicalBytes.toString('base64');
  const pae = Buffer.concat([
    Buffer.from('DSSEv1 37 application/vnd.pandaforge.witness+json '),
    Buffer.from(String(b64Payload.length)),
    Buffer.from(' '),
    Buffer.from(b64Payload)
  ]);
  const sig = crypto.sign(null, pae, keyPair.privateKey);
  return {
    payloadType: 'application/vnd.pandaforge.witness+json',
    payload: b64Payload,
    signatures: [
      {
        keyid: crypto.createHash('sha256').update(keyPair.publicKey.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16),
        sig: sig.toString('base64')
      }
    ]
  };
}

const SELLER_AGENTCASH_WALLET = '0xb22f7390Dba812809AFe81dB84Df6f5014Ef93F5';
const BASE_L2_BOND_CONTRACT = '0x8420A2A000000000000000000000000000000x402';

const secretKey1 = crypto.randomBytes(32).toString('hex');
const hashLockH1 = crypto.createHash('sha256').update(Buffer.from(secretKey1, 'hex')).digest('hex');
const secretAlpha1 = {
  sku: 'NVIDIA-H200-SXM-8X-SPOT',
  provider_url: 'https://cloud.example-gpu-market.io/spot/us-east',
  promo_code: 'QMA2-FLASH-18OFF',
  reference_price_usd_hr: 28.50,
  observed_price_usd_hr: 23.80,
  ref_cents: 2850,
  obs_cents: 2380
};
const encAlpha1 = encryptSecretAlpha(secretAlpha1, secretKey1);
const domRoot1 = computeDomMerkleRoot([
  { selector: '#sku-header', text: 'NVIDIA H200 SXM 8X' },
  { selector: '.pricing-rate', text: '$23.80 / hr' },
  { selector: '.availability-badge', text: 'Available Now' }
]);
const dsseWitness1 = signDsse({
  witness_id: 'w_live_h200_01',
  schema: 'pandaforge.qma2.spread_witness.v1',
  vertical: 'cloud_gpu_spot_arbitrage',
  claimed_spread_bps: 1649,
  observation_ts: Math.floor(Date.now() / 1000) - 10,
  free_reveal_after_ts: Math.floor(Date.now() / 1000) + 890,
  dom_merkle_root: domRoot1,
  hash_lock_H: hashLockH1,
  base_l2_bond_contract: BASE_L2_BOND_CONTRACT,
  seller_recipient_wallet: SELLER_AGENTCASH_WALLET,
  ciphertext_C: encAlpha1
});

const secretKey2 = crypto.randomBytes(32).toString('hex');
const hashLockH2 = crypto.createHash('sha256').update(Buffer.from(secretKey2, 'hex')).digest('hex');
const secretAlpha2 = {
  sku: 'NVIDIA-B200-HGX-8X-SPOT',
  provider_url: 'https://cloud.example-gpu-market.io/spot/us-central',
  promo_code: 'QMA2-B200-HISTORICAL',
  reference_price_usd_hr: 38.00,
  observed_price_usd_hr: 30.02,
  ref_cents: 3800,
  obs_cents: 3002
};
const encAlpha2 = encryptSecretAlpha(secretAlpha2, secretKey2);
const domRoot2 = computeDomMerkleRoot([
  { selector: '#sku-header', text: 'NVIDIA B200 HGX 8X' },
  { selector: '.pricing-rate', text: '$30.02 / hr' }
]);
const dsseWitness2 = signDsse({
  witness_id: 'w_hist_b200_00',
  schema: 'pandaforge.qma2.spread_witness.v1',
  vertical: 'cloud_gpu_spot_arbitrage',
  claimed_spread_bps: 2100,
  observation_ts: Math.floor(Date.now() / 1000) - 960,
  free_reveal_after_ts: Math.floor(Date.now() / 1000) - 60,
  dom_merkle_root: domRoot2,
  hash_lock_H: hashLockH2,
  base_l2_bond_contract: BASE_L2_BOND_CONTRACT,
  seller_recipient_wallet: SELLER_AGENTCASH_WALLET,
  ciphertext_C: encAlpha2
});

const secretKey3 = crypto.randomBytes(32).toString('hex');
const hashLockH3 = crypto.createHash('sha256').update(Buffer.from(secretKey3, 'hex')).digest('hex');
const secretAlpha3 = {
  sku: 'NVIDIA-RTX-5090-FE-BATCH-04',
  provider_url: 'https://restock.example-hardware-direct.com/sku/rtx5090-fe',
  promo_code: 'DIRECT-ALLOC-PARITY',
  reference_price_usd: 2499.00,
  observed_price_usd: 1999.00,
  ref_cents: 249900,
  obs_cents: 199900
};
const encAlpha3 = encryptSecretAlpha(secretAlpha3, secretKey3);
const domRoot3 = computeDomMerkleRoot([
  { selector: '.product-title', text: 'GeForce RTX 5090 Founders Edition' },
  { selector: '.inventory-stock', text: 'In Stock - Limit 1 per household' },
  { selector: '.checkout-price', text: '$1,999.00' }
]);
const dsseWitness3 = signDsse({
  witness_id: 'w_hw_rtx5090_01',
  schema: 'pandaforge.qma2.spread_witness.v1',
  vertical: 'hardware_restock_arbitrage',
  claimed_spread_bps: 2000,
  observation_ts: Math.floor(Date.now() / 1000) - 8,
  free_reveal_after_ts: Math.floor(Date.now() / 1000) + 892,
  dom_merkle_root: domRoot3,
  hash_lock_H: hashLockH3,
  base_l2_bond_contract: BASE_L2_BOND_CONTRACT,
  seller_recipient_wallet: SELLER_AGENTCASH_WALLET,
  ciphertext_C: encAlpha3
});

const secretKey4 = crypto.randomBytes(32).toString('hex');
const hashLockH4 = crypto.createHash('sha256').update(Buffer.from(secretKey4, 'hex')).digest('hex');
const secretAlpha4 = {
  sku: 'NVIDIA-RTX-5090-AIB-OC',
  provider_url: 'https://restock.example-hardware-direct.com/sku/rtx5090-oc',
  promo_code: 'RESTOCK-ALERT-HIST',
  reference_price_usd: 2799.00,
  observed_price_usd: 2379.15,
  ref_cents: 279900,
  obs_cents: 237915
};
const encAlpha4 = encryptSecretAlpha(secretAlpha4, secretKey4);
const domRoot4 = computeDomMerkleRoot([
  { selector: '.product-title', text: 'GeForce RTX 5090 Custom OC Edition' },
  { selector: '.checkout-price', text: '$2,379.15' }
]);
const dsseWitness4 = signDsse({
  witness_id: 'w_hw_rtx5090_hist_02',
  schema: 'pandaforge.qma2.spread_witness.v1',
  vertical: 'hardware_restock_arbitrage',
  claimed_spread_bps: 1500,
  observation_ts: Math.floor(Date.now() / 1000) - 980,
  free_reveal_after_ts: Math.floor(Date.now() / 1000) - 80,
  dom_merkle_root: domRoot4,
  hash_lock_H: hashLockH4,
  base_l2_bond_contract: BASE_L2_BOND_CONTRACT,
  seller_recipient_wallet: SELLER_AGENTCASH_WALLET,
  ciphertext_C: encAlpha4
});

const mockWitnessStore = new Map([
  [
    'w_live_h200_01',
    {
      id: 'w_live_h200_01',
      vertical: 'cloud_gpu_spot_arbitrage',
      status: 'LIVE_LOCKED_HTLC',
      claimed_spread_bps: 1649,
      dsse_envelope: dsseWitness1,
      secret_key_K: secretKey1,
      unlocked_alpha: secretAlpha1,
      age_sec: 10
    }
  ],
  [
    'w_hist_b200_00',
    {
      id: 'w_hist_b200_00',
      vertical: 'cloud_gpu_spot_arbitrage',
      status: 'FREE_PROOF_OF_ALPHA_EXPIRED_15M',
      claimed_spread_bps: 2100,
      dsse_envelope: dsseWitness2,
      secret_key_K: secretKey2,
      unlocked_alpha: secretAlpha2,
      age_sec: 960
    }
  ],
  [
    'w_hw_rtx5090_01',
    {
      id: 'w_hw_rtx5090_01',
      vertical: 'hardware_restock_arbitrage',
      status: 'LIVE_LOCKED_HTLC',
      claimed_spread_bps: 2000,
      dsse_envelope: dsseWitness3,
      secret_key_K: secretKey3,
      unlocked_alpha: secretAlpha3,
      age_sec: 8
    }
  ],
  [
    'w_hw_rtx5090_hist_02',
    {
      id: 'w_hw_rtx5090_hist_02',
      vertical: 'hardware_restock_arbitrage',
      status: 'FREE_PROOF_OF_ALPHA_EXPIRED_15M',
      claimed_spread_bps: 1500,
      dsse_envelope: dsseWitness4,
      secret_key_K: secretKey4,
      unlocked_alpha: secretAlpha4,
      age_sec: 980
    }
  ]
]);

let activeBondUsdc = 10;

function executeTool(name, args) {
  if (name === 'list_spread_witnesses') {
    const minSpread = args.min_spread_bps || 1400;
    const verticalFilter = args.vertical;
    const includeHistorical = args.include_historical_proof_of_alpha !== false;

    const list = [];
    for (const [id, w] of mockWitnessStore.entries()) {
      if (verticalFilter && w.vertical !== verticalFilter) continue;
      if (w.claimed_spread_bps < minSpread) continue;
      if (!includeHistorical && w.status === 'FREE_PROOF_OF_ALPHA_EXPIRED_15M') continue;

      list.push({
        witness_id: w.id,
        vertical: w.vertical,
        status: w.status,
        claimed_spread_bps: w.claimed_spread_bps,
        age_sec: w.age_sec,
        dsse_envelope: w.dsse_envelope,
        free_preimage_key_K: w.status === 'FREE_PROOF_OF_ALPHA_EXPIRED_15M' ? w.secret_key_K : null
      });
    }

    return {
      active_bond_usdc: activeBondUsdc,
      daily_emitted_count: 4,
      max_daily_cap: 200,
      allow_listed_domains: [
        'cloud.example-gpu-market.io',
        'restock.example-hardware-direct.com'
      ],
      witnesses: list
    };
  }

  if (name === 'unlock_witness_htlc') {
    const witness = mockWitnessStore.get(args.witness_id);
    if (!witness) {
      throw new Error(`Witness ${args.witness_id} not found`);
    }
    const paymentHeader = args.x402_payment_header || '';
    if (!paymentHeader.startsWith('Bearer x402_tx_') && !paymentHeader.startsWith('x402_proof_')) {
      throw new Error('Invalid x402 payment header');
    }

    const payloadRaw = Buffer.from(witness.dsse_envelope.payload, 'base64').toString('utf8');
    const parsedPayload = JSON.parse(payloadRaw);

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(witness.secret_key_K, 'hex'),
      Buffer.from(parsedPayload.ciphertext_C.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(parsedPayload.ciphertext_C.tag, 'hex'));
    let dec = decipher.update(parsedPayload.ciphertext_C.data, 'hex', 'utf8');
    dec += decipher.final('utf8');
    const decryptedAlpha = JSON.parse(dec);

    return {
      witness_id: witness.id,
      revealed_preimage_key_K: witness.secret_key_K,
      hash_lock_H: parsedPayload.hash_lock_H,
      settlement_status: 'PAID_REVEAL_COMPLETED',
      atomic_decrypted_alpha: decryptedAlpha
    };
  }

  if (name === 'submit_bond_slash_proof') {
    const dsse = args.dsse_envelope;
    const key = args.revealed_key_K;
    const payloadRaw = Buffer.from(dsse.payload, 'base64').toString('utf8');
    const parsedPayload = JSON.parse(payloadRaw);

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(key, 'hex'),
      Buffer.from(parsedPayload.ciphertext_C.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(parsedPayload.ciphertext_C.tag, 'hex'));
    let dec = decipher.update(parsedPayload.ciphertext_C.data, 'hex', 'utf8');
    dec += decipher.final('utf8');
    const alpha = JSON.parse(dec);

    const ref = alpha.ref_cents;
    const obs = alpha.obs_cents;
    const actualBps = Math.floor(((ref - obs) * 10000) / ref);
    const claimedBps = parsedPayload.claimed_spread_bps;

    if (actualBps < claimedBps) {
      activeBondUsdc = 0;
      return {
        slashed: true,
        actual_spread_bps: actualBps,
        claimed_spread_bps: claimedBps,
        awarded_slashed_bond_usdc: 10,
        slashed_to_recipient: args.buyer_wallet,
        reason: `FRAUD_DETECTED: actual ${actualBps} bps < claimed ${claimedBps} bps`
      };
    }

    return {
      slashed: false,
      actual_spread_bps: actualBps,
      claimed_spread_bps: claimedBps,
      remaining_bond_usdc: activeBondUsdc,
      reason: `Valid witness: actual ${actualBps} bps >= claimed ${claimedBps} bps`
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

function handleRpc(req) {
  if (req.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: req.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false }
        },
        serverInfo: SERVER_INFO
      }
    };
  }

  if (req.method === 'notifications/initialized') {
    return null;
  }

  if (req.method === 'ping') {
    return {
      jsonrpc: '2.0',
      id: req.id,
      result: {}
    };
  }

  if (req.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id: req.id,
      result: {
        tools: MCP_TOOLS
      }
    };
  }

  if (req.method === 'tools/call') {
    try {
      const out = executeTool(req.params.name, req.params.arguments || {});
      return {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(out)
            }
          ]
        }
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          isError: true,
          content: [
            {
              type: 'text',
              text: err.message
            }
          ]
        }
      };
    }
  }

  return {
    jsonrpc: '2.0',
    id: req.id,
    error: {
      code: -32601,
      message: `Method not found: ${req.method}`
    }
  };
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', line => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const req = JSON.parse(trimmed);
    const resp = handleRpc(req);
    if (resp !== null) {
      process.stdout.write(JSON.stringify(resp) + '\n');
    }
  } catch (err) {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error', data: err.message }
      }) + '\n'
    );
  }
});
