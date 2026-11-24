import { config, isProduction } from "./config.ts";

// SMS delivery boundary.
//
// Local development uses the "console" adapter, which logs the message and
// returns devCode so the UI can show it. Production uses a real provider.
// The OTP is never returned to the client from a real provider.

export interface SmsMessage {
  to: string;
  body: string;
}

export interface SmsResult {
  delivered: boolean;
  providerRef?: string;
  devCode?: string;
}

interface ArkeselResponse {
  status?: string;
  message?: string;
  data?: {
    id?: string;
    message_id?: string;
  };
}

function consoleAdapter(message: SmsMessage, devCode?: string): SmsResult {
  // eslint-disable-next-line no-console
  console.log(`[sms:console] to=${message.to} body="${message.body}"`);
  return { delivered: true, providerRef: `console-${Date.now()}`, devCode };
}

async function arkeselAdapter(message: SmsMessage): Promise<SmsResult> {
  if (!config.arkeselApiKey) {
    throw new Error("ARKESEL_API_KEY is required when SMS_PROVIDER is arkesel.");
  }

  const response = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
    method: "POST",
    headers: {
      "api-key": config.arkeselApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: config.smsSenderId,
      message: message.body,
      recipients: [message.to],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  let data: ArkeselResponse | null = null;
  try {
    data = (await response.json()) as ArkeselResponse;
  } catch {
    // A non-JSON error body still produces a useful HTTP error below.
  }

  if (!response.ok || data?.status?.toLowerCase() !== "success") {
    const detail = data?.message ?? data?.status ?? `HTTP ${response.status}`;
    throw new Error(`Arkesel SMS delivery failed: ${detail}`);
  }

  return {
    delivered: true,
    providerRef: data?.data?.id ?? data?.data?.message_id ?? `arkesel-${Date.now()}`,
  };
}

export async function sendOtp(phone: string, code: string): Promise<SmsResult> {
  const body = `${config.smsSenderId}: your verification code is ${code}. It expires in ${config.otpTtlMinutes} minutes. Never share this code.`;
  return await send({ to: phone, body }, code);
}

export async function sendSms(message: SmsMessage): Promise<SmsResult> {
  return await send(message);
}

async function send(message: SmsMessage, devCode?: string): Promise<SmsResult> {
  if (config.smsProvider === "console") {
    if (isProduction) {
      throw new Error("SMS provider not configured for production. Set SMS_PROVIDER and credentials.");
    }
    return consoleAdapter(message, devCode);
  }

  switch (config.smsProvider) {
    case "arkesel":
      return await arkeselAdapter(message);
    default:
      // Fail loudly rather than silently pretending a code was delivered.
      throw new Error(`Unknown SMS_PROVIDER "${config.smsProvider}". Configure a delivery adapter before production.`);
  }
}
