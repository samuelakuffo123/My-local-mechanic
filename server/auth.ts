import { randomInt } from "node:crypto";
import { config } from "./config.ts";
import { all, get, run, tx } from "./db.ts";
import { forbidden, tooMany, unauthorized, badRequest } from "./errors.ts";
import { sendOtp } from "./sms.ts";
import { auditFrom } from "./audit.ts";
import {
  addHours,
  addMinutes,
  hashPassword,
  newId,
  normalisePhone,
  nowIso,
  randomToken,
  rateLimit,
  sha256,
  verifyPassword,
} from "./util.ts";
import type { AuthContext } from "./http.ts";

type Role = AuthContext["role"];

interface UserRow {
  id: string;
  role: Role;
  name: string;
  phone: string;
  email: string | null;
  status: string;
}

const SELF_SERVE_ROLES: Role[] = ["driver", "mechanic", "tow", "vendor"];

export async function requestOtp(rawPhone: string, ip: string): Promise<{ devCode?: string; expiresAt: string }> {
  const phone = normalisePhone(rawPhone);
  if (!phone) throw badRequest("Enter a valid phone number.");
  if (!rateLimit(`otp:phone:${phone}`, 5, 15 * 60_000)) throw tooMany("Too many codes requested for this number. Try again later.");
  if (!rateLimit(`otp:ip:${ip}`, 20, 60 * 60_000)) throw tooMany("Too many codes requested. Try again later.");

  const code = String(randomInt(100000, 999999));
  const expiresAt = addMinutes(new Date(), config.otpTtlMinutes).toISOString();
  run(
    `INSERT INTO otp_codes (id, phone, code_hash, attempts, expires_at, consumed_at, created_at) VALUES (?, ?, ?, 0, ?, NULL, ?)`,
    [newId(), phone, sha256(code), expiresAt, nowIso()],
  );

  const result = await sendOtp(phone, code);
  const devCode = config.env === "production" ? undefined : result.devCode;
  return { devCode, expiresAt };
}

export function verifyOtp(rawPhone: string, code: string, options: { name?: string; role?: Role } = {}) {
  const phone = normalisePhone(rawPhone);
  if (!rateLimit(`verify:phone:${phone}`, 10, 15 * 60_000)) throw tooMany();

  const record = get<{ id: string; code_hash: string; attempts: number; expires_at: string; consumed_at: string | null }>(
    `SELECT id, code_hash, attempts, expires_at, consumed_at FROM otp_codes
     WHERE phone = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    [phone],
  );
  if (!record) throw badRequest("Request a verification code first.");
  if (record.consumed_at) throw badRequest("That code has already been used.");
  if (new Date(record.expires_at).getTime() <= Date.now()) throw badRequest("That code has expired. Request a new one.");
  if (record.attempts >= config.otpMaxAttempts) throw tooMany("Too many incorrect attempts. Request a new code.");
  if (record.code_hash !== sha256(code)) {
    run("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?", [record.id]);
    throw badRequest("That code is incorrect.");
  }

  const role: Role = options.role && SELF_SERVE_ROLES.includes(options.role) ? options.role : "driver";
  const issued = tx(() => {
    run("UPDATE otp_codes SET consumed_at = ? WHERE id = ?", [nowIso(), record.id]);
    let user = get<UserRow>("SELECT id, role, name, phone, email, status FROM users WHERE phone = ?", [phone]);
    if (!user) {
      const id = newId();
      const timestamp = nowIso();
      run(
        `INSERT INTO users (id, role, name, phone, email, status, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, 'active', ?, ?)`,
        [id, role, options.name?.trim() || "New customer", phone, timestamp, timestamp],
      );
      user = get<UserRow>("SELECT id, role, name, phone, email, status FROM users WHERE id = ?", [id]);
    }
    if (!user) throw new Error("Failed to provision user.");
    if (user.status !== "active") throw forbidden("This account is not active.");

    const token = randomToken(32);
    run(
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, revoked_at, user_agent) VALUES (?, ?, ?, ?, NULL, NULL)`,
      [sha256(token), user.id, nowIso(), addHours(new Date(), config.sessionTtlHours).toISOString()],
    );
    return { token, user };
  });

  auditFrom({ userId: issued.user.id, role: issued.user.role, name: issued.user.name }, "auth.login", "user", issued.user.id);
  return sessionPayload(issued.token, issued.user);
}

export function authenticateToken(token: string): AuthContext | null {
  const row = get<{ user_id: string; role: Role; name: string; expires_at: string; revoked_at: string | null; status: string }>(
    `SELECT s.user_id, u.role, u.name, s.expires_at, s.revoked_at, u.status
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    [sha256(token)],
  );
  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  if (row.status !== "active") return null;
  return { userId: row.user_id, role: row.role, name: row.name };
}

export function logout(token: string) {
  run("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?", [nowIso(), sha256(token)]);
}

export function requireRole(auth: AuthContext | null, roles: Role[]): AuthContext {
  if (!auth) throw unauthorized();
  if (!roles.includes(auth.role)) throw forbidden();
  return auth;
}

export function getUser(userId: string) {
  return get<{ id: string; role: Role; name: string; phone: string; email: string | null; status: string; createdAt: string }>(
    `SELECT id, role, name, phone, email, status, created_at as createdAt FROM users WHERE id = ?`,
    [userId],
  );
}

export function setPassword(userId: string, password: string) {
  const { hash, salt } = hashPassword(password);
  run(
    `INSERT INTO auth_credentials (user_id, password_hash, password_salt, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET password_hash = excluded.password_hash, password_salt = excluded.password_salt, updated_at = excluded.updated_at`,
    [userId, hash, salt, nowIso()],
  );
}

export function checkPassword(phone: string, password: string) {
  const row = get<{ user_id: string; password_hash: string; password_salt: string }>(
    `SELECT c.user_id, c.password_hash, c.password_salt FROM auth_credentials c JOIN users u ON u.id = c.user_id WHERE u.phone = ?`,
    [normalisePhone(phone)],
  );
  if (!row) return null;
  if (!verifyPassword(password, row.password_salt, row.password_hash)) return null;
  return row.user_id;
}

export function createSession(userId: string) {
  const user = get<UserRow>("SELECT id, role, name, phone, email, status FROM users WHERE id = ?", [userId]);
  if (!user) throw unauthorized();
  if (user.status !== "active") throw forbidden("This account is not active.");
  const token = randomToken(32);
  run(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, revoked_at, user_agent) VALUES (?, ?, ?, ?, NULL, NULL)`,
    [sha256(token), user.id, nowIso(), addHours(new Date(), config.sessionTtlHours).toISOString()],
  );
  auditFrom({ userId: user.id, role: user.role, name: user.name }, "auth.login", "user", user.id);
  return sessionPayload(token, user);
}

export function listUsers(role?: Role) {
  const rows = role
    ? all<UserRow>("SELECT id, role, name, phone, email, status FROM users WHERE role = ? ORDER BY created_at DESC", [role])
    : all<UserRow>("SELECT id, role, name, phone, email, status FROM users ORDER BY created_at DESC");
  return rows;
}

function sessionPayload(token: string, user: UserRow) {
  return {
    token,
    user: { id: user.id, role: user.role, name: user.name, phone: user.phone, email: user.email },
  };
}
