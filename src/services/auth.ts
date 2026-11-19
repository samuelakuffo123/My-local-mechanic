import { ApiError } from "./mockApi";
import { apiRequest, clearToken, getToken, setToken } from "./http";
import { bridge } from "./bridge";
import type { ProfileUpdate, ProviderProfile, Role, Session, User } from "./apiTypes";

interface VerifyInput {
  phone: string;
  code: string;
  name?: string;
  role?: Role;
}

interface RawUser {
  id: string;
  role: Role;
  name: string;
  phone: string;
  email: string | null;
  avatarUrl?: string | null;
}

function toUser(raw: RawUser): User {
  return {
    id: raw.id,
    role: raw.role,
    name: raw.name,
    phone: raw.phone,
    email: raw.email ?? "",
    avatarUrl: raw.avatarUrl ?? null,
  };
}

export interface GoogleConfig {
  enabled: boolean;
  clientId: string | null;
}

export interface AuthService {
  requestOtp(phone: string): Promise<{ devCode?: string; expiresAt: string }>;
  verifyOtp(input: VerifyInput): Promise<Session>;
  login(phone: string, password: string): Promise<Session>;
  googleConfig(): Promise<GoogleConfig>;
  signInWithGoogle(accessToken: string, role?: Role): Promise<Session>;
  logout(): Promise<void>;
  me(): Promise<{ user: User; provider: ProviderProfile | null }>;
  updateProfile(input: ProfileUpdate): Promise<User>;
}

const serverAuth: AuthService = {
  requestOtp: (phone) => apiRequest("/auth/otp/request", { method: "POST", auth: false, body: { phone } }),
  verifyOtp: async (input) => {
    const session = await apiRequest<{ token: string; user: RawUser }>("/auth/verify", {
      method: "POST",
      auth: false,
      body: { phone: input.phone, code: input.code, name: input.name, role: input.role },
    });
    setToken(session.token);
    return { token: session.token, user: toUser(session.user) };
  },
  login: async (phone, password) => {
    const session = await apiRequest<{ token: string; user: RawUser }>("/auth/login", { method: "POST", auth: false, body: { phone, password } });
    setToken(session.token);
    return { token: session.token, user: toUser(session.user) };
  },
  googleConfig: () => apiRequest<GoogleConfig>("/auth/google/config", { auth: false }),
  signInWithGoogle: async (accessToken, role) => {
    const session = await apiRequest<{ token: string; user: RawUser }>("/auth/google", {
      method: "POST",
      auth: false,
      body: { accessToken, role },
    });
    setToken(session.token);
    return { token: session.token, user: toUser(session.user) };
  },
  logout: async () => {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } finally {
      clearToken();
    }
  },
  me: async () => {
    const result = await apiRequest<{ user: RawUser; provider: ProviderProfile | null }>("/me");
    return { user: toUser(result.user), provider: result.provider };
  },
  updateProfile: async (input) => {
    const user = await apiRequest<RawUser>("/me", { method: "PATCH", body: input });
    return toUser(user);
  },
};

const LOCAL_ACCOUNTS = "mechnow-api:accounts";
const LOCAL_SESSION = "mechnow-api:session";
const DEV_CODE = "246810";

interface LocalAccount extends User {
  password: string;
}

function readAccounts(): LocalAccount[] {
  try {
    const accounts = JSON.parse(localStorage.getItem(LOCAL_ACCOUNTS) ?? "[]") as LocalAccount[];
    return accounts.map((account) => ({ ...account, avatarUrl: account.avatarUrl ?? null }));
  } catch {
    return [];
  }
}

function writeAccounts(accounts: LocalAccount[]) {
  localStorage.setItem(LOCAL_ACCOUNTS, JSON.stringify(accounts));
}

const localAuth: AuthService = {
  requestOtp: async () => ({ devCode: DEV_CODE, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() }),
  verifyOtp: async ({ phone, code, name, role }) => {
    if (code !== DEV_CODE) throw new ApiError("That code is incorrect. Try again.", 400);
    const accounts = readAccounts();
    let account = accounts.find((item) => item.phone === phone);
    if (!account) {
      account = { id: crypto.randomUUID(), name: name?.trim() || "New customer", phone, email: "", role: role ?? "driver", avatarUrl: null, password: "" };
      writeAccounts([...accounts, account]);
    }
    const token = `local-${crypto.randomUUID()}`;
    setToken(token);
    localStorage.setItem(LOCAL_SESSION, JSON.stringify({ token, userId: account.id }));
    const { password: _password, ...user } = account;
    return { token, user };
  },
  login: async (phone, password) => {
    const account = readAccounts().find((item) => item.phone === phone && (!item.password || item.password === password));
    if (!account) throw new ApiError("The phone number or password is incorrect.", 401);
    const token = `local-${crypto.randomUUID()}`;
    setToken(token);
    localStorage.setItem(LOCAL_SESSION, JSON.stringify({ token, userId: account.id }));
    const { password: _password, ...user } = account;
    return { token, user };
  },
  googleConfig: async () => ({ enabled: false, clientId: null }),
  signInWithGoogle: async () => {
    throw new ApiError("Google sign-in needs the MechNow API. Use your phone number instead.", 400);
  },
  logout: async () => {
    localStorage.removeItem(LOCAL_SESSION);
    clearToken();
  },
  me: async () => {
    const raw = localStorage.getItem(LOCAL_SESSION);
    if (!raw) throw new ApiError("Sign in to continue.", 401);
    const { userId } = JSON.parse(raw) as { userId: string };
    const account = readAccounts().find((item) => item.id === userId);
    if (!account) throw new ApiError("Sign in to continue.", 401);
    const { password: _password, ...user } = account;
    return { user, provider: null };
  },
  updateProfile: async (input) => {
    const raw = localStorage.getItem(LOCAL_SESSION);
    if (!raw) throw new ApiError("Sign in to continue.", 401);
    const { userId } = JSON.parse(raw) as { userId: string };
    const accounts = readAccounts();
    const index = accounts.findIndex((item) => item.id === userId);
    if (index < 0) throw new ApiError("Sign in to continue.", 401);
    const account = accounts[index];
    const name = input.name === undefined ? account.name : input.name.trim();
    if (!name) throw new ApiError("Name is required.", 400);
    const updated: LocalAccount = {
      ...account,
      name,
      email: input.email === undefined ? account.email : input.email?.trim() || "",
      avatarUrl: input.avatarUrl === undefined ? account.avatarUrl : input.avatarUrl,
    };
    accounts[index] = updated;
    writeAccounts(accounts);
    const { password: _password, ...user } = updated;
    return user;
  },
};

export const authService: AuthService = bridge(serverAuth, localAuth);

export function hasStoredToken(): boolean {
  return getToken() !== null;
}
