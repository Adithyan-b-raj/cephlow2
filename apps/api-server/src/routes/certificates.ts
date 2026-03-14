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
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const batchId = req.query.batchId as string | undefined;
    const status = req.query.status as string | undefined;

    if (batchId) {
      // Verify batch ownership
      const batchDoc = await batchesCollection.doc(batchId).get();
      if (!batchDoc.exists) return res.status(404).json({ error: "Batch not found" });
      if (batchDoc.data()?.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

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

    // If no batchId, collect from all of the user's batches
    const batchesSnapshot = await batchesCollection.where("userId", "==", userId).get();
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
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    res.json({ certificates: allCerts, total: allCerts.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
