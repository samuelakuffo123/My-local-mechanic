import { randomInt } from "node:crypto";
import { config } from "./config.ts";
import { all, get, run, tx } from "./db.ts";
import { AppError, forbidden, tooMany, unauthorized, badRequest } from "./errors.ts";
import { deliverOtp, verifyProviderOtp, PROVIDER_OTP_INVALID } from "./sms.ts";
import { auditFrom } from "./audit.ts";
import {
  addHours,
  addMinutes,
  hashPassword,
  isValidPhone,
  newId,
  normalisePhone,
  nowIso,
  randomToken,
  rateLimit,
  safeEqual,
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
  avatarDataUrl: string | null;
  status: string;
}

const USER_COLUMNS = "id, role, name, phone, email, avatar_data_url as avatarDataUrl, status";
const SELF_SERVE_ROLES: Role[] = ["driver", "mechanic", "tow", "vendor"];

interface OtpRecord {
  id: string;
  code_hash: string;
  provider_managed: number | boolean;
  attempts: number;
  expires_at: string;
  consumed_at: string | null;
}

// Used when a phone number has no credentials so unknown numbers take a similar
// amount of time to reject as known ones.
const DUMMY_CREDENTIALS = hashPassword("mechnow-dummy-password");
const PHONE_ERROR = "Enter a valid Ghanaian phone number, like 024 123 4567.";
const CODE_ERROR = "Enter the 6-digit code from your message.";

// Bind the code to the phone number so a leaked table cannot be brute-forced
// against every 6-digit value in isolation.
function otpHash(phone: string, code: string) {
  return sha256(`${phone}:${code}`);
}

export async function requestOtp(rawPhone: string, ip: string): Promise<{ devCode?: string; expiresAt: string }> {
  if (!isValidPhone(rawPhone)) throw badRequest(PHONE_ERROR, { field: "phone" });
  const phone = normalisePhone(rawPhone);
  if (!rateLimit(`otp:phone:${phone}`, 5, 15 * 60_000)) throw tooMany("Too many codes requested for this number. Try again later.");
  if (!rateLimit(`otp:ip:${ip}`, 20, 60 * 60_000)) throw tooMany("Too many codes requested. Try again later.");

  // Always have a local code ready. The console adapter and the Arkesel legacy
  // SMS fallback use it; Arkesel's OTP API ignores it and generates its own.
  const code = String(randomInt(100000, 999999));
  const delivery = await deliverOtp(phone, code);
  const expiresAt = addMinutes(new Date(), config.otpTtlMinutes).toISOString();
  // Provider-managed OTPs have no local plaintext code. Bind the record to the
  // gateway reference so it cannot be replayed after a successful verification.
  const codeHash = delivery.managed ? sha256(`${phone}:${delivery.providerRef}`) : otpHash(phone, code);
  await run(
    `INSERT INTO otp_codes (id, phone, code_hash, provider_managed, attempts, expires_at, consumed_at, created_at)
     VALUES (?, ?, ?, ?, 0, ?, NULL, ?)`,
    [newId(), phone, codeHash, delivery.managed ? 1 : 0, expiresAt, nowIso()],
  );

  const devCode = config.env === "production" ? undefined : delivery.devCode;
  return { devCode, expiresAt };
}

export async function verifyOtp(rawPhone: string, code: string, options: { name?: string; role?: Role } = {}) {
  if (!isValidPhone(rawPhone)) throw badRequest(PHONE_ERROR, { field: "phone" });
  if (!/^\d{6}$/.test(code)) throw badRequest(CODE_ERROR, { field: "code" });
  const phone = normalisePhone(rawPhone);
  if (!rateLimit(`verify:phone:${phone}`, 10, 15 * 60_000)) throw tooMany();

  // A delayed SMS may arrive after the user asked for another code. Accept any
  // still-valid unconsumed code for this number instead of only the newest one.
  const records = await all<OtpRecord>(
    `SELECT id, code_hash, provider_managed, attempts, expires_at, consumed_at FROM otp_codes
     WHERE phone = ? AND consumed_at IS NULL AND expires_at > ? ORDER BY created_at DESC`,
    [phone, nowIso()],
  );
  if (!records.length) throw badRequest("Request a verification code first.");

  let matched: OtpRecord | null = null;
  let attemptsExhausted = false;
  for (const record of records) {
    if (record.attempts >= config.otpMaxAttempts) {
      attemptsExhausted = true;
      continue;
    }
    if (record.provider_managed) {
      try {
        await verifyProviderOtp(phone, code);
        matched = record;
        break;
      } catch (caught) {
        // Count wrong codes against the local attempt limit, but do not punish
        // the user for a provider outage or an expired code.
        if (caught instanceof AppError && caught.code === PROVIDER_OTP_INVALID) {
          await run("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?", [record.id]);
          continue;
        }
        if (caught instanceof AppError && caught.code === "otp_expired") continue;
        throw caught;
      }
    }
    if (safeEqual(record.code_hash, otpHash(phone, code))) {
      matched = record;
      break;
    }
    await run("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?", [record.id]);
  }
  if (!matched) {
    if (attemptsExhausted) throw tooMany("Too many incorrect attempts. Request a new code.");
    throw badRequest("That code is incorrect.");
  }

  const role: Role = options.role && SELF_SERVE_ROLES.includes(options.role) ? options.role : "driver";
  const issued = await tx(async () => {
    // Once one code is used, retire every other pending code for this number.
    await run(
      "UPDATE otp_codes SET consumed_at = ? WHERE phone = ? AND consumed_at IS NULL",
      [nowIso(), phone],
    );
    let user = await get<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE phone = ?`, [phone]);
    if (!user) {
      const id = newId();
      const timestamp = nowIso();
      await run(
        `INSERT INTO users (id, role, name, phone, email, status, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, 'active', ?, ?)`,
        [id, role, options.name?.trim() || "New customer", phone, timestamp, timestamp],
      );
      user = await get<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [id]);
    }
    if (!user) throw new Error("Failed to provision user.");
    if (user.status !== "active") throw forbidden("This account is not active.");

    const token = randomToken(32);
    await run(
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, revoked_at, user_agent) VALUES (?, ?, ?, ?, NULL, NULL)`,
      [sha256(token), user.id, nowIso(), addHours(new Date(), config.sessionTtlHours).toISOString()],
    );
    return { token, user };
  });

  await auditFrom({ userId: issued.user.id, role: issued.user.role, name: issued.user.name }, "auth.login", "user", issued.user.id);
  return sessionPayload(issued.token, issued.user);
}

interface GoogleTokenInfo {
  azp?: unknown;
  aud?: unknown;
  sub?: unknown;
  exp?: unknown;
  scope?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  given_name?: unknown;
  family_name?: unknown;
}

interface GoogleIdentity {
  subject: string;
  email: string;
  name: string;
}

function isVerifiedEmail(value: unknown): boolean {
  return value === true || value === "true";
}

function displayNameFrom(info: GoogleTokenInfo, email: string): string {
  const clean = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : "");
  const given = clean(info.given_name);
  const family = clean(info.family_name);
  const full = clean(info.name);
  if (given && family) return `${given} ${family}`.slice(0, 80);
  if (given) return given;
  if (full) return full;
  // Never fall back to the email local part: it is not a person's name and
  // looks like an email address in the home greeting.
  void email;
  return "MechNow driver";
}

async function verifyGoogleAccessToken(accessToken: string): Promise<GoogleIdentity> {
  if (!config.googleClientId) throw badRequest("Google sign-in isn't configured for this server.");

  let endpoint: URL;
  try {
    endpoint = new URL(config.googleTokenInfoUrl);
  } catch {
    throw new Error("GOOGLE_TOKENINFO_URL must be a valid URL.");
  }
  endpoint.searchParams.set("access_token", accessToken);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw unauthorized("We couldn't reach Google to verify sign-in. Try again.");
  }
  if (!response.ok) throw unauthorized("Google sign-in could not be verified. Try again.");

  let info: GoogleTokenInfo;
  try {
    info = (await response.json()) as GoogleTokenInfo;
  } catch {
    throw unauthorized("Google sign-in could not be verified. Try again.");
  }

  const subject = typeof info.sub === "string" ? info.sub.trim() : "";
  const email = typeof info.email === "string" ? info.email.trim().toLowerCase() : "";
  const expiry = Number(info.exp);
  const requester = typeof info.azp === "string" && info.azp
    ? info.azp
    : typeof info.aud === "string" ? info.aud : "";
  const scopes = typeof info.scope === "string" ? info.scope.split(/\s+/).filter(Boolean) : [];
  const hasEmailScope = scopes.includes("openid") || scopes.includes("https://www.googleapis.com/auth/userinfo.email");

  if (
    !subject ||
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    requester !== config.googleClientId ||
    !Number.isFinite(expiry) ||
    expiry <= Math.floor(Date.now() / 1000) ||
    !isVerifiedEmail(info.email_verified) ||
    !hasEmailScope
  ) {
    throw unauthorized("That Google sign-in could not be verified.");
  }

  return { subject, email, name: displayNameFrom(info, email) };
}

/** Verifies a Google access token, links the account, then issues a MechNow session. */
export async function signInWithGoogle(accessToken: string, options: { role?: Role } = {}) {
  const identity = await verifyGoogleAccessToken(accessToken);
  const role: Role = options.role && SELF_SERVE_ROLES.includes(options.role) ? options.role : "driver";

  const user = await tx(async () => {
    const columns = USER_COLUMNS;
    const link = await get<{ user_id: string }>(
      "SELECT user_id FROM oauth_accounts WHERE provider = 'google' AND provider_subject = ?",
      [identity.subject],
    );

    let existing = link ? await get<UserRow>(`SELECT ${columns} FROM users WHERE id = ?`, [link.user_id]) : undefined;
    if (!existing) {
      existing = await get<UserRow>(`SELECT ${columns} FROM users WHERE lower(email) = ? AND status != 'deleted'`, [identity.email]);
    }

    if (existing) {
      if (existing.status !== "active") throw forbidden("This account is not active.");
      if (!existing.email) {
        await run("UPDATE users SET email = ?, updated_at = ? WHERE id = ?", [identity.email, nowIso(), existing.id]);
        existing = await get<UserRow>(`SELECT ${columns} FROM users WHERE id = ?`, [existing.id]);
      }
    } else {
      const id = newId();
      const timestamp = nowIso();
      // `users.phone` is NOT NULL UNIQUE. Google-only accounts get a stable,
      // non-dialable sentinel derived from the immutable Google subject.
      const phone = `google:${sha256(`mechnow-google:${identity.subject}`).slice(0, 24)}`;
      await run(
        `INSERT INTO users (id, role, name, phone, email, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
        [id, role, identity.name, phone, identity.email, timestamp, timestamp],
      );
      existing = await get<UserRow>(`SELECT ${columns} FROM users WHERE id = ?`, [id]);
    }

    if (!existing) throw new Error("Failed to provision Google user.");
    const timestamp = nowIso();
    await run(
      `INSERT INTO oauth_accounts (provider, provider_subject, user_id, email, created_at, updated_at)
       VALUES ('google', ?, ?, ?, ?, ?)
       ON CONFLICT(provider, provider_subject) DO UPDATE SET
         user_id = excluded.user_id, email = excluded.email, updated_at = excluded.updated_at`,
      [identity.subject, existing.id, identity.email, timestamp, timestamp],
    );
    return existing;
  });

  const session = await createSession(user.id);
  await auditFrom(
    { userId: user.id, role: user.role, name: user.name },
    "auth.login.google",
    "user",
    user.id,
    { provider: "google" },
  );
  return session;
}

export async function authenticateToken(token: string): Promise<AuthContext | null> {
  const row = await get<{ user_id: string; role: Role; name: string; expires_at: string; revoked_at: string | null; status: string }>(
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

export async function logout(token: string) {
  await run("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?", [nowIso(), sha256(token)]);
}

export function requireRole(auth: AuthContext | null, roles: Role[]): AuthContext {
  if (!auth) throw unauthorized();
  if (!roles.includes(auth.role)) throw forbidden();
  return auth;
}

export async function getUser(userId: string) {
  return await get<{
    id: string;
    role: Role;
    name: string;
    phone: string;
    email: string | null;
    avatarUrl: string | null;
    status: string;
    createdAt: string;
  }>(
    `SELECT id, role, name, phone, email, avatar_data_url as "avatarUrl", status, created_at as "createdAt" FROM users WHERE id = ?`,
    [userId],
  );
}

export async function setPassword(userId: string, password: string) {
  const { hash, salt } = hashPassword(password);
  await run(
    `INSERT INTO auth_credentials (user_id, password_hash, password_salt, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET password_hash = excluded.password_hash, password_salt = excluded.password_salt, updated_at = excluded.updated_at`,
    [userId, hash, salt, nowIso()],
  );
}

export async function checkPassword(phone: string, password: string) {
  const row = await get<{ user_id: string; password_hash: string; password_salt: string }>(
    `SELECT c.user_id, c.password_hash, c.password_salt FROM auth_credentials c JOIN users u ON u.id = c.user_id WHERE u.phone = ?`,
    [normalisePhone(phone)],
  );
  if (!row) {
    // Keep unknown phone numbers from being distinguishable by response time.
    verifyPassword(password, DUMMY_CREDENTIALS.salt, DUMMY_CREDENTIALS.hash);
    return null;
  }
  if (!verifyPassword(password, row.password_salt, row.password_hash)) return null;
  return row.user_id;
}

export async function hasPassword(userId: string) {
  return Boolean(await get<{ user_id: string }>("SELECT user_id FROM auth_credentials WHERE user_id = ?", [userId]));
}

export async function checkPasswordById(userId: string, password: string) {
  const row = await get<{ password_hash: string; password_salt: string }>(
    "SELECT password_hash, password_salt FROM auth_credentials WHERE user_id = ?",
    [userId],
  );
  if (!row) return false;
  return verifyPassword(password, row.password_salt, row.password_hash);
}

export async function createSession(userId: string) {
  const user = await get<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [userId]);
  if (!user) throw unauthorized();
  if (user.status !== "active") throw forbidden("This account is not active.");
  const token = randomToken(32);
  await run(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, revoked_at, user_agent) VALUES (?, ?, ?, ?, NULL, NULL)`,
    [sha256(token), user.id, nowIso(), addHours(new Date(), config.sessionTtlHours).toISOString()],
  );
  await auditFrom({ userId: user.id, role: user.role, name: user.name }, "auth.login", "user", user.id);
  return sessionPayload(token, user);
}

export async function listUsers(role?: Role) {
  // Keep bulk admin responses lean: avatars are only returned for the user's own session.
  const columns = "id, role, name, phone, email, status";
  const rows = role
    ? await all<Omit<UserRow, "avatarDataUrl">>(`SELECT ${columns} FROM users WHERE role = ? ORDER BY created_at DESC`, [role])
    : await all<Omit<UserRow, "avatarDataUrl">>(`SELECT ${columns} FROM users ORDER BY created_at DESC`);
  return rows;
}

function sessionPayload(token: string, user: UserRow) {
  return {
    token,
    user: {
      id: user.id,
      role: user.role,
      name: user.name,
      phone: user.phone,
      email: user.email,
      avatarUrl: user.avatarDataUrl,
    },
  };
}
