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

export function allRequests(status?: string) {
  const base = `SELECT r.ref, r.kind, r.status, r.region, r.created_at as createdAt, r.provider_id as providerId,
      u.name as customerName, p.business_name as providerName
    FROM service_requests r
    JOIN users u ON u.id = r.customer_id
    LEFT JOIN providers p ON p.id = r.provider_id`;
  const rows = status ? all(`${base} WHERE r.status = ? ORDER BY r.created_at DESC LIMIT 200`, [status]) : all(`${base} ORDER BY r.created_at DESC LIMIT 200`);
  return { items: rows };
}

export function platformMetrics() {
  const count = (sql: string, params: unknown[] = []) => Number((get<{ value: number }>(sql, params)?.value) ?? 0);
  return {
    users: count("SELECT COUNT(*) as value FROM users"),
    providers: {
      total: count("SELECT COUNT(*) as value FROM providers"),
      verified: count("SELECT COUNT(*) as value FROM providers WHERE status = 'verified'"),
      pending: count("SELECT COUNT(*) as value FROM providers WHERE status = 'pending'"),
      available: count("SELECT COUNT(*) as value FROM providers WHERE available = 1"),
    },
    requests: {
      total: count("SELECT COUNT(*) as value FROM service_requests"),
      open: count("SELECT COUNT(*) as value FROM service_requests WHERE status NOT IN ('completed','cancelled')"),
      completed: count("SELECT COUNT(*) as value FROM service_requests WHERE status = 'completed'"),
      cancelled: count("SELECT COUNT(*) as value FROM service_requests WHERE status = 'cancelled'"),
    },
    disputes: {
      open: count("SELECT COUNT(*) as value FROM disputes WHERE status = 'open'"),
      total: count("SELECT COUNT(*) as value FROM disputes"),
    },
    payments: {
      paidCount: count("SELECT COUNT(*) as value FROM payments WHERE status = 'paid'"),
      paidValueGhs: Number((get<{ value: number }>("SELECT COALESCE(SUM(amount_ghs),0) as value FROM payments WHERE status = 'paid'")?.value) ?? 0),
    },
    // Note: values are computed live; no fabricated targets or market claims.
    generatedAt: new Date().toISOString(),
  };
}

export function dispatchMonitor() {
  return all(
    `SELECT r.ref, r.kind, r.status, r.region, r.decline_count as declineCount, r.created_at as createdAt,
            p.business_name as providerName
     FROM service_requests r LEFT JOIN providers p ON p.id = r.provider_id
     WHERE r.status NOT IN ('completed','cancelled')
     ORDER BY r.created_at ASC LIMIT 100`,
  );
}

export { listAuditLogs };
