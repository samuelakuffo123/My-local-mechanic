import { apiRequest } from "./api";
import type { User } from "../state/types";

export const authService = {
  login: async (identifier: string, password: string) =>
    (await apiRequest<{ user: User }>("/auth/login", { method: "POST", body: { identifier, password } })).user,
  signup: async (input: { name: string; phone: string; email: string; password: string }) =>
    (await apiRequest<{ user: User }>("/auth/register", { method: "POST", body: input })).user,
  me: async () => (await apiRequest<{ user: User }>("/auth/me")).user,
  logout: () => apiRequest<{ ok: boolean }>("/auth/logout", { method: "POST", body: {} }),
};
