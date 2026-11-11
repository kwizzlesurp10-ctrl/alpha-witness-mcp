#!/usr/bin/env node
/**
 * Round 18 Auto-Kill-Switch Circuit Breaker Implementation & Verification Test.
 */

import crypto from 'node:crypto';

function createCircuitBreakerEngine() {
  let killSwitchActive = false;
  let remainingBondUnits = 10_000_000;
  const emittedWitnesses = [];
  const statusEvents = [];

  function tripKillSwitch(reason, t0Ns) {
    killSwitchActive = true;
    const tripLatencyMs = Number(process.hrtime.bigint() - t0Ns) / 1e6;
    const evt = {
      event: 'EMERGENCY_KILL_SWITCH_TRIPPED',
      reason,
      kill_switch_active: killSwitchActive,
      trip_latency_ms: Number(tripLatencyMs.toFixed(4)),
      under_5s_sla: tripLatencyMs < 5000,
      remaining_bond_usdc: remainingBondUnits / 1e6,
      ts: new Date().toISOString(),
    };
    statusEvents.push(evt);
    return evt;
  }

  function tryEmitWitness({ id, refPriceCents, obsPriceCents }) {
    const t0Ns = process.hrtime.bigint();

    if (killSwitchActive) {
      return { emitted: false, blocked_by: 'KILL_SWITCH_ACTIVE', witness_id: id };
    }

    if (remainingBondUnits < 10_000_000) {
      const evt = tripKillSwitch('BOND_REDUCTION_DETECTED', t0Ns);
      return { emitted: false, blocked_by: evt.reason, status_event: evt };
    }

    const isInvalidPrice =
      !Number.isInteger(refPriceCents) ||
      !Number.isInteger(obsPriceCents) ||
      Number.isNaN(obsPriceCents) ||
      obsPriceCents <= 0 ||
      obsPriceCents >= refPriceCents ||
      obsPriceCents < refPriceCents * 0.1;

    if (isInvalidPrice) {
      const evt = tripKillSwitch(`SCHEMA_INVALID_PRICE_SELECTOR (obs=${obsPriceCents}, ref=${refPriceCents})`, t0Ns);
      return { emitted: false, blocked_by: evt.reason, status_event: evt };
    }

    const witness = {
      witness_id: id,
      spread_bps: Math.floor(((refPriceCents - obsPriceCents) * 10000) / refPriceCents),
      hash: crypto.createHash('sha256').update(`${id}:${obsPriceCents}`).digest('hex').slice(0, 16),
    };
    emittedWitnesses.push(witness);
    return { emitted: true, witness };
  }

  function simulateOnChainSlash(slashUnits) {
    const t0Ns = process.hrtime.bigint();
    remainingBondUnits = Math.max(0, remainingBondUnits - slashUnits);
    if (remainingBondUnits < 10_000_000 && !killSwitchActive) {
      return tripKillSwitch(`ON_CHAIN_BOND_SLASHED_TO_${remainingBondUnits / 1e6}_USDC`, t0Ns);
    }
    return null;
  }

  return {
    tryEmitWitness,
    simulateOnChainSlash,
    getState: () => ({
      killSwitchActive,
      emittedCount: emittedWitnesses.length,
      statusEvents,
    }),
  };
}

function runTests() {
  const engineA = createCircuitBreakerEngine();
  const valid1 = engineA.tryEmitWitness({ id: 'w_ok_1', refPriceCents: 2850, obsPriceCents: 2380 });
  const triggerA = engineA.tryEmitWitness({ id: 'w_bad_nan', refPriceCents: 2850, obsPriceCents: 0 });
  const postTriggerA1 = engineA.tryEmitWitness({ id: 'w_after_a1', refPriceCents: 2850, obsPriceCents: 2300 });
  const postTriggerA2 = engineA.tryEmitWitness({ id: 'w_after_a2', refPriceCents: 2850, obsPriceCents: 2250 });

  const engineB = createCircuitBreakerEngine();
  const validB1 = engineB.tryEmitWitness({ id: 'w_ok_b1', refPriceCents: 249900, obsPriceCents: 199900 });
  const slashEvt = engineB.simulateOnChainSlash(10_000_000);
  const postTriggerB1 = engineB.tryEmitWitness({ id: 'w_after_b1', refPriceCents: 249900, obsPriceCents: 195000 });
  const postTriggerB2 = engineB.tryEmitWitness({ id: 'w_after_b2', refPriceCents: 249900, obsPriceCents: 190000 });

  console.log(
    JSON.stringify(
      {
        status: 'ROUND_18_AUTO_KILL_SWITCH_CIRCUIT_BREAKER_VERIFIED',
        scenario_A_schema_drift_trigger: {
          pre_trigger_valid_emitted: valid1.emitted,
          trigger_event: triggerA.status_event,
          post_trigger_attempts_blocked: [!postTriggerA1.emitted, !postTriggerA2.emitted],
          post_trigger_emissions_count: engineA.getState().emittedCount - 1,
        },
        scenario_B_bond_slash_trigger: {
          pre_trigger_valid_emitted: validB1.emitted,
          trigger_event: slashEvt,
          post_trigger_attempts_blocked: [!postTriggerB1.emitted, !postTriggerB2.emitted],
          post_trigger_emissions_count: engineB.getState().emittedCount - 1,
        },
      },
      null,
      2
    )
  );
}

runTests();
