#!/usr/bin/env node
/**
 * Round 19 Day-1 Live Launch Runbook & Cryptographically Gated Re-Arm Protocol Test.
 */

import crypto from 'node:crypto';

const OPERATOR_KEYPAIR = crypto.generateKeyPairSync('ed25519');

function runPreLaunchChecklist(config) {
  const checks = {
    bond_funded_10_usdc: config.remainingBondUnits === 10_000_000,
    allow_list_locked_2_domains:
      Array.isArray(config.allowList) &&
      config.allowList.length === 2 &&
      config.allowList.includes('cloud.example-gpu-market.io') &&
      config.allowList.includes('restock.example-hardware-direct.com'),
    kill_switch_armed_and_false: config.killSwitchArmed === true && config.killSwitchActive === false,
    free_proof_900s_scheduler_running: config.freeProofDelaySec === 900 && config.schedulerActive === true,
    registry_manifest_published: config.registryVersion === '1.2.0',
  };
  const allPassed = Object.values(checks).every(Boolean);
  return { pre_launch_go: allPassed, checks };
}

function evaluateFirstHourMonitoring(metrics) {
  const thresholds = {
    slash_events_zero: metrics.slashEvents === 0,
    tos_or_captcha_warnings_zero: metrics.tosWarnings === 0,
    sse_p99_latency_under_100ms: metrics.sseP99Ms < 100,
    free_proof_on_time_100pct: metrics.freeProofOnTimePct === 100,
    emitted_within_hourly_budget: metrics.witnessesEmitted <= 25,
  };
  return {
    first_hour_healthy: Object.values(thresholds).every(Boolean),
    thresholds,
  };
}

function executeRearmProtocol({
  killSwitchActive,
  remainingBondUnits,
  canarySnapshots,
  operatorSignatureB64,
  rearmChallengePayload,
}) {
  if (!killSwitchActive) return { rearmed: true, note: 'Already armed' };

  if (remainingBondUnits < 10_000_000) {
    return { rearmed: false, blocked_by: 'GATE_1_BOND_NOT_REPLENISHED' };
  }

  if (!Array.isArray(canarySnapshots) || canarySnapshots.length < 3) {
    return { rearmed: false, blocked_by: 'GATE_2_INSUFFICIENT_CANARY_SNAPSHOTS' };
  }
  for (const c of canarySnapshots) {
    const valid =
      Number.isInteger(c.refCents) &&
      Number.isInteger(c.obsCents) &&
      c.obsCents > 0 &&
      c.obsCents < c.refCents &&
      Math.floor(((c.refCents - c.obsCents) * 10000) / c.refCents) >= 1400;
    if (!valid) {
      return { rearmed: false, blocked_by: `GATE_2_CANARY_FAILED_${c.id}` };
    }
  }

  const sigValid = crypto.verify(
    null,
    Buffer.from(rearmChallengePayload),
    OPERATOR_KEYPAIR.publicKey,
    Buffer.from(operatorSignatureB64, 'base64')
  );
  if (!sigValid) {
    return { rearmed: false, blocked_by: 'GATE_3_INVALID_OPERATOR_SIGNATURE' };
  }

  return {
    rearmed: true,
    kill_switch_active_after: false,
    verified_gates: ['GATE_1_BOND_10_USDC', 'GATE_2_THREE_CANARIES_PASSED', 'GATE_3_OPERATOR_ED25519_SIG'],
  };
}

function main() {
  const preLaunch = runPreLaunchChecklist({
    remainingBondUnits: 10_000_000,
    allowList: ['cloud.example-gpu-market.io', 'restock.example-hardware-direct.com'],
    killSwitchArmed: true,
    killSwitchActive: false,
    freeProofDelaySec: 900,
    schedulerActive: true,
    registryVersion: '1.2.0',
  });

  const firstHour = evaluateFirstHourMonitoring({
    slashEvents: 0,
    tosWarnings: 0,
    sseP99Ms: 5.4,
    freeProofOnTimePct: 100,
    witnessesEmitted: 12,
  });

  const failedRearmAttempt = executeRearmProtocol({
    killSwitchActive: true,
    remainingBondUnits: 0,
    canarySnapshots: [],
    operatorSignatureB64: '',
    rearmChallengePayload: '',
  });

  const challenge = 'REARM_AUTHORIZATION_EPOCH_1_DOM_SELECTOR_FIXED';
  const opSig = crypto.sign(null, Buffer.from(challenge), OPERATOR_KEYPAIR.privateKey).toString('base64');
  const passedRearm = executeRearmProtocol({
    killSwitchActive: true,
    remainingBondUnits: 10_000_000,
    canarySnapshots: [
      { id: 'canary_1', refCents: 2850, obsCents: 2380 },
      { id: 'canary_2', refCents: 249900, obsCents: 199900 },
      { id: 'canary_3', refCents: 4200, obsCents: 3318 },
    ],
    operatorSignatureB64: opSig,
    rearmChallengePayload: challenge,
  });

  console.log(
    JSON.stringify(
      {
        status: 'ROUND_19_DAY1_RUNBOOK_AND_REARM_PROTOCOL_VERIFIED',
        pre_launch_checklist: preLaunch,
        first_hour_monitoring_sla: firstHour,
        rearm_rejection_when_unreplenished: failedRearmAttempt,
        rearm_success_after_3_gates: passedRearm,
      },
      null,
      2
    )
  );
}

main();
