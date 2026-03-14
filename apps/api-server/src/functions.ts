import { onRequest } from "firebase-functions/v2/https";
import app from "./app.js";

// Export the Express app as a Firebase Cloud Function
export const api = onRequest({
  timeoutSeconds: 300, // 5 minutes (helpful for certificate generation)
  memory: "512MiB",
}, app);
