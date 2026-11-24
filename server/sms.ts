import { config, isProduction } from "./config.ts";
import { AppError } from "./errors.ts";

// OTP delivery boundary.
//
// Local development uses the "console" adapter: MechNow generates the code,
// logs it and returns devCode so the UI can show it.
//
// Production tries Arkesel's OTP API first, where Arkesel generates and
// verifies the code. Some Arkesel accounts only have a key for the older
// plain-SMS API; in that case MechNow generates its own code, sends it through
// the legacy endpoint and verifies it locally. Plaintext codes are never
// returned to the browser in production.

export interface OtpRequestResult {
  providerRef: string;
  /** True when Arkesel generated (and will verify) the code. */
  managed: boolean;
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

function logArkeselFailure(action: string, detail: string) {
  // Keep the provider's reason in server logs for diagnostics, but never send
  // raw gateway text (which can contain account details) to the browser.
  console.error(`[sms] Arkesel ${action} failed: ${detail.slice(0, 200)}`);
}

function arkeselFailure(action: string, detail: string): AppError {
  logArkeselFailure(action, detail);
  return new AppError(SMS_UNAVAILABLE, 503, "sms_provider_failed");
}

function arkeselCredentialFailure(action: string, detail: string): AppError {
  logArkeselFailure(action, detail);
  return new AppError(SMS_UNAVAILABLE, 503, "sms_invalid_key");
}

function invalidPhone(): AppError {
  return new AppError(PHONE_ERROR, 400, "otp_invalid_phone");
}

function responseCode(data: ArkeselResponse | null): string {
  const value = data?.code ?? data?.status;
  return value === undefined || value === null ? "" : String(value).trim();
}

/** Arkesel's OTP and legacy SMS APIs expect digits only, with no leading +. */
function arkeselNumber(phone: string): string {
  return phone.replace(/^\+/, "");
}

function isCredentialFailure(code: string, detail: string): boolean {
  return code === "401" || code === "102" || /invalid key|authentication failed/i.test(detail);
}

async function arkeselPost(path: string, payload: Record<string, unknown>): Promise<ArkeselResponse> {
  const apiKey = config.arkeselApiKey.trim();
  if (!apiKey) throw smsNotConfigured();

  const action = path.includes("verify") ? "verify" : "generate";
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
    throw arkeselFailure(action, "gateway unreachable");
  }

  let data: ArkeselResponse | null = null;
  try {
    data = (await response.json()) as ArkeselResponse;
  } catch {
    // A non-JSON error body still produces a useful HTTP error below.
  }

  const code = responseCode(data);
  if (!response.ok || code === "401") {
    const detail = code === "401" ? "invalid api key" : data?.message ?? `HTTP ${response.status}`;
    if (isCredentialFailure(code, detail)) throw arkeselCredentialFailure(action, detail);
    throw arkeselFailure(action, detail);
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
      if (isCredentialFailure(code, detail)) return arkeselCredentialFailure("generate", detail);
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
    managed: true,
  };
}

/**
 * Older Arkesel accounts may only have a key for the plain-SMS endpoint:
 *   https://sms.arkesel.com/sms/api?action=send-sms&api_key=...&to=...&from=...&sms=...
 * MechNow generates the code and verifies it locally in this mode.
 */
async function arkeselLegacySms(phone: string, code: string): Promise<string> {
  const apiKey = config.arkeselApiKey.trim();
  if (!apiKey) throw smsNotConfigured();

  const expiry = Math.min(10, Math.max(1, Math.trunc(config.otpTtlMinutes) || 5));
  const message = `MechNow: your verification code is ${code}. It expires in ${expiry} minutes. Never share this code.`;
  const url = new URL("https://sms.arkesel.com/sms/api");
  url.searchParams.set("action", "send-sms");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("to", arkeselNumber(phone));
  url.searchParams.set("from", config.smsSenderId.trim().slice(0, 11) || "MechNow");
  url.searchParams.set("sms", message);

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw arkeselFailure("send", "gateway unreachable");
  }

  const raw = await response.text();
  let data: ArkeselResponse | null = null;
  try {
    data = JSON.parse(raw) as ArkeselResponse;
  } catch {
    // Plain-text success responses are accepted when HTTP status is OK.
  }

  const codeValue = responseCode(data).toLowerCase();
  const messageValue = data?.message ?? raw;
  if (!response.ok || (codeValue && codeValue !== "ok" && !codeValue.startsWith("success"))) {
    if (isCredentialFailure(codeValue, messageValue)) throw arkeselCredentialFailure("send", messageValue);
    throw arkeselFailure("send", messageValue);
  }

  return `arkesel-sms-${Date.now()}`;
}

/** True when the configured OTP adapter can verify codes through the provider. */
export function providerManagesOtp(): boolean {
  return config.smsProvider === "arkesel";
}

/** Sends an OTP, trying provider-managed OTP first when Arkesel is configured. */
export async function deliverOtp(phone: string, code?: string): Promise<OtpRequestResult> {
  if (config.smsProvider === "console") {
    if (isProduction) throw smsNotConfigured();
    if (!code) throw new Error("Local OTP delivery requires a generated code.");
    const body = `MechNow: your verification code is ${code}. It expires in ${config.otpTtlMinutes} minutes. Never share this code.`;
    // eslint-disable-next-line no-console
    console.log(`[sms:console] to=${phone} body="${body}"`);
    return { providerRef: `console-${Date.now()}`, managed: false, devCode: code };
  }

  if (config.smsProvider === "arkesel") {
    // Always have a local code ready in case the OTP API rejects the key.
    if (!code) throw new Error("Arkesel fallback requires a locally generated code.");
    try {
      return await arkeselGenerate(phone);
    } catch (error) {
      if (error instanceof AppError && error.code === "sms_invalid_key") {
        console.warn("[sms] Arkesel OTP API rejected the key; using the legacy SMS API with a local code.");
        const providerRef = await arkeselLegacySms(phone, code);
        return { providerRef, managed: false };
      }
      throw error;
    }
  }

  console.error(`[sms] Unknown SMS provider: ${config.smsProvider}`);
  throw smsNotConfigured();
}

/**
 * Verifies a provider-managed code. Local and legacy-SMS codes are verified
 * against the local hash in auth.ts, so this is a no-op in those modes.
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
