import { describe, it, expect, vi } from "vitest";
import { upsertStudentProfile } from "./cert-utils.js";

describe("upsertStudentProfile", () => {
  it("should invoke DB prepare and bind statements correctly", async () => {
    const mockPrepare = vi.fn().mockReturnValue({
      bind: vi.fn().mockResolvedValue({}),
    });
    const mockDb = {
      prepare: mockPrepare,
      batch: vi.fn().mockResolvedValue([]),
    } as any;

    await upsertStudentProfile(mockDb, {
      email: "test@example.com",
      name: "Test User",
      certId: "cert-123",
      batchId: "batch-456",
      batchName: "Batch ABC",
      r2PdfUrl: null,
      pdfUrl: null,
      slideUrl: null,
      status: "issued",
    });

    expect(mockDb.batch).toHaveBeenCalled();
    expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO student_profiles"));
  });
});
