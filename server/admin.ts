import { all, get } from "./db.ts";
import { forbidden, unauthorized } from "./errors.ts";
import { listAuditLogs } from "./audit.ts";
import type { AuthContext } from "./http.ts";

export function assertAdmin(auth: AuthContext | null): AuthContext {
  if (!auth) throw unauthorized();
  if (auth.role !== "admin") throw forbidden("Administrator access required.");
  return auth;
}

export function requireAdmin<T>(auth: AuthContext | null, work: () => T): T {
  assertAdmin(auth);
  return work();
}

export async function allRequests(status?: string) {
  const base = `SELECT r.ref, r.kind, r.status, r.region, r.created_at as "createdAt", r.provider_id as "providerId",
      u.name as "customerName", p.business_name as "providerName"
    FROM service_requests r
    JOIN users u ON u.id = r.customer_id
    LEFT JOIN providers p ON p.id = r.provider_id`;
  const rows = status ? await all(`${base} WHERE r.status = ? ORDER BY r.created_at DESC LIMIT 200`, [status]) : await all(`${base} ORDER BY r.created_at DESC LIMIT 200`);
  return { items: rows };
}

export async function platformMetrics() {
  const count = async (sql: string, params: unknown[] = []) => Number((await (await get<{ value: number }>(sql, params))?.value) ?? 0);
  return {
    users: await count(`SELECT COUNT(*) as "value" FROM users`),
    providers: {
      total: await count(`SELECT COUNT(*) as "value" FROM providers`),
      verified: await count(`SELECT COUNT(*) as "value" FROM providers WHERE status = 'verified'`),
      pending: await count(`SELECT COUNT(*) as "value" FROM providers WHERE status = 'pending'`),
      available: await count(`SELECT COUNT(*) as "value" FROM providers WHERE available = 1`),
    },
    requests: {
      total: await count(`SELECT COUNT(*) as "value" FROM service_requests`),
      open: await count(`SELECT COUNT(*) as "value" FROM service_requests WHERE status NOT IN ('completed','cancelled')`),
      completed: await count(`SELECT COUNT(*) as "value" FROM service_requests WHERE status = 'completed'`),
      cancelled: await count(`SELECT COUNT(*) as "value" FROM service_requests WHERE status = 'cancelled'`),
    },
    disputes: {
      open: await count(`SELECT COUNT(*) as "value" FROM disputes WHERE status = 'open'`),
      total: await count(`SELECT COUNT(*) as "value" FROM disputes`),
    },
    payments: {
      paidCount: await count(`SELECT COUNT(*) as "value" FROM payments WHERE status = 'paid'`),
      paidValueGhs: Number((await (await get<{ value: number }>(`SELECT COALESCE(SUM(amount_ghs),0) as "value" FROM payments WHERE status = 'paid'`))?.value) ?? 0),
    },
    // Note: values are computed live; no fabricated targets or market claims.
    generatedAt: new Date().toISOString(),
  };
}

export async function dispatchMonitor() {
  return await all(
    `SELECT r.ref, r.kind, r.status, r.region, r.decline_count as "declineCount", r.created_at as "createdAt",
            p.business_name as "providerName"
     FROM service_requests r LEFT JOIN providers p ON p.id = r.provider_id
     WHERE r.status NOT IN ('completed','cancelled')
     ORDER BY r.created_at ASC LIMIT 100`,
  );
}

export { listAuditLogs };
