import { all, get, run } from "./db.ts";
import { newId, nowIso } from "./util.ts";

export interface NotificationRow {
  id: string;
  userId: string;
  title: string;
  body: string;
  read: number;
  createdAt: string;
}

export function notify(userId: string, title: string, body: string) {
  run(
    `INSERT INTO notifications (id, user_id, title, body, read, created_at) VALUES (?, ?, ?, ?, 0, ?)`,
    [newId(), userId, title, body, nowIso()],
  );
}

export function listNotifications(userId: string) {
  return all<NotificationRow>(
    `SELECT id, user_id as userId, title, body, read, created_at as createdAt
     FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    [userId],
  ).map((row) => ({ ...row, read: Boolean(row.read) }));
}

export function markRead(userId: string, id: string) {
  run("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?", [id, userId]);
  return get("SELECT id FROM notifications WHERE id = ? AND user_id = ?", [id, userId]) !== undefined;
}
