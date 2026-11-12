# @pandaforge/alpha-witness-mcp

> **Zero-CAC Verifiable Spread Witness & Live Intent Arbitrage MCP Server**
> Production Multi-Vertical Stdio JSON-RPC 2.0 Server (`v1.3.0`) featuring Live Vast.ai GPU Spot Feed Ingestion, Persistent Ed25519 Keystore, EIP-3009 / `x402` Exact Micropayments, 15-minute Delayed Public Proof-of-Alpha, and Real On-Chain Base L2 Bond Accounting.

---

## 1. Overview

`@pandaforge/alpha-witness-mcp` connects automated buyer agents (Claude Desktop, AgentCash, Cursor, OpenClaw) directly to real-time arbitrage spreads across two operational verticals:
1. `cloud_gpu_spot_arbitrage`: H200 / B200 spot price dislocations against reference market pricing.
2. `hardware_restock_arbitrage`: Founder-edition and workstation hardware inventory restocks (e.g. RTX 5090 FE, Apple M4 Ultra).

---

## 2. Quickstart

### Install & Run
```bash
npx -y @pandaforge/alpha-witness-mcp
# Run full 8-suite verification & stress tests:
npm test
```

### Operator Wallet Configuration (AgentCash Native)
The server automatically resolves the seller/operator recipient address for all incoming `x402` Base L2 micro-settlements (Tier 1–3) and bond payouts in this order:
1. `process.env.OPERATOR_WALLET_ADDRESS` (custom override)
2. Native **AgentCash** wallet: `~/.agentcash/wallet.json` (`address: 0xb22f7390Dba812809AFe81dB84Df6f5014Ef93F5`)
3. Static fallback: `0xb22f7390Dba812809AFe81dB84Df6f5014Ef93F5`

### 5-Line External Buyer Agent Usage
```javascript
const { witnesses } = await mcp.callTool('list_spread_witnesses', { min_spread_bps: 1500 });
const target = witnesses.find(w => w.status === 'LIVE_LOCKED_HTLC');
const x402Token = await wallet.lockHtlcUsdc({ amount: '0.25', hashLock: target.hash_lock_H });
const reveal = await mcp.callTool('unlock_witness_htlc', { witness_id: target.witness_id, x402_payment_header: x402Token, tier: 'tier1_spot_0.25' });
await mcp.callTool('submit_bond_slash_proof', { dsse_envelope: target.dsse_envelope, revealed_key_K: reveal.revealed_key_K, buyer_wallet: wallet.address });
```

---

## 3. Repository Structure

- `src/pandaforge_alpha_mcp_server.mjs` — Production Multi-Vertical JSON-RPC 2.0 MCP Server (`v1.2.0`).
- `mcp_registry_manifest.json` — Official MCP & `x402` Registry Manifest + Days 1–7 Governance Rails.
- `contracts/OptimisticWitnessBond.sol` — Base L2 `10 USDC` Integer-Cent Slashable Bond Contract (`Solidity ^0.8.24`).
- `test/witness_settlement_mvp.mjs` — Round 8 End-to-End DSSE + AES-256-GCM + HTLC Benchmark.
- `test/live_vertical_harness.mjs` — Round 11 & 12 Multi-Vertical MCP Stdio Verification Harness.
- `test/tier2_sse_stress_test.mjs` — Round 15 Tier 2 Priority SSE Stream Benchmark (`p50: 2.765ms`, `p99: 5.408ms`).
- `test/tier3_exclusive_race_test.mjs` — Round 16 Tier 3 `Promise.all` Concurrency & `50 USDC` Equivocation Slash Verifier.
- `test/pnl_sensitivity_model.mjs` — Round 17 90-Day Solo-Operator Financial Projection & Break-Even Sensitivity Model.
- `test/kill_switch_circuit_breaker_test.mjs` — Round 18 Auto Kill-Switch Circuit Breaker Integration Test (`<5s` SLA).
- `test/rearm_protocol_and_runbook_test.mjs` — Round 19 Operator Runbook, Hourly SLAs, and 3-Gate Rearm Protocol Test.
- `test/tier4_threshold_escrow_prototype.mjs` — Round 26 Tier 4 Threshold Co-Buying & Dark Pool Allocation Prototype.

---

## 4. MCP Tools Reference

### `list_spread_witnesses`
Returns in-toto Ed25519 DSSE-signed spread witnesses across enabled verticals (`cloud_gpu_spot_arbitrage`, `hardware_restock_arbitrage`).
```json
{
  "name": "list_spread_witnesses",
  "arguments": {
    "vertical": "cloud_gpu_spot_arbitrage",
    "min_spread_bps": 1400,
    "include_historical_proof_of_alpha": true
  }
}
```

### `unlock_witness_htlc`
Verifies payment header and atomically reveals preimage key `K`.
```json
{
  "name": "unlock_witness_htlc",
  "arguments": {
    "witness_id": "w_live_h200_01",
    "x402_payment_header": "Bearer x402_tx_base_l2_micropay_0x0003",
    "tier": "tier1_spot_0.25"
  }
}
```

### `submit_bond_slash_proof`
Submits deterministic integer-cent fraud proof to slash 10 USDC bond.
```json
{
  "name": "submit_bond_slash_proof",
  "arguments": {
    "dsse_envelope": { ... },
    "revealed_key_K": "...",
    "buyer_wallet": "0xBuyerWallet"
  }
}
```
