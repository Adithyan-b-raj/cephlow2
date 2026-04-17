import { Router, type IRouter } from "express";
import { studentProfilesCollection, batchesCollection } from "@workspace/firebase";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

function serializeTimestamp(value: any): any {
  if (value && typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return value;
}

// Public endpoint — no auth required
router.get("/p/:username", async (req, res) => {
  try {
    const { username } = req.params;

    const profileDoc = await studentProfilesCollection.doc(username).get();

    if (!profileDoc.exists) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const profile = profileDoc.data()!;

    const certsSnapshot = await studentProfilesCollection
      .doc(username)
      .collection("certs")
      .orderBy("issuedAt", "desc")
      .get();

    const certificates = certsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        certId: data.certId,
        batchId: data.batchId,
        batchName: data.batchName,
        recipientName: data.recipientName,
        r2PdfUrl: data.r2PdfUrl ?? null,
        pdfUrl: data.pdfUrl ?? null,
        slideUrl: data.slideUrl ?? null,
        issuedAt: serializeTimestamp(data.issuedAt),
        status: data.status,
      };
    });

    return res.json({
      slug: profile.slug,
      name: profile.name,
      certificates,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Authenticated — issuer can edit a profile name if they issued at least one cert to this student
router.patch("/p/:username", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { username } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }

    const profileDoc = await studentProfilesCollection.doc(username as string).get();
    if (!profileDoc.exists) {
      return res.status(404).json({ error: "Profile not found" });
    }

    // Verify the requesting user issued at least one cert to this student
    const certsSnapshot = await studentProfilesCollection
      .doc(username as string)
      .collection("certs")
      .get();

    let authorized = false;
    for (const certDoc of certsSnapshot.docs) {
      const { batchId } = certDoc.data();
      const batchDoc = await batchesCollection.doc(batchId).get();
      if (batchDoc.exists && batchDoc.data()?.userId === userId) {
        authorized = true;
        break;
      }
    }

    if (!authorized) {
      return res.status(403).json({ error: "You have not issued any certificates to this student" });
    }

    await studentProfilesCollection.doc(username as string).update({ name: name.trim(), updatedAt: new Date() });

    return res.json({ success: true, name: name.trim() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
