import { Router, type IRouter } from "express";
import { batchesCollection, certificatesCollection, certIndexCollection, type Certificate } from "@workspace/firebase";

const router: IRouter = Router({ mergeParams: true });

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

    // If no batchId, collect from all of the user's batches in parallel
    const batchesSnapshot = await batchesCollection.where("userId", "==", userId).get();

    const certSnapshots = await Promise.all(
      batchesSnapshot.docs.map((batchDoc) => {
        let query: FirebaseFirestore.Query = certificatesCollection(batchDoc.id);
        if (status) {
          query = query.where("status", "==", status);
        }
        return query.get();
      })
    );

    const allCerts: any[] = certSnapshots.flatMap((certsSnapshot) =>
      certsSnapshot.docs.map((doc) => ({ id: doc.id, ...serializeDoc(doc.data()) }))
    );

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

/**
 * Public route to verify a certificate by ID (for QR scanning)
 * Mounted at /api/certificates/:certId/verify
 *
 * Fast path: look up batchId from certIndex/{certId} (2 reads total).
 * Fallback: scan all batches for backward compatibility with certs
 * generated before the index was introduced (writes to index when found).
 */
router.get("/", async (req, res) => {
  try {
    const { certId } = req.params;
    console.log(`Verifying certificate ID: ${certId}`);

    let foundCert: any = null;
    let foundBatch: any = null;

    // Fast path — check the index first
    const indexDoc = await certIndexCollection.doc(certId).get();
    if (indexDoc.exists) {
      const { batchId } = indexDoc.data() as { batchId: string };
      const [certDoc, batchDoc] = await Promise.all([
        certificatesCollection(batchId).doc(certId).get(),
        batchesCollection.doc(batchId).get(),
      ]);
      if (certDoc.exists && batchDoc.exists) {
        foundCert = certDoc.data();
        foundBatch = batchDoc.data();
        console.log(`Certificate found via index in batch: ${batchId}`);
      }
    }

    // Fallback — scan all batches (legacy certs not yet in the index)
    if (!foundCert) {
      console.log(`Index miss for ${certId}, falling back to full scan`);
      const batchesSnapshot = await batchesCollection.get();
      for (const batchDoc of batchesSnapshot.docs) {
        const certDoc = await certificatesCollection(batchDoc.id).doc(certId).get();
        if (certDoc.exists) {
          foundCert = certDoc.data();
          foundBatch = batchDoc.data();
          console.log(`Certificate found via scan in batch: ${batchDoc.id}`);
          // Backfill the index so future lookups are fast
          certIndexCollection.doc(certId).set({ batchId: batchDoc.id }).catch(() => {});
          break;
        }
      }
    }

    if (!foundCert || !foundBatch) {
      console.log(`Certificate ${certId} not found.`);
      return res.status(404).json({ error: "Certificate not found" });
    }

    res.json({
      valid: true,
      recipientName: foundCert.recipientName,
      batchName: foundBatch.name,
      issuedAt: serializeDoc(foundCert).createdAt,
      status: foundCert.status,
    });
  } catch (err: any) {
    console.error("Verification error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
