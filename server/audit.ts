import { all, get, run } from "./db.ts";
import { newId, nowIso } from "./util.ts";
import type { AuthContext } from "./http.ts";

export async function writeAudit(input: {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await run(
    `INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      input.actorId ?? null,
      input.actorRole ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      nowIso(),
    ],
  );
}

export async function auditFrom(auth: AuthContext | null, action: string, entityType: string, entityId?: string, metadata?: Record<string, unknown>) {
  await writeAudit({ actorId: auth?.userId ?? null, actorRole: auth?.role ?? null, action, entityType, entityId, metadata });
}

export async function listAuditLogs(limit = 100) {
  return await (await all(
    `SELECT id, actor_id as "actorId", actor_role as "actorRole", action, entity_type as "entityType",
            entity_id as "entityId", metadata, created_at as "createdAt"
     FROM audit_logs ORDER BY created_at DESC LIMIT ?`,
    [limit],
  )).map((row) => ({ ...row, metadata: row.metadata ? JSON.parse(String(row.metadata)) : null }));
}

export async function auditCount() {
  return Number((await (await get<{ count: number }>(`SELECT COUNT(*) as "count" FROM audit_logs`))?.count) ?? 0);
}
