import { createHmac } from "node:crypto";
import { config, devPaymentsEnabled, isProduction } from "./config.ts";

// Payment gateway boundary. The platform never trusts the client to declare a
// payment successful; only a verified gateway response (webhook/settlement)
// marks a payment paid. The dev adapter exists solely for local development and
// is hard-disabled in production and unless ALLOW_DEV_PAYMENTS=true.

export interface ChargeIntentInput {
  amountGhs: number;
  reference: string;
  customerPhone: string;
  method: "momo" | "cash" | "card";
  description: string;
}

export interface ChargeIntent {
  providerName: string;
  providerRef: string;
  status: "pending" | "paid" | "failed";
  // For dev only. Never populated in production.
  devAuthorizationUrl?: string;
}

export interface RefundResult {
  providerRef: string;
  status: "processed" | "failed";
}

export interface PaymentGateway {
  name: string;
  createCharge(input: ChargeIntentInput): Promise<ChargeIntent>;
  refund(input: { providerRef: string; amountGhs: number; reason: string }): Promise<RefundResult>;
  verifyWebhook(rawBody: string, signature: string | undefined): boolean;
  parseWebhook(rawBody: string): { providerRef: string; status: "paid" | "failed" };
}

// ---------------------------------------------------------------------------
// Dev adapter
// ---------------------------------------------------------------------------

const devGateway: PaymentGateway = {
  name: "dev",
  async createCharge(input) {
    if (!devPaymentsEnabled) {
      throw new Error("Dev payments are disabled. Set PAYMENTS_PROVIDER and ALLOW_DEV_PAYMENTS for local testing only.");
    }
    return {
      providerName: "dev",
      providerRef: `dev_${input.reference}`,
      status: "pending",
      devAuthorizationUrl: `/dev/payments/authorize?ref=${encodeURIComponent(input.reference)}`,
    };
  },
  async refund() {
    return { providerRef: `dev_refund_${Date.now()}`, status: "processed" };
  },
  verifyWebhook() {
    return devPaymentsEnabled;
  },
  parseWebhook(rawBody) {
    const parsed = JSON.parse(rawBody || "{}") as { providerRef?: string; status?: "paid" | "failed" };
    return { providerRef: parsed.providerRef ?? "", status: parsed.status ?? "failed" };
  },
};

// ---------------------------------------------------------------------------
// Paystack adapter (mobile money collections in Ghana). Requires merchant
// credentials — see docs/DEPLOYMENT.md. Until configured it throws rather than
// faking success.
// ---------------------------------------------------------------------------

const paystackGateway: PaymentGateway = {
  name: "paystack",
  async createCharge(input) {
    if (!config.paystackSecretKey) throw new Error("PAYSTACK_SECRET_KEY is not configured.");
    const response = await fetch("https://api.paystack.co/charge", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.paystackSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: `${input.customerPhone}@mechnow.gh`,
        amount: Math.round(input.amountGhs * 100),
        currency: "GHS",
        reference: input.reference,
        mobile_money: input.method === "momo" ? { phone: input.customerPhone } : undefined,
        metadata: { description: input.description },
      }),
    });
    const payload = (await response.json()) as { status?: boolean; data?: { reference?: string; status?: string } };
    if (!response.ok || !payload.data?.reference) {
      throw new Error("Payment gateway rejected the charge request.");
    }
    return {
      providerName: "paystack",
      providerRef: payload.data.reference,
      status: payload.data.status === "success" ? "paid" : "pending",
    };
  },
  async refund(input) {
    if (!config.paystackSecretKey) throw new Error("PAYSTACK_SECRET_KEY is not configured.");
    const response = await fetch("https://api.paystack.co/refund", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.paystackSecretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ transaction: input.providerRef, amount: Math.round(input.amountGhs * 100) }),
    });
    return { providerRef: input.providerRef, status: response.ok ? "processed" : "failed" };
  },
  verifyWebhook(rawBody, signature) {
    if (!config.paystackWebhookSecret || !signature) return false;
    // Paystack signs with HMAC SHA512 of the raw body using the secret key.
    const expected = createHmac("sha512", config.paystackSecretKey).update(rawBody).digest("hex");
    return expected === signature;
  },
  parseWebhook(rawBody) {
    const parsed = JSON.parse(rawBody || "{}") as { data?: { reference?: string; status?: string } };
    return { providerRef: parsed.data?.reference ?? "", status: parsed.data?.status === "success" ? "paid" : "failed" };
  },
};

export function getGateway(): PaymentGateway {
  if (isProduction && config.paymentsProvider === "dev") {
    throw new Error("Refusing to run the dev payment adapter in production.");
  }
  switch (config.paymentsProvider) {
    case "dev":
      return devGateway;
    case "paystack":
      return paystackGateway;
    default:
      throw new Error(`Unknown PAYMENTS_PROVIDER "${config.paymentsProvider}".`);
  }
}
