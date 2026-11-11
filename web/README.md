# @pandaforge/alpha-witness-web

> **Zero-CAC Verifiable Spread Witness & Live Intent Arbitrage Operator Dashboard**
> Live Deployment: [https://oasis-pearl-beam-berry.grok.me/](https://oasis-pearl-beam-berry.grok.me/)

This is the interactive frontend operator console for **`@pandaforge/alpha-witness-mcp` (v1.2.0)**. Built with React 19, Tailwind CSS v4, and Zustand.

---

## Live Console Sections

1. **Witness Feed**:
   - Real-time observation table across GPU spot clusters (`H200`, `B200`) and hardware restocks (`RTX 5090`, `M4 Ultra`).
   - Dynamic 900s countdown timer per witness to free preimage publication.
   - Historical records with cryptographic `PROOF-OF-ALPHA` and Merkle fragment inspectability.

2. **x402 Micro-Settlement Simulator**:
   - **Tier 1 ($0.25)**: Spot reveal unlocking encrypted SKU and provider checkout URL.
   - **Tier 2 ($4.50/hr)**: SSE priority quota stream emulator (25 reveals/hr).
   - **Tier 3 ($25.00)**: Exclusive pool burn that locks and removes the witness from circulation, returning HTTP 403 on subsequent queries.

3. **Tier 4 Threshold Syndicate Co-Buy**:
   - 3-buyer interactive stake sliders.
   - Decrypts and unlocks wholesale allocation payload only when the pool reaches 100% threshold funding.
   - Automatic refund simulation if funding expires under timeout.

4. **Integer-Cent Slash Verifier**:
   - Direct execution of the integer-cent predicate against the Base L2 `10 USDC` bond.
   - Asserts zero-slash integrity for compliant claims (e.g. 1649 bps test canary).
   - Immediately zeroes the bond and trips the kill-switch if a false claim is injected.

5. **Governance & Circuit Breaker**:
   - Displays enforcement of the 2-domain allow-list (`cloud.example-gpu-market.io`, `restock.example-hardware-direct.com`).
   - Daily cap meters (200 emissions/day, $\le 5$ buyer agents).
   - Manual 3-gate Ed25519 re-arm flow (10 USDC replenishment + operator digital signature confirmation).

---

## Running Locally

```bash
cd web
npm install
npm run dev
```
