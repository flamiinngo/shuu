import { RescueCipher } from "@arcium-hq/client";
import { x25519 } from "@noble/curves/ed25519";
function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export type EncryptedPosition = {
  collateralCt: number[];
  entryPriceCt: number[];
  sizeCt:       number[];
  isLongCt:     number[];
  pubKey:       number[];
  nonce:        Uint8Array;
  cipher:       RescueCipher;
};

export type EncryptedLiqParams = {
  markPriceCt: number[];
  marginBpsCt: number[];
  pubKey:      number[];
  nonce:       Uint8Array;
};

export type EncryptedCloseParams = {
  exitPriceCt: number[];
  pubKey:      number[];
  nonce:       Uint8Array;
  cipher:      RescueCipher;
};

// All price/size values are scaled by 1e6 inside the circuit.
// The client converts floating-point inputs to the fixed-point integer
// representation before encrypting.

function toFixed6(n: number): bigint {
  return BigInt(Math.round(n * 1_000_000));
}

export function encryptPosition(
  mxePubkey:  Uint8Array,
  collateral: number,
  entryPrice: number,
  size:       number,
  isLong:     boolean
): EncryptedPosition {
  const priv   = x25519.utils.randomSecretKey();
  const pub    = x25519.getPublicKey(priv);
  const secret = x25519.getSharedSecret(priv, mxePubkey);
  const cipher = new RescueCipher(secret);
  const nonce  = randomBytes(16);

  const cts = cipher.encrypt(
    [toFixed6(collateral), toFixed6(entryPrice), toFixed6(size), isLong ? 1n : 0n],
    nonce
  );

  return {
    collateralCt: cts[0],
    entryPriceCt: cts[1],
    sizeCt:       cts[2],
    isLongCt:     cts[3],
    pubKey:       Array.from(pub),
    nonce,
    cipher,
  };
}

export function encryptLiqParams(
  mxePubkey:  Uint8Array,
  markPrice:  number,
  marginBps:  number
): EncryptedLiqParams {
  const priv   = x25519.utils.randomSecretKey();
  const pub    = x25519.getPublicKey(priv);
  const secret = x25519.getSharedSecret(priv, mxePubkey);
  const cipher = new RescueCipher(secret);
  const nonce  = randomBytes(16);

  const cts = cipher.encrypt(
    [toFixed6(markPrice), BigInt(marginBps)],
    nonce
  );

  return {
    markPriceCt: cts[0],
    marginBpsCt: cts[1],
    pubKey:      Array.from(pub),
    nonce,
  };
}

export function encryptCloseParams(
  mxePubkey: Uint8Array,
  exitPrice: number
): EncryptedCloseParams {
  const priv   = x25519.utils.randomSecretKey();
  const pub    = x25519.getPublicKey(priv);
  const secret = x25519.getSharedSecret(priv, mxePubkey);
  const cipher = new RescueCipher(secret);
  const nonce  = randomBytes(16);

  const cts = cipher.encrypt([toFixed6(exitPrice)], nonce);

  return {
    exitPriceCt: cts[0],
    pubKey:      Array.from(pub),
    nonce,
    cipher,
  };
}

// Returns { magnitude (USD string), isProfit }
export function decryptPnl(
  cipher:       RescueCipher,
  magnitudeCt:  number[],
  isProfitCt:   number[],
  resultNonce:  Uint8Array
): { magnitude: string; isProfit: boolean } {
  const [mag, profitRaw] = cipher.decrypt([magnitudeCt, isProfitCt], resultNonce);
  const usd = (Number(mag) / 1_000_000).toFixed(2);
  return { magnitude: usd, isProfit: profitRaw === 1n };
}
