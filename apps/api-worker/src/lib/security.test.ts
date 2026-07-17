import { describe, it, expect } from "vitest";
import { normalizePhoneNumber, hasXssPayload, timingSafeEqual, verifyWhatsAppSignature } from "./security.js";

describe("security helpers", () => {
  describe("normalizePhoneNumber", () => {
    it("should normalize 10-digit Indian numbers with +91 prefix", () => {
      expect(normalizePhoneNumber("9876543210")).toBe("+919876543210");
      expect(normalizePhoneNumber(" 9876543210 ")).toBe("+919876543210");
    });

    it("should normalize 12-digit Indian numbers starting with 91", () => {
      expect(normalizePhoneNumber("919876543210")).toBe("+919876543210");
    });

    it("should keep valid E.164 numbers starting with +", () => {
      expect(normalizePhoneNumber("+919876543210")).toBe("+919876543210");
      expect(normalizePhoneNumber("+14155552671")).toBe("+14155552671");
    });

    it("should remove spaces, hyphens, and parentheses", () => {
      expect(normalizePhoneNumber("+91 (987) 654-3210")).toBe("+919876543210");
      expect(normalizePhoneNumber("987-654-3210")).toBe("+919876543210");
    });

    it("should reject invalid formats", () => {
      expect(() => normalizePhoneNumber("123")).toThrow("Invalid phone number");
      expect(() => normalizePhoneNumber("abc")).toThrow("Invalid phone number");
      expect(() => normalizePhoneNumber("+0123456789")).toThrow("Invalid phone number"); // starts with 0
      expect(() => normalizePhoneNumber("")).toThrow("Phone number cannot be empty");
    });
  });

  describe("hasXssPayload", () => {
    it("should detect HTML tags", () => {
      expect(hasXssPayload("<script>alert(1)</script>")).toBe(true);
      expect(hasXssPayload("<div>hello</div>")).toBe(true);
      expect(hasXssPayload("<img src=x onerror=alert(1)>")).toBe(true);
    });

    it("should detect javascript: protocol", () => {
      expect(hasXssPayload("javascript:alert(1)")).toBe(true);
    });

    it("should detect inline event handlers", () => {
      expect(hasXssPayload("hello onload=alert(1)")).toBe(true);
    });

    it("should allow safe strings", () => {
      expect(hasXssPayload("Simple Batch Name")).toBe(false);
      expect(hasXssPayload("Batch-123 & Co.")).toBe(false);
    });
  });

  describe("timingSafeEqual", () => {
    it("should return true for equal strings", () => {
      expect(timingSafeEqual("hello", "hello")).toBe(true);
      expect(timingSafeEqual("", "")).toBe(true);
    });

    it("should return false for unequal strings", () => {
      expect(timingSafeEqual("hello", "world")).toBe(false);
      expect(timingSafeEqual("hello", "hell")).toBe(false);
      expect(timingSafeEqual("hell", "hello")).toBe(false);
    });
  });

  describe("verifyWhatsAppSignature", () => {
    const secret = "test-whatsapp-secret-key-12345";
    const payload = '{"object":"whatsapp_business_account","entry":[]}';

    it("should verify valid signature", async () => {
      const encoder = new TextEncoder();
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signatureBuffer = await crypto.subtle.sign(
        "HMAC",
        cryptoKey,
        encoder.encode(payload)
      );
      const hexSignature = Array.from(new Uint8Array(signatureBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const header = `sha256=${hexSignature}`;
      const verified = await verifyWhatsAppSignature(header, payload, secret);
      expect(verified).toBe(true);
    });

    it("should reject tampered payload or signature", async () => {
      const verified = await verifyWhatsAppSignature("sha256=invalidhex", payload, secret);
      expect(verified).toBe(false);

      const verified2 = await verifyWhatsAppSignature("sha256=0000000000000000000000000000000000000000000000000000000000000000", payload, secret);
      expect(verified2).toBe(false);
    });

    it("should reject missing/invalid prefix", async () => {
      const verified = await verifyWhatsAppSignature("someprefix=hex", payload, secret);
      expect(verified).toBe(false);
    });
  });
});
