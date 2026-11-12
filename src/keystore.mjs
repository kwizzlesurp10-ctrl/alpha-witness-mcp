import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const KEY_DIR = path.join(os.homedir(), '.pandaforge');
const KEY_FILE = path.join(KEY_DIR, 'witness_ed25519.pem');

let _privateKey = null;
let _publicKey = null;
let _keyId = null;

export function initKeystore() {
  if (_privateKey && _publicKey) {
    return { privateKey: _privateKey, publicKey: _publicKey, keyId: _keyId };
  }

  if (!fs.existsSync(KEY_DIR)) {
    fs.mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  }

  if (fs.existsSync(KEY_FILE)) {
    const pem = fs.readFileSync(KEY_FILE, 'utf8');
    _privateKey = crypto.createPrivateKey(pem);
    _publicKey = crypto.createPublicKey(_privateKey);
  } else {
    const pair = crypto.generateKeyPairSync('ed25519');
    _privateKey = pair.privateKey;
    _publicKey = pair.publicKey;
    const pem = _privateKey.export({ type: 'pkcs8', format: 'pem' });
    fs.writeFileSync(KEY_FILE, pem, { mode: 0o600 });
  }

  const pubDer = _publicKey.export({ type: 'spki', format: 'der' });
  _keyId = crypto.createHash('sha256').update(pubDer).digest('hex').slice(0, 16);

  return { privateKey: _privateKey, publicKey: _publicKey, keyId: _keyId };
}

export function canonicalJson(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

export function signDsse(payloadObj) {
  const { privateKey, keyId } = initKeystore();
  const canonicalBytes = Buffer.from(canonicalJson(payloadObj), 'utf8');
  const b64Payload = canonicalBytes.toString('base64');
  const pae = Buffer.concat([
    Buffer.from('DSSEv1 37 application/vnd.pandaforge.witness+json '),
    Buffer.from(String(b64Payload.length)),
    Buffer.from(' '),
    Buffer.from(b64Payload)
  ]);
  const sig = crypto.sign(null, pae, privateKey);
  return {
    payloadType: 'application/vnd.pandaforge.witness+json',
    payload: b64Payload,
    signatures: [
      {
        keyid: keyId,
        sig: sig.toString('base64')
      }
    ]
  };
}

export function verifyDsse(envelope) {
  const { publicKey } = initKeystore();
  const b64Payload = envelope.payload;
  const pae = Buffer.concat([
    Buffer.from('DSSEv1 37 application/vnd.pandaforge.witness+json '),
    Buffer.from(String(b64Payload.length)),
    Buffer.from(' '),
    Buffer.from(b64Payload)
  ]);
  const sig = Buffer.from(envelope.signatures[0].sig, 'base64');
  return crypto.verify(null, pae, publicKey, sig);
}
