import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authService, hasStoredToken } from "../services/auth";
import { clearToken } from "../services/http";
import { ApiError } from "../services/mockApi";
import { notificationService } from "../services/notifications";
import { vehicleService } from "../services/vehicles";
import type { ProviderProfile } from "../services/apiTypes";
import { transitionEmergency, type EmergencyRequest, type EmergencyStatus } from "./emergencyMachine";
import type { CartItem, Notification, Theme, User, Vehicle } from "./types";

interface AppState {
  user: User | null;
  provider: ProviderProfile | null;
  authenticated: boolean;
  ready: boolean;
  activeVehicle: Vehicle | null;
  emergencyRequest: EmergencyRequest | null;
  cart: CartItem[];
  notifications: Notification[];
  theme: Theme;
  hydrate: () => Promise<void>;
  signIn: (user: User) => Promise<void>;
  signOut: () => Promise<void>;
  setVehicle: (vehicle: Vehicle | null) => void;
  updateEmergency: (details: Pick<EmergencyRequest, "problem" | "location" | "providerId">) => void;
  startEmergency: () => void;
  transitionEmergency: (status: EmergencyStatus) => void;
  clearEmergency: () => void;
  setCart: (items: CartItem[]) => void;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => void;
  setTheme: (theme: Theme) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      provider: null,
      authenticated: false,
      ready: false,
      activeVehicle: null,
      emergencyRequest: null,
      cart: [],
      notifications: [],
      theme: "light",

      hydrate: async () => {
        if (!hasStoredToken()) {
          set({ ready: true, authenticated: false, user: null, provider: null });
          return;
        }
        try {
          const { user, provider } = await authService.me();
          const vehicles = await vehicleService.list();
          set({
            user,
            provider,
            authenticated: true,
            ready: true,
            activeVehicle: vehicles.find((item) => item.primary) ?? vehicles[0] ?? null,
          });
          void get().refreshNotifications();
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            clearToken();
            set({ ready: true, authenticated: false, user: null, provider: null });
            return;
          }
          throw error;
        }
      },

      signIn: async (user) => {
        set({ user, authenticated: true, ready: true });
        try {
          const { provider } = await authService.me();
          const vehicles = await vehicleService.list();
          set({ provider, activeVehicle: vehicles.find((item) => item.primary) ?? vehicles[0] ?? null });
        } catch {
          // Profile enrichment is best-effort; the session itself is valid.
        }
        void get().refreshNotifications();
      },

      signOut: async () => {
        try {
          await authService.logout();
        } finally {
          set({
            user: null,
            provider: null,
            authenticated: false,
            activeVehicle: null,
            emergencyRequest: null,
            cart: [],
            notifications: [],
          });
        }
      },

      setVehicle: (activeVehicle) => set({ activeVehicle }),
      updateEmergency: (details) => {
        const request = get().emergencyRequest;
        if (!request) throw new Error("No active emergency request");
        set({ emergencyRequest: { ...request, ...details, updatedAt: new Date().toISOString() } });
      },
      startEmergency: () => {
        const now = new Date().toISOString();
        set({ emergencyRequest: { id: crypto.randomUUID(), status: "choosingProblem", createdAt: now, updatedAt: now } });
      },
      transitionEmergency: (status) => {
        const request = get().emergencyRequest;
        if (!request) throw new Error("No active emergency request");
        set({ emergencyRequest: transitionEmergency(request, status) });
      },
      clearEmergency: () => set({ emergencyRequest: null }),
      setCart: (cart) => set({ cart }),

      refreshNotifications: async () => {
        try {
          const items = await notificationService.list();
          set({ notifications: items.map((item) => ({ id: item.id, title: item.title, body: item.body, createdAt: item.createdAt, read: item.read })) });
        } catch {
          // Notifications are non-critical for sign-in.
        }
      },

      markNotificationRead: (id) => {
        void notificationService.markRead(id).catch(() => undefined);
        set(({ notifications }) => ({ notifications: notifications.map((item) => (item.id === id ? { ...item, read: true } : item)) }));
      },

      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "mechnow-app-state",
      version: 3,
      partialize: (state) => ({ theme: state.theme, cart: state.cart }),
      migrate: (persistedState, version) => {
        const state = persistedState as Partial<AppState>;
        return { theme: "light", cart: version >= 2 ? state.cart ?? [] : [] };
      },
    },
  ),
);
