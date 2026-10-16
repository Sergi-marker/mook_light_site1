// © la triche — Animots
// Mots de passe (scrypt) et jetons de session. Seule l'empreinte des jetons est stockée en base.

import { scryptSync, randomBytes, timingSafeEqual, createHash } from "node:crypto";

const N = 16384, R = 8, P = 1, KEYLEN = 64;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export function verifyPassword(password, stored) {
  const parts = String(stored).split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64");
  const key = scryptSync(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export function newToken() {
  return randomBytes(32).toString("base64url");
}

export function tokenHash(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Règle simple et lisible : 8 caractères minimum. */
export function passwordProblem(pw) {
  if (typeof pw !== "string" || pw.length < 8) return "PASSWORD_SHORT";
  if (pw.length > 200) return "PASSWORD_LONG";
  return null;
}
