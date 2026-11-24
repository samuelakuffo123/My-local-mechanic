import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.SMS_PROVIDER;
  delete process.env.ARKESEL_API_KEY;
  delete process.env.SMS_SENDER_ID;
  delete process.env.NODE_ENV;
});

test("Arkesel adapter delivers an OTP without exposing the code", async () => {
  process.env.NODE_ENV = "production";
  process.env.SMS_PROVIDER = "arkesel";
  process.env.ARKESEL_API_KEY = "test-api-key";
  process.env.SMS_SENDER_ID = "MechNow";

  let captured: { url: string; init: RequestInit } | undefined;
  globalThis.fetch = (async (input, init) => {
    captured = { url: String(input), init: init ?? {} };
    return new Response(JSON.stringify({ status: "success", data: { id: "msg_123" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const { sendOtp } = await import("../sms.ts");
  const result = await sendOtp("+233244000001", "123456");

  assert.equal(result.delivered, true);
  assert.equal(result.providerRef, "msg_123");
  assert.equal(result.devCode, undefined);
  assert.equal(captured?.url, "https://sms.arkesel.com/api/v2/sms/send");

  const headers = captured?.init.headers as Record<string, string>;
  assert.equal(headers["api-key"], "test-api-key");

  const payload = JSON.parse(String(captured?.init.body));
  assert.deepEqual(payload.recipients, ["+233244000001"]);
  assert.match(payload.message, /123456/);
});
