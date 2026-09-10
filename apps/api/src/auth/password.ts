import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

/**
 * Password hashing via Node's built-in scrypt — no native module, no extra
 * dependency, and scrypt is a deliberately memory-hard KDF (the property
 * that matters for password storage). Format: "<saltHex>:<hashHex>".
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;

  // Buffers must be equal length for timingSafeEqual; a length mismatch
  // means the stored hash is malformed, not a match.
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
