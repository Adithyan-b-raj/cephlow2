import { Hono } from "hono";

const router = new Hono<ContextEnv>();

interface WaReport {
  id: number;
  phone: string;
  cert_key?: string;
  message: string;
  created_at: string;
}

router.get("/reports", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const workerUrl = c.env.WA_WORKER_URL;
  const token = c.env.WA_ANALYTICS_TOKEN;

  if (!workerUrl || !token) {
    return c.json({ error: "Reports not configured." }, 503);
  }

  try {
    const waUrl = `${workerUrl.replace(/\/$/, "")}/reports?token=${token}`;
    const waRes = await fetch(waUrl);
    if (!waRes.ok) throw new Error(`WA worker responded ${waRes.status}`);

    const allReports = (await waRes.json()) as WaReport[];

    if (allReports.length === 0) {
      return c.json([]);
    }

    // Query user's batches
    const { results: batches } = await c.env.DB.prepare(`
      SELECT id FROM batches WHERE user_id = ?
    `).bind(user.uid).all<{ id: string }>();

    if (batches.length === 0) {
      return c.json([]);
    }

    const batchIds = batches.map(b => b.id);
    const placeholders = batchIds.map(() => "?").join(",");

    // Query certificates belonging to user's batches
    const { results: certs } = await c.env.DB.prepare(`
      SELECT r2_pdf_url FROM certificates
      WHERE batch_id IN (${placeholders}) AND r2_pdf_url IS NOT NULL
    `).bind(...batchIds).all<{ r2_pdf_url: string }>();

    if (certs.length === 0) {
      return c.json([]);
    }

    const r2Urls = new Set(certs.map(c => c.r2_pdf_url));

    // Filter reports matching user's certificates
    const filtered = allReports.filter((r) => {
      if (!r.cert_key) return false;
      for (const url of r2Urls) {
        if (url.endsWith(r.cert_key)) return true;
      }
      return false;
    });

    return c.json(filtered);
  } catch (err: any) {
    console.error("[reports] fetch failed:", err.message);
    return c.json({ error: "Failed to load reports." }, 500);
  }
});

export default router;
