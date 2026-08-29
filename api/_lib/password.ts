import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored || !stored.startsWith("scrypt:")) return false;
  const parts = stored.split(":");
  if (parts.length !== 3) return false;
  const [, salt, hashHex] = parts;
  try {
    const derived = (await scryptAsync(password, salt, 64)) as Buffer;
    const expected = Buffer.from(hashHex, "hex");
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

export function isStrongEnoughPassword(password: string): boolean {
  return typeof password === "string" && password.length >= 8;
}

/*
 * Same scrypt cost as a real hash, so a missing account does not return
 * faster than a wrong password. The secret is not a live credential.
 */
const DUMMY_PASSWORD_HASH =
  "scrypt:00000000000000000000000000000000:39e67a3b7b6e22cfcdf4a8a88c5b186c32c62062670b56d5551257c0e8bc07588c07f9a412f9ae8ef82f90ec0813d9e162ba6a4bd111f9a353cbf18680b57611";

export async function verifyPasswordAgainstStore(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (stored && stored.startsWith("scrypt:")) {
    return verifyPassword(password, stored);
  }
  await verifyPassword(password, DUMMY_PASSWORD_HASH);
  return false;
}
