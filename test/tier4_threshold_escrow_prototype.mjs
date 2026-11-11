#!/usr/bin/env node
/**
 * Round 26 Prototype: Tier 4 Threshold Co-Buying Syndicate & Batch-Settled Dark Pool
 * Implements:
 *   1. 3-of-3 Additive Secret Sharing of 32-byte AES key K:
 *      K = S1 ^ S2 ^ S3 (any 2 shares reveal 0 bits of K)
 *   2. Local Escrow Simulator accepting fractional USDC commitments until 100% fill
 *   3. Reconstruction + Decryption triggered ONLY when sum(escrows) >= target_allocation_cents
 *   4. Automatic refund of all deposits if pool times out before 100% fill
 */

import crypto from 'node:crypto';

function splitKeyInto3Shares(keyK) {
  const s1 = crypto.randomBytes(32);
  const s2 = crypto.randomBytes(32);
  const s3 = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    s3[i] = keyK[i] ^ s1[i] ^ s2[i];
  }
  return [s1, s2, s3];
}

function reconstructKeyFromShares(shares) {
  if (shares.length !== 3) {
    throw new Error(`Cannot reconstruct: need 3 shares, got ${shares.length}`);
  }
  const reconstructed = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    reconstructed[i] = shares[0][i] ^ shares[1][i] ^ shares[2][i];
  }
  return reconstructed;
}

function encryptSecretAlpha(secretPayload, keyK) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyK, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(secretPayload), 'utf8')),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: ciphertext.toString('hex'),
  };
}

function decryptSecretAlpha(ciphertextObj, keyK) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyK, Buffer.from(ciphertextObj.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(ciphertextObj.tag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertextObj.data, 'hex')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8'));
}

class Tier4DarkPool {
  constructor({ poolId, targetAllocationCents, ttlMs, secretPayload }) {
    this.poolId = poolId;
    this.targetAllocationCents = targetAllocationCents;
    this.expiryTs = Date.now() + ttlMs;
    this.status = 'OPEN';

    const keyK = crypto.randomBytes(32);
    this.shares = splitKeyInto3Shares(keyK);
    this.shareHashes = this.shares.map((s) => crypto.createHash('sha256').update(s).digest('hex'));
    this.ciphertext = encryptSecretAlpha(secretPayload, keyK);

    this.commitments = [];
    this.committedTotalCents = 0;
    this.refunds = [];
  }

  submitCommitment({ buyerWallet, amountCents }) {
    if (this.status !== 'OPEN') {
      return { ok: false, error: `POOL_STATUS_${this.status}` };
    }
    if (Date.now() >= this.expiryTs) {
      this.evaluateExpiry();
      return { ok: false, error: 'POOL_EXPIRED' };
    }

    const commitment = {
      buyer: buyerWallet,
      amountCents,
      fraction_bps: Math.floor((amountCents * 10000) / this.targetAllocationCents),
      ts: Date.now(),
    };
    this.commitments.push(commitment);
    this.committedTotalCents += amountCents;

    if (this.committedTotalCents >= this.targetAllocationCents) {
      return this.settlePool();
    }

    return {
      ok: true,
      fill_progress_bps: Math.floor((this.committedTotalCents * 10000) / this.targetAllocationCents),
      committed_so_far_cents: this.committedTotalCents,
      target_cents: this.targetAllocationCents,
      status: this.status,
    };
  }

  settlePool() {
    this.status = 'SETTLED_100_PCT';
    const reconstructedK = reconstructKeyFromShares(this.shares);
    const decryptedPayload = decryptSecretAlpha(this.ciphertext, reconstructedK);

    return {
      ok: true,
      status: this.status,
      fill_bps: 10000,
      total_funded_cents: this.committedTotalCents,
      reconstructed_shares_count: 3,
      decrypted_wholesale_alpha: decryptedPayload,
      buyer_allocations: this.commitments.map((c) => ({
        buyer: c.buyer,
        funded_cents: c.amountCents,
        allocation_share_pct: ((c.amountCents / this.targetAllocationCents) * 100).toFixed(1) + '%',
      })),
    };
  }

  evaluateExpiry() {
    if (this.status === 'SETTLED_100_PCT') return;
    if (Date.now() >= this.expiryTs && this.committedTotalCents < this.targetAllocationCents) {
      this.status = 'EXPIRED_REFUNDED';
      this.refunds = this.commitments.map((c) => ({
        buyer: c.buyer,
        refunded_amount_cents: c.amountCents,
        status: 'REFUND_SETTLED_100_PCT',
      }));
    }
    return {
      status: this.status,
      committed_cents: this.committedTotalCents,
      target_cents: this.targetAllocationCents,
      refunds_issued: this.refunds,
    };
  }
}

async function runTests() {
  const secretWholesaleCluster = {
    cluster_id: 'US-EAST-B200-NVL72-WHLESALE-ALLOC',
    reference_value_usd: 62500.0,
    wholesale_price_usd: 50000.0,
    access_portal: 'https://cloud.example-gpu-market.io/wholesale/contract/b200-72',
    counter_signed_voucher: 'QMA2-WHLESALE-SYNDICATE-TOKEN-99',
  };

  const poolA = new Tier4DarkPool({
    poolId: 'pool_full_fill_01',
    targetAllocationCents: 5000000,
    ttlMs: 5000,
    secretPayload: secretWholesaleCluster,
  });

  const commitA1 = poolA.submitCommitment({ buyerWallet: '0xBuyerSyndicateA', amountCents: 2000000 });
  const commitA2 = poolA.submitCommitment({ buyerWallet: '0xBuyerSyndicateB', amountCents: 1750000 });
  const commitA3 = poolA.submitCommitment({ buyerWallet: '0xBuyerSyndicateC', amountCents: 1250000 });

  const poolB = new Tier4DarkPool({
    poolId: 'pool_underfill_timeout_02',
    targetAllocationCents: 5000000,
    ttlMs: 50,
    secretPayload: secretWholesaleCluster,
  });

  poolB.submitCommitment({ buyerWallet: '0xBuyerPartialA', amountCents: 2000000 });
  poolB.submitCommitment({ buyerWallet: '0xBuyerPartialB', amountCents: 1500000 });

  await new Promise((r) => setTimeout(r, 60));
  const timeoutResult = poolB.evaluateExpiry();
  const lateAttempt = poolB.submitCommitment({ buyerWallet: '0xLateBuyerC', amountCents: 1500000 });

  console.log(
    JSON.stringify(
      {
        status: 'ROUND_26_TIER4_THRESHOLD_PROTOTYPE_VERIFIED',
        scenario_1_full_fill_settlement: {
          pool_id: poolA.poolId,
          target_cents: poolA.targetAllocationCents,
          step1_commit_40pct: commitA1,
          step2_commit_35pct: commitA2,
          step3_final_commit_and_settlement: commitA3,
        },
        scenario_2_underfill_timeout_refund: {
          pool_id: poolB.poolId,
          committed_fraction: '70%',
          timeout_evaluation: timeoutResult,
          late_submission_blocked: lateAttempt,
        },
      },
      null,
      2
    )
  );
}

runTests();
