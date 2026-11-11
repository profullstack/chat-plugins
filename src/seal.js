// AES-256-GCM sealing for tokens at rest. WebCrypto only, so it runs on Node 20+,
// Bun, Deno, Workers and browsers.
//
// Format: "v1.<iv base64url>.<ciphertext+tag base64url>"
// Key: 32 raw bytes, a 64-char hex string, a base64/base64url string of 32 bytes,
// or any other string (hashed with SHA-256; use a long random secret).

import { base64url } from "./oauth.js";

/** @param {string} s */
function fromBase64url(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** @param {string | Uint8Array} key */
async function importKey(key) {
  let raw;
  if (key instanceof Uint8Array) raw = key;
  else if (typeof key === "string" && /^[0-9a-f]{64}$/i.test(key)) {
    raw = new Uint8Array(32);
    for (let i = 0; i < 32; i++) raw[i] = parseInt(key.slice(i * 2, i * 2 + 2), 16);
  } else if (typeof key === "string" && /^[A-Za-z0-9+/_-]{43}=?$/.test(key)) {
    raw = fromBase64url(key.replace(/=$/, ""));
  } else if (typeof key === "string" && key.length >= 16) {
    raw = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)));
  } else {
    throw new Error("sealToken: key must be 32 bytes or a secret string of at least 16 characters");
  }
  if (raw.length !== 32) throw new Error("sealToken: key must be 32 bytes");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/**
 * Encrypt a token (string or JSON-able object).
 * @param {string | object} secret
 * @param {string | Uint8Array} key
 * @returns {Promise<string>}
 */
export async function sealToken(secret, key) {
  const plain = typeof secret === "string" ? `s:${secret}` : `j:${JSON.stringify(secret)}`;
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importKey(key), new TextEncoder().encode(plain));
  return `v1.${base64url(iv)}.${base64url(new Uint8Array(ct))}`;
}

/**
 * Decrypt a value from sealToken. Throws when the key is wrong or the value was altered.
 * @param {string} sealed
 * @param {string | Uint8Array} key
 * @returns {Promise<any>}
 */
export async function openToken(sealed, key) {
  const parts = String(sealed || "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("openToken: not a sealed value");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64url(parts[1]) },
    await importKey(key),
    fromBase64url(parts[2]),
  );
  const s = new TextDecoder().decode(pt);
  if (s.startsWith("s:")) return s.slice(2);
  if (s.startsWith("j:")) return JSON.parse(s.slice(2));
  throw new Error("openToken: unknown payload");
}
