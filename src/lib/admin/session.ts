import { createHmac, timingSafeEqual } from "node:crypto";

export interface SessionPayload {
  sub: "owner";
  iat: number;
  exp: number;
}

const SESSION_DURATION_SECONDS = 12 * 60 * 60; // 12 hours

function toBase64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromBase64Url(str: string): Buffer {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64");
}

function assertValidSecret(secret: string): void {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET must be at least 32 characters long");
  }
}

export function createSessionToken(
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): string {
  assertValidSecret(secret);

  const payload: SessionPayload = {
    sub: "owner",
    iat: nowSeconds,
    exp: nowSeconds + SESSION_DURATION_SECONDS,
  };

  const payloadB64 = toBase64Url(Buffer.from(JSON.stringify(payload), "utf8"));
  const hmac = createHmac("sha256", secret).update(payloadB64).digest();
  const sigB64 = toBase64Url(hmac);

  return `${payloadB64}.${sigB64}`;
}

export function verifySessionToken(
  token: string | null | undefined,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): SessionPayload | null {
  assertValidSecret(secret);

  if (!token || typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) {
    return null;
  }

  try {
    const expectedHmac = createHmac("sha256", secret)
      .update(payloadB64)
      .digest();
    const actualHmac = fromBase64Url(sigB64);

    if (expectedHmac.length !== actualHmac.length) {
      return null;
    }

    if (!timingSafeEqual(expectedHmac, actualHmac)) {
      return null;
    }

    const payloadJson = fromBase64Url(payloadB64).toString("utf8");
    const payload = JSON.parse(payloadJson) as SessionPayload;

    if (payload.sub !== "owner") {
      return null;
    }

    if (typeof payload.exp !== "number" || nowSeconds >= payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
