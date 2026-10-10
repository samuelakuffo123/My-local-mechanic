import { config, isProduction } from "./config.ts";

// SMS / WhatsApp delivery boundary.
//
// P0 ships a "console" adapter that logs the message. Before production you
// MUST configure a real provider (e.g. a Ghanaian SMS gateway or WhatsApp
// Business API) and set SMS_PROVIDER accordingly. The OTP is never returned to
// the client except in the dev adapter below, and never in production.

export interface SmsMessage {
  to: string;
  body: string;
}

export interface SmsResult {
  delivered: boolean;
  providerRef?: string;
  devCode?: string;
}

function consoleAdapter(message: SmsMessage, devCode?: string): SmsResult {
  // eslint-disable-next-line no-console
  console.log(`[sms:console] to=${message.to} body="${message.body}"`);
  return { delivered: true, providerRef: `console-${Date.now()}`, devCode };
}

export async function sendOtp(phone: string, code: string): Promise<SmsResult> {
  const body = `${config.smsSenderId}: your verification code is ${code}. It expires in ${config.otpTtlMinutes} minutes. Never share this code.`;
  return send({ to: phone, body }, code);
}

export async function sendSms(message: SmsMessage): Promise<SmsResult> {
  return send(message);
}

async function send(message: SmsMessage, devCode?: string): Promise<SmsResult> {
  if (isProduction && config.smsProvider === "console") {
    throw new Error("SMS provider not configured for production. Set SMS_PROVIDER and credentials.");
  }
  switch (config.smsProvider) {
    case "console":
      return consoleAdapter(message, devCode);
    default:
      // Wire the real provider here. Until then, fail loudly rather than
      // silently pretending a code was delivered.
      throw new Error(`Unknown SMS_PROVIDER "${config.smsProvider}". Configure a delivery adapter before production.`);
  }
}
