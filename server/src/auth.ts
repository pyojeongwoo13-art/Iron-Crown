import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";

export type AuthUser = { id: string; username: string; displayName: string; sessionId: string };
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

export async function isActiveSession(user: AuthUser) {
  if (!user.sessionId) return false;
  const result = await pool.query("SELECT 1 FROM users WHERE id=$1 AND active_session_id=$2", [user.id, user.sessionId]);
  return Boolean(result.rowCount);
}

export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  try {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return response.status(401).json({ error: "로그인이 필요합니다." });
    request.user = verifyToken(header.slice(7));
    if (!(await isActiveSession(request.user))) return response.status(401).json({ error: "다른 기기에서 로그인되어 이 세션이 종료되었습니다.", code: "SESSION_REPLACED" });
    next();
  } catch { response.status(401).json({ error: "로그인이 만료되었습니다." }); }
}
