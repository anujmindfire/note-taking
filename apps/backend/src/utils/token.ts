import jwt from "jsonwebtoken";

function getSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) throw new Error("JWT_SECRET env var is required");
  return secret;
}

export function signAccessToken(payload: { userId: string; email: string }): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "15m" });
}

export function verifyAccessToken(token: string): { userId: string; email: string } {
  return jwt.verify(token, getSecret()) as { userId: string; email: string };
}
