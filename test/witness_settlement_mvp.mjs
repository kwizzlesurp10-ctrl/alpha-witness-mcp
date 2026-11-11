#!/usr/bin/env node
/**
 * Round 8 MVP Prototype: End-to-End Verifiable Spread Witness + HTLC x402 Settlement Loop
 * Built jointly by Antigravity CLI & Grok (SwarmScribe QMA² Coordi-HierSupe Panda).
 */

import crypto from 'node:crypto';

const BRIDGE_URL = 'http://127.0.0.1:8787/api/command';

async function captureLiveTelemetry() {
  try {
    const res = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'snapshot', args: { interactiveOnly: true } }),
    });
    const data = await res.json();
    const rawText = data?.result?.text || 'fallback-dom';
    return {
      dom_merkle_root: crypto.createHash('sha256').update(rawText).digest('hex'),
      observation_ts: Math.floor(Date.now() / 1000),
    };
  } catch {
    return {
      dom_merkle_root: crypto.createHash('sha256').update('local-test-dom').digest('hex'),
      observation_ts: Math.floor(Date.now() / 1000),
    };
  }
}

async function buildSignedWitnessBundle(sellerKeyPair) {
  const telemetry = await captureLiveTelemetry();

  const secretCommercialAlpha = {
    sku: 'NVIDIA-H200-SXM-8X-SPOT',
    provider_url: 'https://cloud.example-gpu-market.io/spot/us-east',
    promo_code: 'QMA2-FLASH-18OFF',
    reference_price_usd_hr: 28.50,
    observed_price_usd_hr: 23.80,
  };

  const spreadBps = Math.round(
    ((secretCommercialAlpha.reference_price_usd_hr - secretCommercialAlpha.observed_price_usd_hr) /
      secretCommercialAlpha.reference_price_usd_hr) *
      10000
  );

  const preimageKeyK = crypto.randomBytes(32);
  const hashLockH = crypto.createHash('sha256').update(preimageKeyK).digest('hex');

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', preimageKeyK, iv);
  const plaintextBytes = Buffer.from(JSON.stringify(secretCommercialAlpha), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintextBytes), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const ciphertextC = {
    alg: 'AES-256-GCM',
    iv: iv.toString('hex'),
    tag: authTag.toString('hex'),
    data: encrypted.toString('hex'),
  };

  const publicClaim = {
    schema: 'pandaforge.qma2.spread_witness.v1',
    vertical: 'cloud_gpu_spot_arbitrage',
    claimed_spread_bps: spreadBps,
    min_threshold_bps: 1400,
    observation_ts: telemetry.observation_ts,
    ttl_sec: 120,
    dom_merkle_root: telemetry.dom_merkle_root,
    hash_lock_H: hashLockH,
    ciphertext_C: ciphertextC,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(publicClaim), 'utf8').toString('base64');
  const payloadType = 'application/vnd.pandaforge.witness+json';
  const pae = `DSSEv1 ${payloadType.length} ${payloadType} ${payloadBase64.length} ${payloadBase64}`;
  const signature = crypto.sign(null, Buffer.from(pae, 'utf8'), sellerKeyPair.privateKey).toString('base64');

  const dsseEnvelope = {
    payloadType,
    payload: payloadBase64,
    signatures: [
      {
        keyid: crypto
          .createHash('sha256')
          .update(sellerKeyPair.publicKey.export({ type: 'spki', format: 'der' }))
          .digest('hex')
          .slice(0, 16),
        sig: signature,
      },
    ],
  };

  return { dsseEnvelope, preimageKeyK };
}

function counterpartyVerifyPrePayment(dsseEnvelope, sellerPublicKey) {
  const { payloadType, payload, signatures } = dsseEnvelope;
  const pae = `DSSEv1 ${payloadType.length} ${payloadType} ${payload.length} ${payload}`;
  const sigBuf = Buffer.from(signatures[0].sig, 'base64');

  const sigValid = crypto.verify(null, Buffer.from(pae, 'utf8'), sellerPublicKey, sigBuf);
  if (!sigValid) throw new Error('DSSE Ed25519 signature verification FAILED');

  const claim = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  const ageSec = Math.floor(Date.now() / 1000) - claim.observation_ts;

  if (ageSec > claim.ttl_sec) throw new Error(`Witness expired: age ${ageSec}s > ${claim.ttl_sec}s`);
  if (claim.claimed_spread_bps < claim.min_threshold_bps) {
    throw new Error(`Spread ${claim.claimed_spread_bps} bps below threshold ${claim.min_threshold_bps} bps`);
  }

  return {
    verified: true,
    ageSec,
    claimed_spread_bps: claim.claimed_spread_bps,
    hash_lock_H: claim.hash_lock_H,
    x402_htlc_voucher: {
      amount_usdc: '0.25',
      condition_sha256: claim.hash_lock_H,
      expiry_ts: claim.observation_ts + 60,
    },
    claim,
  };
}

function atomicSettleAndDecrypt(claim, revealedPreimageHex) {
  const preimageBuf = Buffer.from(revealedPreimageHex, 'hex');
  const computedHash = crypto.createHash('sha256').update(preimageBuf).digest('hex');

  if (computedHash !== claim.hash_lock_H) {
    throw new Error('HTLC preimage mismatch! Payment remains locked.');
  }

  const { iv, tag, data } = claim.ciphertext_C;
  const decipher = crypto.createDecipheriv('aes-256-gcm', preimageBuf, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(data, 'hex')),
    decipher.final(),
  ]).toString('utf8');

  return JSON.parse(decrypted);
}

async function runPrototype() {
  const t0 = performance.now();
  const sellerKeyPair = crypto.generateKeyPairSync('ed25519');

  const { dsseEnvelope, preimageKeyK } = await buildSignedWitnessBundle(sellerKeyPair);
  const preCheck = counterpartyVerifyPrePayment(dsseEnvelope, sellerKeyPair.publicKey);
  const unlockedAlpha = atomicSettleAndDecrypt(preCheck.claim, preimageKeyK.toString('hex'));
  const elapsedMs = (performance.now() - t0).toFixed(2);

  console.log(
    JSON.stringify(
      {
        status: 'MVP_LOOP_VERIFIED',
        elapsed_ms: Number(elapsedMs),
        dsse_keyid: dsseEnvelope.signatures[0].keyid,
        dom_merkle_root: preCheck.claim.dom_merkle_root,
        claimed_spread_bps: preCheck.claimed_spread_bps,
        htlc_hash_lock_H: preCheck.hash_lock_H,
        x402_escrow_locked: preCheck.x402_htlc_voucher.amount_usdc + ' USDC',
        atomic_decrypted_alpha: unlockedAlpha,
      },
      null,
      2
    )
  );
}

runPrototype();
