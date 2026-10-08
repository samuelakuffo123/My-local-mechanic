import { mockRequest, readPersisted, writePersisted, ApiError } from "./mockApi";
import type { Role, User } from "../state/types";

interface Account extends User { password: string }

export const authService = {
  login: (phone: string, password: string) => mockRequest(() => {
    const accounts = readPersisted<Account[]>("accounts", []);
    const account = accounts.find((item) => item.phone === phone && item.password === password);
    if (!account) throw new ApiError("The phone number or password is incorrect.", 401);
    const { password: _, ...user } = account;
    return user;
  }),
  signup: (input: { name: string; phone: string; email: string; password: string; role: Role }) => mockRequest(() => {
    const accounts = readPersisted<Account[]>("accounts", []);
    if (accounts.some((item) => item.phone === input.phone)) throw new ApiError("An account already uses this phone number.", 409);
    const account: Account = { ...input, id: crypto.randomUUID() };
    writePersisted("accounts", [...accounts, account]);
    const { password: _, ...user } = account;
    return user;
  }),
  requestOtp: (phone: string) => mockRequest(() => ({ phone, expiresAt: Date.now() + 5 * 60_000 })),
  verifyOtp: (code: string) => mockRequest(() => {
    if (code !== "246810") throw new ApiError("That code is incorrect. Try again.", 400);
    return true;
  }),
};
