# @pandaforge/alpha-witness-mcp (v1.2.0)

> **QMA² Coordi-HierSupe Panda Production Launch Authorized (`Final Aggregate Heat: 5%`)**
> Co-designed and verified across **20 autonomous rounds** between **Antigravity CLI** and **Grok (`Model: Expert`)** via the **PandaForge MV3 Browser Bridge (`127.0.0.1:8787`)** and **SwarmScribe QMA² v2.1 (`Central Coordinator × Hierarchical Supervisor`)**.

---

## 1. Overview & Unfair Advantage

`@pandaforge/alpha-witness-mcp` turns a live, human-operated Chrome session with **PandaForge MV3** into a cryptographically verifiable **Live Intent & Spread Witness Oracle** for autonomous buyer agents:

- **Layer A — Passive PandaForge MV3 Observer**: Zero synthetic crawling. Captures DOM Merkle roots and pricing selectors strictly on human-visited, allow-listed cloud/commerce domains (`cloud_gpu_spot_arbitrage` & `hardware_restock_arbitrage`), stripping cookies and PII locally.
- **Layer B — Cryptographic DSSE Witness + HTLC Commitment**: Encrypts `(sku, provider_url, promo_code)` with `AES-256-GCM` under secret preimage key `K`, computes `hash_lock_H = SHA256(K)` and integer-cent `claimed_spread_bps`, and signs the public claim inside an `Ed25519` **DSSE (Dead Simple Signing Envelope)** (`56.2 ms` end-to-end).
- **Layer C — Three-Tier MCP & Priority SSE Feed**:
  - **Tier 1 (`0.25 USDC / witness`)**: Spot Pay-Per-Reveal (15s delayed public pool, `40×` bond coverage).
  - **Tier 2 (`4.50 USDC / hour`)**: Priority SSE Stream (`p50 = 2.765 ms`, `p99 = 5.408 ms`, 25 reveals/hr included).
  - **Tier 3 (`25.00 USDC / day`)**: Exclusive Syndicate Lock (atomic pool burn + HTTP `409` conflict rejection for competing bots + `50 USDC` equivocation-slashable SLA bond).
- **Layer D — Zero-CAC Acquisition ("Delayed Public Proof-of-Alpha") & Base L2 Slashed Bonds**:
  - Every witness automatically exposes its `free_preimage_key_K` **15 minutes (`900s`) after observation** so any skeptical buyer agent can cryptographically audit 100% of historical spreads before spending `0.25 USDC`.
  - Backed by `contracts/OptimisticWitnessBond.sol` on Base L2 (`chain_id: 8453`).
- **Layer E — Sub-Millisecond Auto-Kill-Switch & 3-Gate Operator Re-Arm Protocol**:
  - Trips `KILL_SWITCH_ACTIVE = true` in **`0.0275 ms`** on DOM selector drift (`NaN`/`0`) or bond reduction, capping downside exposure at `$10 USDC` against a projected **`$3,862/mo` steady-state net contribution (`99.0%` margin, `$6,620` 90-day net profit)**.

---

## 2. Quick Start & 5-Line Buyer Agent Snippet

### Install & Run
```bash
npx -y @pandaforge/alpha-witness-mcp
# Run full 7-suite verification & stress tests:
npm test
```

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
- `test/witness_settlement_mvp.mjs` — Round 8 End-to-End `56.2 ms` DSSE + AES-256-GCM + HTLC Benchmark.
- `test/live_vertical_harness.mjs` — Round 11 & 12 Multi-Vertical MCP Stdio Verification Harness.
- `test/tier2_sse_stress_test.mjs` — Round 15 Tier 2 Priority SSE Stream Benchmark (`p50: 2.765ms`, `p99: 5.408ms`).
- `test/tier3_exclusive_race_test.mjs` — Round 16 Tier 3 `Promise.all` Concurrency & `50 USDC` Equivocation Slash Verifier.
- `test/pnl_sensitivity_model.mjs` — Round 17 90-Day Solo-Operator P&L & Break-Even Sensitivity Model.
- `test/kill_switch_circuit_breaker_test.mjs` — Round 18 Auto-Kill-Switch Circuit Breaker (`0.0275ms` trip).
- `test/rearm_protocol_and_runbook_test.mjs` — Round 19 Day-1 Runbook & 3-Gate Ed25519 Re-Arm Protocol.
