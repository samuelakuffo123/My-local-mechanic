import { config, isProduction } from "./config.ts";
import { AppError } from "./errors.ts";

// OTP delivery boundary.
//
// Local development uses the "console" adapter: MechNow generates the code,
// logs it and returns devCode so the UI can show it. Production uses Arkesel's
// OTP API, which generates and verifies the code itself. In that mode MechNow
// never sees the plaintext code and never returns it to the browser.

export interface OtpRequestResult {
  providerRef: string;
  devCode?: string;
}

export const PROVIDER_OTP_INVALID = "otp_invalid";

interface ArkeselResponse {
  code?: string | number;
  status?: string | number;
  message?: string;
  data?: {
    id?: string;
    message_id?: string;
  };
}

const SMS_NOT_CONFIGURED = "SMS verification isn't configured for this server. Contact support.";
const SMS_UNAVAILABLE = "We couldn't send your verification code. Try again in a moment.";
const PHONE_ERROR = "Enter a valid Ghanaian phone number, like 024 123 4567.";

function smsNotConfigured(): AppError {
  return new AppError(SMS_NOT_CONFIGURED, 503, "sms_unconfigured");
}

function arkeselFailure(action: "generate" | "verify", detail: string): AppError {
  // Keep the provider's reason in server logs for diagnostics, but never send
  // raw gateway text (which can contain account details) to the browser.
  console.error(`[sms] Arkesel ${action} failed: ${detail.slice(0, 200)}`);
  return new AppError(SMS_UNAVAILABLE, 503, "sms_provider_failed");
}

function invalidPhone(): AppError {
  return new AppError(PHONE_ERROR, 400, "otp_invalid_phone");
}

function responseCode(data: ArkeselResponse | null): string {
  const value = data?.code ?? data?.status;
  return value === undefined || value === null ? "" : String(value).trim();
}

/** Arkesel's OTP API expects digits only, with no leading +. */
function arkeselNumber(phone: string): string {
  return phone.replace(/^\+/, "");
}

async function arkeselPost(path: string, payload: Record<string, unknown>): Promise<ArkeselResponse> {
  const apiKey = config.arkeselApiKey.trim();
  if (!apiKey) throw smsNotConfigured();

  let response: Response;
  try {
    response = await fetch(`https://sms.arkesel.com${path}`, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw arkeselFailure(path.includes("verify") ? "verify" : "generate", "gateway unreachable");
  }

  let data: ArkeselResponse | null = null;
  try {
    data = (await response.json()) as ArkeselResponse;
  } catch {
    // A non-JSON error body still produces a useful HTTP error below.
  }

  const code = responseCode(data);
  if (!response.ok || code === "401") {
    throw arkeselFailure(
      path.includes("verify") ? "verify" : "generate",
      code === "401" ? "invalid api key" : data?.message ?? `HTTP ${response.status}`,
    );
  }
  return data ?? {};
}

function generateFailure(data: ArkeselResponse): AppError {
  const code = responseCode(data);
  const detail = `${code || "unknown"}: ${data?.message ?? "no message"}`;
  switch (code) {
    case "1004":
      // SMS gateway not active or credential not found. Usually a Multiple
      // API Key was used where OTP requires the Main SMS API Key.
      return smsNotConfigured();
    case "1005":
      return invalidPhone();
    case "1001":
    case "1002":
    case "1003":
    case "1006":
    case "1007":
    case "1008":
    case "1011":
    default:
      return arkeselFailure("generate", detail);
  }
}

async function arkeselGenerate(phone: string): Promise<OtpRequestResult> {
  const expiry = Math.min(10, Math.max(1, Math.trunc(config.otpTtlMinutes) || 5));
  const senderId = config.smsSenderId.trim().slice(0, 11) || "MechNow";

  const data = await arkeselPost("/api/otp/generate", {
    expiry,
    length: 6,
    medium: "sms",
    // Arkesel replaces this slot with the code it generated.
    message: "MechNow code: %otp_code%. Valid %expiry% mins. Never share it.",
    number: arkeselNumber(phone),
    sender_id: senderId,
    type: "numeric",
  });

  if (responseCode(data) !== "1000") throw generateFailure(data);
  return {
    providerRef: String(data.data?.id ?? data.data?.message_id ?? `arkesel-otp-${Date.now()}`),
  };
}

/** True when the provider generates and verifies the code, not MechNow. */
export function providerManagesOtp(): boolean {
  return config.smsProvider === "arkesel";
}

/**
 * Sends an OTP. For the console adapter, `code` is required. For Arkesel it is
 * omitted because the OTP API generates the code server-side.
 */
export async function deliverOtp(phone: string, code?: string): Promise<OtpRequestResult> {
  if (config.smsProvider === "console") {
    if (isProduction) throw smsNotConfigured();
    if (!code) throw new Error("Local OTP delivery requires a generated code.");
    const body = `MechNow: your verification code is ${code}. It expires in ${config.otpTtlMinutes} minutes. Never share this code.`;
    // eslint-disable-next-line no-console
    console.log(`[sms:console] to=${phone} body="${body}"`);
    return { providerRef: `console-${Date.now()}`, devCode: code };
  }

  if (config.smsProvider === "arkesel") return await arkeselGenerate(phone);

  console.error(`[sms] Unknown SMS provider: ${config.smsProvider}`);
  throw smsNotConfigured();
}

/**
 * Verifies a provider-managed code. The console adapter has no remote check;
 * MechNow validates its own hash in auth.ts.
 */
export async function verifyProviderOtp(phone: string, code: string): Promise<void> {
  if (!providerManagesOtp()) return;

  const data = await arkeselPost("/api/otp/verify", {
    code,
    number: arkeselNumber(phone),
  });
  const result = responseCode(data);

  if (result === "1100") return;
  if (result === "1005" || result === "1102" || result === "1103") throw invalidPhone();
  if (result === "1104") throw new AppError("That code is incorrect.", 400, PROVIDER_OTP_INVALID);
  if (result === "1105") throw new AppError("That code has expired. Request a new one.", 400, "otp_expired");
  throw arkeselFailure("verify", `${result || "unknown"}: ${data?.message ?? "no message"}`);
}
