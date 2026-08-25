import test from "node:test";
import assert from "node:assert/strict";
import { sendPasswordResetEmail } from "./mail.ts";

test("dev without Resend logs the reset link instead of sending", async () => {
  const prevKey = process.env.RESEND_API_KEY;
  const prevVercel = process.env.VERCEL;
  const prevNode = process.env.NODE_ENV;
  delete process.env.RESEND_API_KEY;
  delete process.env.VERCEL;
  process.env.NODE_ENV = "test";
  try {
    assert.equal(await sendPasswordResetEmail("dev@quantora.test", "https://example.test/reset"), true);
  } finally {
    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    process.env.NODE_ENV = prevNode;
  }
});

test("production without Resend fails closed and does not pretend mail was sent", async () => {
  const prevKey = process.env.RESEND_API_KEY;
  const prevVercel = process.env.VERCEL;
  const prevNode = process.env.NODE_ENV;
  delete process.env.RESEND_API_KEY;
  process.env.VERCEL = "1";
  process.env.NODE_ENV = "production";
  try {
    assert.equal(await sendPasswordResetEmail("prod@quantora.test", "https://example.test/reset"), false);
  } finally {
    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    process.env.NODE_ENV = prevNode;
  }
});
