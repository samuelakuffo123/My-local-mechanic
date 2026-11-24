import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = ":memory:";
process.env.SMS_PROVIDER = "console";
process.env.OTP_TTL_MINUTES = "10";

test("a still-valid earlier code works after a resend", async () => {
  const { openDatabase } = await import("../db.ts");
  const { config } = await import("../config.ts");
  const auth = await import("../auth.ts");
  openDatabase(":memory:");

  assert.equal(config.otpTtlMinutes, 10, "codes stay valid long enough for slow SMS delivery");

  const first = await auth.requestOtp("0244000091", "127.0.0.1");
  const second = await auth.requestOtp("0244000091", "127.0.0.1");
  assert.ok(first.devCode, "the console adapter exposes a code outside production");
  assert.ok(second.devCode, "the resend also has a code");

  // The first message may arrive after the user already asked for another one.
  const session = await auth.verifyOtp("0244000091", first.devCode, { name: "Late OTP" });
  assert.equal(session.user.phone, "+233244000091");

  // Using one code retires every other pending code for that number.
  await assert.rejects(
    auth.verifyOtp("0244000091", second.devCode, { name: "Stale OTP" }),
    /Request a verification code first/,
  );
});
