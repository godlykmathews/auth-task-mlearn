import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// OWASP's scrypt baseline: N=2^17, r=8, p=1 (~128 MiB per operation).
const options = { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, options, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt);
  return `scrypt-v1$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [version, salt, hash] = encoded.split("$");
  if (version !== "scrypt-v1" || !/^[a-f0-9]{32}$/.test(salt ?? "") || !/^[a-f0-9]{128}$/.test(hash ?? "")) return false;
  const key = await derive(password, salt);
  return timingSafeEqual(key, Buffer.from(hash, "hex"));
}

// Unknown users still perform the same expensive hash calculation.
export const DUMMY_PASSWORD_HASH = `scrypt-v1$${"0".repeat(32)}$${"0".repeat(128)}`;
