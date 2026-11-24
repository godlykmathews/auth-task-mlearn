import { SignJWT, jwtVerify } from "jose";

export const COOKIE_NAME = "harbor_session";
export const SESSION_SECONDS = 60 * 60 * 24;
const issuer = "harbor-auth";
const audience = "harbor-web";

export function signingKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret || new TextEncoder().encode(secret).length < 32 || secret.startsWith("replace-with-")) {
    throw new Error("JWT_SECRET must contain at least 32 random bytes. Run npm run setup.");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(userId: string, sessionId: string, expiresAt: number) {
  return new SignJWT({}).setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId).setJti(sessionId).setIssuer(issuer).setAudience(audience)
    .setIssuedAt().setExpirationTime(expiresAt).sign(signingKey());
}

export async function verifySessionToken(token?: string) {
  if (!token) return null;
  // Configuration errors should fail loudly, not masquerade as logged-out users.
  const key = signingKey();
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"], issuer, audience, requiredClaims: ["sub", "jti", "iat", "exp"],
    });
    if (typeof payload.sub !== "string" || typeof payload.jti !== "string") return null;
    return { userId: payload.sub, sessionId: payload.jti };
  } catch {
    return null;
  }
}
