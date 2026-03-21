import app from "./app";

const port = Number(process.env["PORT"]) || 3000;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  console.log("[R2] Config check:", {
    R2_ACCOUNT_ID: !!process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: !!process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: !!process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || "(not set)",
  });
});
