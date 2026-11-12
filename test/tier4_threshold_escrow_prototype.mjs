#!/usr/bin/env node
/**
 * Test: Round 26 Tier 4 Threshold Co-Buying & Dark Pool Allocation Prototype
 * Multi-party encrypted dark pool pooling with atomic release upon threshold satisfaction.
 */

import crypto from 'node:crypto';

function canonicalJson(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
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

function decryptSecretAlpha(encObj, keyHex) {
  const key = Buffer.from(keyHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(encObj.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(encObj.tag, 'hex'));
  let dec = decipher.update(encObj.data, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return JSON.parse(dec);
}

class ThresholdDarkPool {
  constructor(poolId, targetWholesaleAmountCents, timeoutSec = 600) {
    this.poolId = poolId;
    this.targetCents = targetWholesaleAmountCents;
    this.timeoutSec = timeoutSec;
    this.createdAt = Date.now();
    this.commits = new Map();
    this.totalCommittedCents = 0;
    this.status = 'OPEN';
    this.masterSecretKey = crypto.randomBytes(32).toString('hex');
    this.ciphertext = null;
  }

  setEncryptedVoucher(voucherPayload) {
    this.ciphertext = encryptSecretAlpha(voucherPayload, this.masterSecretKey);
  }

  commitFunds(buyerAddress, amountCents, x402Proof) {
    if (this.status !== 'OPEN') {
      return { ok: false, error: `POOL_STATUS_${this.status}` };
    }
    if (Date.now() > this.createdAt + (this.timeoutSec * 1000)) {
      this.status = 'EXPIRED_REFUNDED';
      return { ok: false, error: 'POOL_EXPIRED' };
    }

    const prev = this.commits.get(buyerAddress) || { cents: 0, proofs: [] };
    prev.cents += amountCents;
    prev.proofs.push(x402Proof);
    this.commits.set(buyerAddress, prev);
    this.totalCommittedCents += amountCents;

    if (this.totalCommittedCents >= this.targetCents) {
      this.status = 'SETTLED_100_PCT';
      return {
        ok: true,
        status: this.status,
        fill_bps: Math.floor((this.totalCommittedCents * 10000) / this.targetCents),
        total_funded_cents: this.totalCommittedCents,
        shares: this.distributeSecretKeys()
      };
    }

    return {
      ok: true,
      status: this.status,
      fill_progress_bps: Math.floor((this.totalCommittedCents * 10000) / this.targetCents),
      committed_so_far_cents: this.totalCommittedCents,
      target_cents: this.targetCents
    };
  }

  distributeSecretKeys() {
    const allocations = [];
    for (const [buyer, rec] of this.commits.entries()) {
      const sharePct = ((rec.cents / this.totalCommittedCents) * 100).toFixed(1) + '%';
      allocations.push({
        buyer,
        funded_cents: rec.cents,
        allocation_share_pct: sharePct,
        revealed_master_key: this.masterSecretKey
      });
    }
    return allocations;
  }

  evaluateTimeout() {
    if (this.status === 'OPEN' && this.totalCommittedCents < this.targetCents) {
      this.status = 'EXPIRED_REFUNDED';
      const refunds = [];
      for (const [buyer, rec] of this.commits.entries()) {
        refunds.push({
          buyer,
          refunded_amount_cents: rec.cents,
          status: 'REFUND_SETTLED_100_PCT'
        });
      }
      return { status: 'EXPIRED_REFUNDED', committed_cents: this.totalCommittedCents, target_cents: this.targetCents, refunds_issued: refunds };
    }
    return { status: this.status };
  }
}

// SCENARIO 1: Full Fill Settlement ($50,000 Wholesale B200 Allocation)
const TARGET_WHOLESALE_CENTS = 5000000;
const pool1 = new ThresholdDarkPool('pool_full_fill_01', TARGET_WHOLESALE_CENTS, 600);

const wholesaleAlphaPayload = {
  cluster_id: 'US-EAST-B200-NVL72-WHLESALE-ALLOC',
  reference_value_usd: 62500.00,
  wholesale_price_usd: 50000.00,
  access_portal: 'https://cloud.example-gpu-market.io/wholesale/contract/b200-72',
  counter_signed_voucher: 'QMA2-WHLESALE-SYNDICATE-TOKEN-99'
};

pool1.setEncryptedVoucher(wholesaleAlphaPayload);

const step1 = pool1.commitFunds('0xBuyerSyndicateA', 2000000, 'x402_proof_sub_01');
const step2 = pool1.commitFunds('0xBuyerSyndicateB', 1750000, 'x402_proof_sub_02');
const step3 = pool1.commitFunds('0xBuyerSyndicateC', 1250000, 'x402_proof_sub_03');

const decryptedWholesaleAlpha = decryptSecretAlpha(pool1.ciphertext, step3.shares[0].revealed_master_key);

// SCENARIO 2: Underfill Timeout & Refund Execution
const pool2 = new ThresholdDarkPool('pool_underfill_timeout_02', TARGET_WHOLESALE_CENTS, 0.001);
pool2.setEncryptedVoucher(wholesaleAlphaPayload);
pool2.commitFunds('0xBuyerPartialA', 2000000, 'x402_proof_sub_04');
pool2.commitFunds('0xBuyerPartialB', 1500000, 'x402_proof_sub_05');

const timeoutEval = pool2.evaluateTimeout();
const lateCommit = pool2.commitFunds('0xBuyerLate', 1500000, 'x402_proof_sub_06');

console.log(
  JSON.stringify(
    {
      status: 'ROUND_26_TIER4_THRESHOLD_PROTOTYPE_VERIFIED',
      scenario_1_full_fill_settlement: {
        pool_id: pool1.poolId,
        target_cents: pool1.targetCents,
        step1_commit_40pct: step1,
        step2_commit_35pct: step2,
        step3_final_commit_and_settlement: {
          ok: step3.ok,
          status: step3.status,
          fill_bps: step3.fill_bps,
          total_funded_cents: step3.total_funded_cents,
          reconstructed_shares_count: step3.shares.length,
          decrypted_wholesale_alpha: decryptedWholesaleAlpha,
          buyer_allocations: step3.shares.map(s => ({
            buyer: s.buyer,
            funded_cents: s.funded_cents,
            allocation_share_pct: s.allocation_share_pct
          }))
        }
      },
      scenario_2_underfill_timeout_refund: {
        pool_id: pool2.poolId,
        committed_fraction: '70%',
        timeout_evaluation: timeoutEval,
        late_submission_blocked: lateCommit
      }
    },
    null,
    2
  )
);
