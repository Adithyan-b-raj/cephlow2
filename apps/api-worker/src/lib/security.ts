/**
 * Security helper utilities for validation and sanitization.
 */

/**
 * Normalizes phone numbers to E.164 format (e.g., +91XXXXXXXXXX).
 * Throws an error if the phone number format is invalid.
 */
export function normalizePhoneNumber(phone: string): string {
  const trimmed = (phone || "").trim();
  if (!trimmed) {
    throw new Error("Phone number cannot be empty");
  }

  // Remove parentheses, hyphens, spaces, etc. Keep digits and leading plus.
  const cleaned = trimmed.replace(/[\s\-\(\)]/g, "");

  let normalized = cleaned;
  if (/^\d{10}$/.test(cleaned)) {
    // 10 digits: assume India (+91)
    normalized = `+91${cleaned}`;
  } else if (/^91\d{10}$/.test(cleaned)) {
    // 12 digits starting with 91
    normalized = `+${cleaned}`;
  } else if (/^\d{12}$/.test(cleaned) && !cleaned.startsWith("+")) {
    normalized = `+${cleaned}`;
  }

  // Final check for E.164 format (must start with + followed by 10 to 15 digits)
  if (!/^\+[1-9]\d{9,14}$/.test(normalized)) {
    throw new Error(`Invalid phone number format: ${trimmed}`);
  }

  return normalized;
}

/**
 * Validates string inputs for XSS payloads.
 * Returns true if potential XSS payload is detected.
 */
export function hasXssPayload(val: string): boolean {
  if (!val) return false;
  // Detect HTML tags, javascript: protocol, or common inline event handlers (onxxx=)
  const xssPattern = /<[^>]*>|javascript:|on\w+\s*=/i;
  return xssPattern.test(val);
}

/**
 * Performs a timing-safe string comparison.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Verifies a WhatsApp webhook payload signature against x-hub-signature-256 header.
 */
export async function verifyWhatsAppSignature(
  signatureHeader: string,
  rawBody: string,
  appSecret: string
): Promise<boolean> {
  try {
    if (!signatureHeader.startsWith("sha256=")) return false;
    const signature = signatureHeader.substring(7);

    const encoder = new TextEncoder();
    const keyBytes = encoder.encode(appSecret);
    const messageBytes = encoder.encode(rawBody);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      messageBytes
    );

    // Convert signatureBuffer to hex
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const computedSignature = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return timingSafeEqual(signature, computedSignature);
  } catch (err) {
    console.error("WhatsApp signature verification error:", err);
    return false;
  }
}
