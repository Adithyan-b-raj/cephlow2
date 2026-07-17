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
