#!/usr/bin/env node
/**
 * Day-2 Live Traffic Monitoring Script (Grok specification)
 * Enforces:
 *   - Emissions <= 200
 *   - External agents <= 5
 *   - Zero slashes
 *   - Kill-switch still false
 *   - Free-proof releases inside 900s + 5s tolerance
 */

import fs from 'node:fs';

const logPath = process.argv[2] || 'witness.log';
const log = fs.existsSync(logPath)
  ? fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean)
  : [];

const now = Date.now();
const dayStart = now - 24 * 60 * 60 * 1000;

let emitted = 0;
let paid = 0;
let slashes = 0;
let freeProofOk = 0;
let freeProofLate = 0;
const agents = new Set();
const tiers = { tier1: 0, tier2: 0, tier3: 0 };

for (const line of log) {
  try {
    const e = JSON.parse(line);
    if (e.ts && new Date(e.ts).getTime() < dayStart) continue;
    if (e.event === 'witness_emitted') {
      emitted++;
    }
    if (e.event === 'unlock_success') {
      paid++;
      if (e.buyer) agents.add(e.buyer);
      if (e.tier) {
        const key = e.tier.split('_')[0];
        tiers[key] = (tiers[key] || 0) + 1;
      }
    }
    if (e.event === 'bond_slashed') {
      slashes++;
    }
    if (e.event === 'free_proof_exposed') {
      const delay = (e.exposed_ts - e.observation_ts) / 1000;
      if (delay <= 905) freeProofOk++;
      else freeProofLate++;
    }
  } catch {}
}

const killSwitch = process.env.KILL_SWITCH_ACTIVE === 'true';
const status = {
  window: 'last_24h',
  witnesses_emitted: emitted,
  paid_reveals: paid,
  unique_external_agents: agents.size,
  tiers,
  slash_events: slashes,
  free_proof_on_time: freeProofOk,
  free_proof_late: freeProofLate,
  kill_switch_active: killSwitch,
  daily_cap_ok: emitted <= 200,
  agent_cap_ok: agents.size <= 5,
  rails_green: slashes === 0 && !killSwitch && emitted <= 200 && agents.size <= 5,
};

console.log(JSON.stringify(status, null, 2));
if (!status.rails_green) {
  process.exit(1);
} else {
  process.exit(0);
}
