import { Router } from "express";
import { userProfilesCollection, ledgersCollection } from "@workspace/firebase";

const router = Router();

function serializeTimestamp(value: any): any {
  if (value && typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return value;
}

router.get("/wallet", async (req, res) => {
  try {
    const uid = req.user!.uid;
    const profileDoc = await userProfilesCollection.doc(uid).get();
    
    let currentBalance = 0;
    
    if (profileDoc.exists) {
      const data = profileDoc.data() || {};
      currentBalance = data.currentBalance || 0;
    } else {
      await userProfilesCollection.doc(uid).set({ currentBalance: 0 }, { merge: true });
    }

    return res.json({ currentBalance });
  } catch (err: any) {
    console.error("Error fetching wallet balance:", err);
    return res.status(500).json({ error: "Failed to fetch wallet balance" });
  }
});

router.get("/wallet/history", async (req, res) => {
  try {
    const uid = req.user!.uid;
    
    const ledgersSnapshot = await ledgersCollection(uid)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();
      
    const ledgers = ledgersSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
         id: doc.id,
         type: data.type || "topup",
         amount: data.amount || 0,
         balanceAfter: data.balanceAfter || 0,
         description: data.description || "",
         metadata: data.metadata || {},
         createdAt: serializeTimestamp(data.createdAt) || new Date().toISOString()
      };
    });
    
    return res.json({ ledgers });
  } catch (err: any) {
    console.error("Error fetching ledger history:", err);
    return res.status(500).json({ error: "Failed to fetch ledger history" });
  }
});

export default router;
