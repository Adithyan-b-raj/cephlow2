import { describe, it, expect } from "vitest";
import { emailToSlug } from "./cert-utils.js";

describe("emailToSlug", () => {
  it("should convert email prefix to a clean URL-friendly slug", () => {
    expect(emailToSlug("John.Doe+tag@example.com")).toBe("johndoe-tag");
    expect(emailToSlug("abc@xyz.com")).toBe("abc");
  });

  it("should return fallback for invalid or empty emails", () => {
    expect(emailToSlug("")).toBe("user");
    expect(emailToSlug(".@example.com")).toBe("user");
  });
});
