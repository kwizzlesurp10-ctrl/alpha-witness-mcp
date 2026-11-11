# @pandaforge/alpha-witness-mcp (v1.2.0)

> **QMA² Coordi-HierSupe Panda Production Launch Authorized (`Final Aggregate Heat: 5%`)**
> Co-designed and verified across **20 autonomous rounds** between **Antigravity CLI** and **Grok (`Model: Expert`)** via the **PandaForge MV3 Browser Bridge (`127.0.0.1:8787`)** and **SwarmScribe QMA² v2.1 (`Central Coordinator × Hierarchical Supervisor`)**.

> 🌐 **Live Web Operator Console**: [https://oasis-pearl-beam-berry.grok.me/](https://oasis-pearl-beam-berry.grok.me/)  
> Dark-phosphor reactive dashboard built with Grok Build and deployed live. Real-time DSSE commitments, 900s free Proof-of-Alpha countdowns, x402 Tier 1-3 reveals, Tier 4 syndicate threshold co-buy, 10 USDC slash verifier, and manual 3-gate circuit breaker controls.

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

### Operator Wallet Configuration (AgentCash Native)
The server automatically resolves the seller/operator recipient address for all incoming `x402` Base L2 micro-settlements (Tier 1–3) and bond payouts in this order:
1. `process.env.OPERATOR_WALLET_ADDRESS` (custom override)
2. Native **AgentCash** wallet: `~/.agentcash/wallet.json` (`address: 0xb22f7390Dba812809AFe81dB84Df6f5014Ef93F5`)
3. Static fallback: `0xb22f7390Dba812809AFe81dB84Df6f5014Ef93F5`

### 5-Line External Buyer Agent Usage
```javascript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "buyer-arb-bot", version: "1.0.0" }, { capabilities: {} });
await client.connect(new StdioClientTransport({ command: "npx", args: ["-y", "@pandaforge/alpha-witness-mcp"] }));

// 1. List active verified witnesses (filtering for spread >= 1400 bps)
const { witnesses } = await client.callTool({ name: "list_spread_witnesses", arguments: { min_spread_bps: 1400 } });

// 2. Settle x402 payment & instantly unlock decrypt key K (Tier 1: 0.25 USDC)
const unlocked = await client.callTool({
  name: "unlock_witness_htlc",
  arguments: { witness_id: witnesses[0].witness_id, x402_payment_header: "x402-tx-hash-base-l2", tier: 1 }
});
console.log("Decrypted Alpha:", unlocked.decrypted_payload);
```

---

## 3. Production Repository Layout

```
.
├── contracts/
│   └── OptimisticWitnessBond.sol    # Base L2 10 USDC integer-cent slashable bond
├── src/
│   └── pandaforge_alpha_mcp_server.mjs # Production MCP Server (JSON-RPC 2.0 stdio)
├── web/                             # Live Web Operator Console (React + Tailwind)
│   ├── src/components/oracle/Console.tsx
│   ├── src/lib/oracle-store.ts
│   └── package.json
├── test/
│   ├── witness_settlement_mvp.mjs   # Round 8 56.2ms DSSE + AES-256-GCM + HTLC benchmark
│   ├── live_vertical_harness.mjs    # Round 11-12 Multi-vertical stdio verification
│   ├── tier2_sse_stress_test.mjs    # Round 15 Tier 2 SSE stream stress test (p99: 5.4ms)
│   ├── tier3_exclusive_race_test.mjs# Round 16 Tier 3 race condition & 50 USDC equivocation slash
│   ├── pnl_sensitivity_model.mjs    # Round 17 90-day solo-operator P&L sensitivity model
│   ├── kill_switch_circuit_breaker_test.mjs # Round 18 sub-ms auto-kill-switch
│   └── rearm_protocol_and_runbook_test.mjs  # Round 19 3-gate Ed25519 re-arm runbook
├── mcp_registry_manifest.json       # MCP & x402 discovery manifest
└── package.json                     # v1.2.0 release definition
```

---

## 8. Web Operator Console

The interactive web console is maintained in [`web/`](./web) and deployed live at [https://oasis-pearl-beam-berry.grok.me/](https://oasis-pearl-beam-berry.grok.me/).

- **Witness Feed**: Real-time DSSE commitments across GPU spot and hardware restocks with 900s countdown timers.
- **x402 Tiers**: Instant Tier 1 reveal ($0.25), Tier 2 quota stream ($4.50/hr), and Tier 3 atomic burn ($25.00).
- **Tier 4 Co-Buy**: Syndicate slider threshold settlement (unlocks wholesale payload only upon 100% fill).
- **Slash Verifier**: Integer-cent predicate test against the Base L2 10 USDC bond.
- **Governance Rails**: 2-domain allow-list, 200/day limit, 5-agent cap, and 3-gate Ed25519 re-arm controls.
