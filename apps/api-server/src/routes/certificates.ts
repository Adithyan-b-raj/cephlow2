import { Router, type IRouter } from "express";
import { batchesCollection, certificatesCollection, type Certificate } from "@workspace/firebase";

const router: IRouter = Router();

/** Convert Firestore Timestamps to ISO strings for JSON serialization */
function serializeDoc(data: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && typeof value.toDate === "function") {
      result[key] = value.toDate().toISOString();
    } else {
      result[key] = value;
    }
  }
  return result;
}

// List certificates with optional filters
router.get("/certificates", async (req, res) => {
  try {
    const batchId = req.query.batchId as string | undefined;
    const status = req.query.status as string | undefined;

    if (batchId) {
      // Query certificates from a specific batch subcollection
      let query: FirebaseFirestore.Query = certificatesCollection(batchId);
      if (status) {
        query = query.where("status", "==", status);
      }
      const snapshot = await query.get();
      const certificates = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...serializeDoc(doc.data()),
      }));

      res.json({ certificates, total: certificates.length });
      return;
    }

    // If no batchId, collect from all batches
    const batchesSnapshot = await batchesCollection.get();
    const allCerts: any[] = [];

    for (const batchDoc of batchesSnapshot.docs) {
      let query: FirebaseFirestore.Query = certificatesCollection(batchDoc.id);
      if (status) {
        query = query.where("status", "==", status);
      }
      const certsSnapshot = await query.get();
      certsSnapshot.docs.forEach((doc) => {
        allCerts.push({ id: doc.id, ...serializeDoc(doc.data()) });
      });
    }

    // Sort by createdAt desc across all batches
    allCerts.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    res.json({ certificates: allCerts, total: allCerts.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
