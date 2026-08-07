import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export type AuthUser = { id: string; username: string; displayName: string };
declare global { namespace Express { interface Request { user?: AuthUser } } }

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error("JWT_SECRET must contain at least 32 characters");
  return value;
}

export function createToken(user: AuthUser) {
  return jwt.sign(user, secret(), { expiresIn: "30d", issuer: "iron-crown-server", audience: "iron-crown-client" });
}

export function verifyToken(token: string): AuthUser {
  return jwt.verify(token, secret(), { issuer: "iron-crown-server", audience: "iron-crown-client" }) as AuthUser;
}

export function requireAuth(request: Request, response: Response, next: NextFunction) {
  try {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return response.status(401).json({ error: "로그인이 필요합니다." });
    request.user = verifyToken(header.slice(7));
    next();
  } catch { response.status(401).json({ error: "로그인이 만료되었습니다." }); }
}
