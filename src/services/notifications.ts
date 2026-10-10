import { apiRequest } from "./http";
import { bridge } from "./bridge";
import type { AppNotification } from "./apiTypes";

export interface NotificationService {
  list(): Promise<AppNotification[]>;
  markRead(id: string): Promise<void>;
}

const serverNotifications: NotificationService = {
  list: async () => (await apiRequest<{ items: AppNotification[] }>("/notifications")).items,
  markRead: (id) => apiRequest<void>(`/notifications/${id}/read`, { method: "POST" }),
};

const LOCAL_KEY = "mechnow-api:notifications";

function read(): AppNotification[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]") as AppNotification[];
  } catch {
    return [];
  }
}

const localNotifications: NotificationService = {
  list: async () => read(),
  markRead: async (id) => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(read().map((item) => (item.id === id ? { ...item, read: true } : item))));
  },
};

export const notificationService: NotificationService = bridge(serverNotifications, localNotifications);
