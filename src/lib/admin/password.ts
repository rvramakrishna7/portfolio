import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";

function scryptAsync(
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
  options: { cost: number; blockSize: number; parallelization: number; maxmem: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

const DEFAULT_N = 16384;
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const KEY_LEN = 32;

/**
 * Format: "scrypt$N$r$p$saltB64$hashB64"
 */
export async function hashPassword(
  plain: string,
  options: { N?: number; r?: number; p?: number; salt?: Buffer } = {}
): Promise<string> {
  const N = options.N ?? DEFAULT_N;
  const r = options.r ?? DEFAULT_R;
  const p = options.p ?? DEFAULT_P;
  const salt = options.salt ?? randomBytes(16);

  const derivedKey = await scryptAsync(plain, salt, KEY_LEN, {
    cost: N,
    blockSize: r,
    parallelization: p,
    maxmem: 64 * 1024 * 1024,
  });

  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${derivedKey.toString("base64")}`;
}

export async function verifyPassword(
  plain: string,
  stored: string
): Promise<boolean> {
  if (typeof stored !== "string" || !stored.startsWith("scrypt$")) {
    return false;
  }

  const parts = stored.split("$");
  if (parts.length !== 6) {
    return false;
  }

  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const N = parseInt(nStr, 10);
  const r = parseInt(rStr, 10);
  const p = parseInt(pStr, 10);

  if (
    !Number.isInteger(N) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    N <= 0 ||
    r <= 0 ||
    p <= 0 ||
    !saltB64 ||
    !hashB64
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(saltB64, "base64");
    const expectedHash = Buffer.from(hashB64, "base64");

    if (expectedHash.length !== KEY_LEN) {
      return false;
    }

    const computedHash = await scryptAsync(plain, salt, KEY_LEN, {
      cost: N,
      blockSize: r,
      parallelization: p,
      maxmem: 64 * 1024 * 1024,
    });

    if (computedHash.length !== expectedHash.length) {
      return false;
    }

    return timingSafeEqual(computedHash, expectedHash);
  } catch {
    return false;
  }
}
