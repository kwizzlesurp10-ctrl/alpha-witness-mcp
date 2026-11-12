#!/usr/bin/env node
/**
 * @pandaforge/alpha-witness-mcp Server v1.3.0
 * Zero-CAC Verifiable Spread Witness & Live Intent Arbitrage Model Context Protocol Server.
 * 100% Production-Grade: Zero Mocks, Live GPU Spot Ingestion, EIP-3009/x402 Settlement & Real On-Chain Bond.
 */

import readline from 'node:readline';
import { initKeystore } from './keystore.mjs';
import { LiveWitnessStore } from './live_feed.mjs';
import { processWitnessSettlement, generatePaymentRequired } from './x402_settlement.mjs';
import { fetchOnchainUsdcBalance, getActiveBondBalance, verifyAndAdjudicateSlash } from './onchain_bond.mjs';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = {
  name: 'pandaforge-alpha-witness-mcp',
  version: '1.3.0'
};

// Initialize Persistent Keystore
const { keyId } = initKeystore();

// Initialize Live Store
const store = new LiveWitnessStore({ maxDailyCap: 200 });
await store.hydrateLiveStore();

// Hydrate Initial On-Chain Balance
await fetchOnchainUsdcBalance();

const MCP_TOOLS = [
  {
    name: 'list_spread_witnesses',
    description: 'List DSSE-signed live and historical spread witnesses across verticals with micro-USD precision.',
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
    description: 'Verify x402 Base L2 USDC payment header (EIP-3009 or tx_hash) and atomically reveal preimage_key_K.',
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
    description: 'Submit a deterministic micro-USD/integer-cent fraud proof to verify or slash the on-chain bond.',
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

async function executeTool(name, args) {
  if (name === 'list_spread_witnesses') {
    const minSpread = args.min_spread_bps || 1400;
    const verticalFilter = args.vertical;
    const includeHistorical = args.include_historical_proof_of_alpha !== false;

    // Refresh live store if needed
    if (store.witnesses.size === 0) {
      await store.hydrateLiveStore();
    }

    const list = [];
    for (const [id, w] of store.witnesses.entries()) {
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
      active_bond_usdc: getActiveBondBalance(),
      daily_emitted_count: store.dailyEmittedCount,
      max_daily_cap: store.maxDailyCap,
      allow_listed_domains: store.allowListedDomains,
      keyid: keyId,
      witnesses: list
    };
  }

  if (name === 'unlock_witness_htlc') {
    const witness = store.witnesses.get(args.witness_id);
    return await processWitnessSettlement(witness, args.x402_payment_header, args.tier);
  }

  if (name === 'submit_bond_slash_proof') {
    return verifyAndAdjudicateSlash(args.dsse_envelope, args.revealed_key_K, args.buyer_wallet);
  }

  throw new Error(`Unknown tool: ${name}`);
}

async function handleRpc(req) {
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
      const out = await executeTool(req.params.name, req.params.arguments || {});
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

rl.on('line', async line => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const req = JSON.parse(trimmed);
    const resp = await handleRpc(req);
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
