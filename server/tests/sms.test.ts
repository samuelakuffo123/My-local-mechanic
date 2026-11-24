import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

// The test suite must not inherit SMS credentials from a developer's .env.
process.env.NODE_ENV = "test";
process.env.SMS_PROVIDER = "console";

const originalFetch = globalThis.fetch;

type MutableSmsConfig = {
  smsProvider: string;
  smsSenderId: string;
  arkeselApiKey: string;
  otpTtlMinutes: number;
};

let mutableConfig: MutableSmsConfig | null = null;
let originalConfig: MutableSmsConfig | null = null;

async function useArkeselConfig(apiKey = "  test-api-key  ") {
  const { config } = await import("../config.ts");
  mutableConfig = config as MutableSmsConfig;
  originalConfig ??= { ...mutableConfig };
  Object.assign(mutableConfig, {
    smsProvider: "arkesel",
    smsSenderId: "MechNow",
    arkeselApiKey: apiKey,
    otpTtlMinutes: 5,
  });
}

function mockFetch(responses: Array<{ status?: number; body: Record<string, unknown> }>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let index = 0;
  globalThis.fetch = (async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

function silenceLogs() {
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = () => undefined;
  console.warn = () => undefined;
  return () => {
    console.error = originalError;
    console.warn = originalWarn;
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (mutableConfig && originalConfig) Object.assign(mutableConfig, originalConfig);
});

test("environment secrets are trimmed at the config boundary", async () => {
  const { trimmedEnv } = await import("../config.ts");
  assert.equal(trimmedEnv("  test-api-key \n"), "test-api-key");
  assert.equal(trimmedEnv(undefined), "");
});

test("Arkesel OTP generate uses the OTP endpoint and a %otp_code% slot", async () => {
  await useArkeselConfig();

  const calls = mockFetch([{ body: { code: "1000", message: "Successful", data: { id: "otp_123" } } }]);
  const { deliverOtp, providerManagesOtp } = await import("../sms.ts");

  assert.equal(providerManagesOtp(), true);
  const result = await deliverOtp("+233244000001", "123456");

  assert.equal(result.providerRef, "otp_123");
  assert.equal(result.managed, true);
  assert.equal(result.devCode, undefined, "provider-managed codes are never returned to the client");
  assert.equal(calls[0]?.url, "https://sms.arkesel.com/api/otp/generate");

  const headers = calls[0]?.init.headers as Record<string, string>;
  assert.equal(headers["api-key"], "test-api-key", "padded secrets are trimmed before the request");

  const payload = JSON.parse(String(calls[0]?.init.body));
  assert.equal(payload.number, "233244000001", "OTP API uses digits only, without +");
  assert.equal(payload.length, 6);
  assert.equal(payload.expiry, 5);
  assert.equal(payload.medium, "sms");
  assert.equal(payload.type, "numeric");
  assert.equal(payload.sender_id, "MechNow");
  assert.match(payload.message, /%otp_code%/, "Arkesel must insert its own generated code");
});

test("invalid OTP keys fall back to Arkesel's legacy SMS endpoint with a local code", async () => {
  await useArkeselConfig();
  const restoreLogs = silenceLogs();
  try {
    const calls = mockFetch([
      { status: 401, body: { message: "Invalid key" } },
      { body: { code: "ok", message: "Successfully Sent" } },
    ]);
    const { deliverOtp } = await import("../sms.ts");

    const result = await deliverOtp("+233244000001", "482913");

    assert.equal(calls[0]?.url, "https://sms.arkesel.com/api/otp/generate");
    const legacy = new URL(calls[1]?.url ?? "");
    assert.equal(legacy.origin + legacy.pathname, "https://sms.arkesel.com/sms/api");
    assert.equal(legacy.searchParams.get("action"), "send-sms");
    assert.equal(legacy.searchParams.get("api_key"), "test-api-key");
    assert.equal(legacy.searchParams.get("to"), "233244000001");
    assert.equal(legacy.searchParams.get("from"), "MechNow");
    assert.match(legacy.searchParams.get("sms") ?? "", /482913/);

    assert.equal(result.managed, false, "legacy SMS codes are verified locally");
    assert.match(result.providerRef, /^arkesel-sms-/);
    assert.equal(result.devCode, undefined);
  } finally {
    restoreLogs();
  }
});

test("Arkesel verify maps success, invalid and expired codes safely", async () => {
  await useArkeselConfig("test-api-key");

  const calls = mockFetch([
    { body: { code: "1100", message: "Successful" } },
    { body: { code: "1104", message: "Invalid code" } },
    { body: { code: "1105", message: "Code has expired" } },
  ]);
  const { AppError } = await import("../errors.ts");
  const { verifyProviderOtp, PROVIDER_OTP_INVALID } = await import("../sms.ts");

  await verifyProviderOtp("+233244000001", "123456");

  await assert.rejects(
    verifyProviderOtp("+233244000001", "000000"),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.status, 400);
      assert.equal(error.code, PROVIDER_OTP_INVALID);
      assert.equal(error.message, "That code is incorrect.");
      return true;
    },
  );

  await assert.rejects(
    verifyProviderOtp("+233244000001", "999999"),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.status, 400);
      assert.equal(error.code, "otp_expired");
      assert.equal(error.message, "That code has expired. Request a new one.");
      return true;
    },
  );

  assert.equal(calls.length, 3);
  assert.equal(calls[0]?.url, "https://sms.arkesel.com/api/otp/verify");
  assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {
    code: "123456",
    number: "233244000001",
  });
});

test("credential and gateway failures become safe structured 503s", async () => {
  await useArkeselConfig("test-api-key");
  const restoreLogs = silenceLogs();
  try {
    const { AppError } = await import("../errors.ts");
    const { deliverOtp } = await import("../sms.ts");

    mockFetch([
      { status: 401, body: { code: "401", message: "Invalid key" } },
      { status: 401, body: { code: "102", message: "Authentication Failed" } },
    ]);
    await assert.rejects(
      deliverOtp("+233244000001", "123456"),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.status, 503);
        assert.equal(error.code, "sms_invalid_key");
        assert.equal(error.message, "We couldn't send your verification code. Try again in a moment.");
        assert.doesNotMatch(error.message, /Invalid key/i, "provider details stay out of the browser response");
        return true;
      },
    );

    mockFetch([{ body: { code: "1004", message: "SMS gateway not active or credential not found" } }]);
    await assert.rejects(
      deliverOtp("+233244000001", "123456"),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.status, 503);
        assert.equal(error.code, "sms_unconfigured");
        return true;
      },
    );
  } finally {
    restoreLogs();
  }
});
