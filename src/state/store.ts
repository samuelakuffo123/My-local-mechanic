import { create } from "zustand";
import { persist } from "zustand/middleware";
import { seedNotifications, seedUser, seedVehicle } from "./seed";
import { transitionEmergency, type EmergencyRequest, type EmergencyStatus } from "./emergencyMachine";
import type { CartItem, Notification, Theme, User, Vehicle } from "./types";

interface AppState {
  user: User | null;
  authenticated: boolean;
  activeVehicle: Vehicle | null;
  emergencyRequest: EmergencyRequest | null;
  cart: CartItem[];
  notifications: Notification[];
  theme: Theme;
  signIn: (user: User) => void;
  signOut: () => void;
  setVehicle: (vehicle: Vehicle | null) => void;
  startEmergency: () => void;
  transitionEmergency: (status: EmergencyStatus) => void;
  clearEmergency: () => void;
  setCart: (items: CartItem[]) => void;
  markNotificationRead: (id: string) => void;
  setTheme: (theme: Theme) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: seedUser,
      authenticated: true,
      activeVehicle: seedVehicle,
      emergencyRequest: null,
      cart: [],
      notifications: seedNotifications,
      theme: "dark",
      signIn: (user) => set({ user, authenticated: true }),
      signOut: () => set({ user: null, authenticated: false }),
      setVehicle: (activeVehicle) => set({ activeVehicle }),
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
      markNotificationRead: (id) => set(({ notifications }) => ({ notifications: notifications.map((item) => item.id === id ? { ...item, read: true } : item) })),
      setTheme: (theme) => set({ theme }),
    }),
    { name: "mechnow-app-state" },
  ),
);
