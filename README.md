# @pandaforge/alpha-witness-mcp

Zero-CAC Verifiable Spread Witness & Live Intent Arbitrage Model Context Protocol (MCP) Server.

## Features
- **DSSE Envelopes**: In-toto compliant Ed25519 signatures over canonical JSON witness payloads.
- **x402 Base L2 Escrow & AgentCash**: Native micropayment rail with instant HTLC key release.
- **10 USDC Optimistic Slashed Bond**: Deterministic integer-cent fraud verification with on-chain slashing guarantee.
- **15-Minute Free Proof-of-Alpha**: Free delayed key release for verifiable track record.
- **Auto Kill-Switch & Arming Runbook**: Schema drift and slash triggers trip circuit breakers in under 5 seconds.
- **Tier 4 Threshold Co-Buying Prototype**: Multi-party encrypted dark pool pooling with atomic release upon threshold satisfaction.

## Quickstart

Run via npx:
```bash
npx @pandaforge/alpha-witness-mcp
```

Or run directly from source:
```bash
npm start
```

## Running Tests
Run all 8 test suites:
```bash
npm test
```
Or run individual suites:
- `npm run test:mvp`: Core DSSE signing, AES-256-GCM encryption, x402 payment header, atomic key reveal.
- `npm run test:verticals`: Multi-vertical scaling (GPU Spot + Hardware Restock), integer-cent fraud verifier.
- `npm run test:tier2-sse`: 500 witness/day SSE streaming benchmark with <100ms latency SLA & hourly pass.
- `npm run test:tier3-race`: Syndicate exclusive concurrency race, 409 Conflict locks, and equivocation slash.
- `npm run test:pnl`: 90-day solo-operator financial projection and break-even sensitivity analysis.
- `npm run test:kill-switch`: Automated circuit breaker trip on schema drift or bond slash within 5s SLA.
- `npm run test:runbook`: Day-1 pre-launch checklist, hourly monitoring SLA, and 3-gate rearm protocol.
- `npm run test:tier4`: Multi-buyer threshold co-buying and underfill timeout refund protocol.
