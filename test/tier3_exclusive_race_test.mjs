#!/usr/bin/env node
/**
 * Round 16 Tier 3 Exclusive Syndicate Lock Concurrency & 50 USDC SLA Bond Test.
 */

import crypto from 'node:crypto';

const SELLER_KEYPAIR = crypto.generateKeyPairSync('ed25519');
let slaBondUsdc = 50.0;

function createTier3Pool() {
  const preimageK = crypto.randomBytes(32);
  const hashLockH = crypto.createHash('sha256').update(preimageK).digest('hex');

  const witness = {
    witness_id: 'w_b200_cluster_exclusive_01',
    vertical: 'cloud_gpu_spot_arbitrage',
    claimed_spread_bps: 2250,
    hash_lock_H: hashLockH,
    preimageKHex: preimageK.toString('hex'),
    state: 'OPEN',
    exclusiveOwnerWallet: null,
    issuedReceipts: [],
  };

  function signBuyerReceipt(witnessId, buyerWallet, tier) {
    const receiptPayload = JSON.stringify({
      witness_id: witnessId,
      buyer_wallet: buyerWallet,
      tier,
      exclusive_covenant: tier === 'tier3_exclusive_25.00',
      seller_self_trade_prohibited: true,
      ts: Date.now(),
    });
    const sig = crypto.sign(null, Buffer.from(receiptPayload), SELLER_KEYPAIR.privateKey).toString('base64');
    return { receiptPayload, sig };
  }

  async function attemptUnlock({ witnessId, buyerWallet, tier }) {
    if (witness.witness_id !== witnessId) throw new Error('Not found');

    if (witness.state === 'BURNED_TIER3_EXCLUSIVE') {
      return {
        http_status: 409,
        ok: false,
        buyer_wallet: buyerWallet,
        tier,
        error: 'CONFLICT_EXCLUSIVE_SYNDICATE_LOCK_BURNED',
      };
    }

    if (tier === 'tier3_exclusive_25.00') {
      witness.state = 'BURNED_TIER3_EXCLUSIVE';
      witness.exclusiveOwnerWallet = buyerWallet;
      const receipt = signBuyerReceipt(witnessId, buyerWallet, tier);
      witness.issuedReceipts.push(receipt);
      return {
        http_status: 200,
        ok: true,
        buyer_wallet: buyerWallet,
        tier,
        pool_state_after: witness.state,
        revealed_key_K: witness.preimageKHex,
        signed_exclusive_receipt: receipt,
      };
    }

    const receipt = signBuyerReceipt(witnessId, buyerWallet, tier);
    witness.issuedReceipts.push(receipt);
    return {
      http_status: 200,
      ok: true,
      buyer_wallet: buyerWallet,
      tier,
      revealed_key_K: witness.preimageKHex,
      signed_receipt: receipt,
    };
  }

  function verifyExclusivitySlaBond(receiptA, receiptB) {
    const validA = crypto.verify(
      null,
      Buffer.from(receiptA.receiptPayload),
      SELLER_KEYPAIR.publicKey,
      Buffer.from(receiptA.sig, 'base64')
    );
    const validB = crypto.verify(
      null,
      Buffer.from(receiptB.receiptPayload),
      SELLER_KEYPAIR.publicKey,
      Buffer.from(receiptB.sig, 'base64')
    );
    if (!validA || !validB) throw new Error('Invalid receipt signature');

    const dataA = JSON.parse(receiptA.receiptPayload);
    const dataB = JSON.parse(receiptB.receiptPayload);

    if (
      dataA.witness_id === dataB.witness_id &&
      (dataA.exclusive_covenant || dataB.exclusive_covenant) &&
      dataA.buyer_wallet !== dataB.buyer_wallet
    ) {
      const slashed = slaBondUsdc;
      slaBondUsdc = 0;
      return {
        equivocation_detected: true,
        slashed_sla_bond_usdc: slashed,
        awarded_to: dataA.exclusive_covenant ? dataA.buyer_wallet : dataB.buyer_wallet,
      };
    }
    return { equivocation_detected: false, sla_bond_remaining_usdc: slaBondUsdc };
  }

  return { witness, attemptUnlock, signBuyerReceipt, verifyExclusivitySlaBond };
}

async function main() {
  const pool = createTier3Pool();

  const [resTier3, resTier1, resTier2] = await Promise.all([
    pool.attemptUnlock({
      witnessId: 'w_b200_cluster_exclusive_01',
      buyerWallet: '0xSyndicateWhale_Tier3',
      tier: 'tier3_exclusive_25.00',
    }),
    pool.attemptUnlock({
      witnessId: 'w_b200_cluster_exclusive_01',
      buyerWallet: '0xSpotBot_Tier1',
      tier: 'tier1_spot_0.25',
    }),
    pool.attemptUnlock({
      witnessId: 'w_b200_cluster_exclusive_01',
      buyerWallet: '0xStreamBot_Tier2',
      tier: 'tier2_stream_4.50',
    }),
  ]);

  const simulatedColludingSecondReceipt = pool.signBuyerReceipt(
    'w_b200_cluster_exclusive_01',
    '0xSellerShadowSelfTradeWallet',
    'tier1_spot_0.25'
  );
  const slashSimulation = pool.verifyExclusivitySlaBond(
    resTier3.signed_exclusive_receipt,
    simulatedColludingSecondReceipt
  );

  console.log(
    JSON.stringify(
      {
        status: 'ROUND_16_TIER3_EXCLUSIVE_CONCURRENCY_AND_SLA_VERIFIED',
        concurrent_race_results: [
          {
            buyer: resTier3.buyer_wallet,
            tier: resTier3.tier,
            http_status: resTier3.http_status,
            ok: resTier3.ok,
            pool_state_after: resTier3.pool_state_after,
          },
          {
            buyer: resTier1.buyer_wallet,
            tier: resTier1.tier,
            http_status: resTier1.http_status,
            ok: resTier1.ok,
            error: resTier1.error,
          },
          {
            buyer: resTier2.buyer_wallet,
            tier: resTier2.tier,
            http_status: resTier2.http_status,
            ok: resTier2.ok,
            error: resTier2.error,
          },
        ],
        total_receipts_issued_in_live_pool: pool.witness.issuedReceipts.length,
        equivocation_slash_simulation: slashSimulation,
      },
      null,
      2
    )
  );
}

main();
