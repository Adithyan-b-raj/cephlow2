import { google } from "googleapis";
import { db } from "@workspace/firebase";
import crypto from "crypto";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/presentations",
];

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

// Generate auth URL and store a pending nonce in Firestore (expires in 10 min)
export async function generateAuthUrl(uid: string): Promise<string> {
  const nonce = crypto.randomBytes(16).toString("hex");
  await db.collection("pendingGoogleAuth").doc(nonce).set({
    uid,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: nonce,
  });
}

// Exchange authorization code for tokens and store the refresh token in Firestore
export async function handleCallback(code: string, state: string): Promise<void> {
  const doc = await db.collection("pendingGoogleAuth").doc(state).get();
  if (!doc.exists) throw new Error("Invalid or expired state parameter");

  const { uid, expiresAt } = doc.data()!;
  await doc.ref.delete();

  if (Date.now() > expiresAt) throw new Error("Auth session expired. Please try again.");

  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      "No refresh token returned. Revoke app access at myaccount.google.com/permissions and try again."
    );
  }

  await db.collection("userGoogleTokens").doc(uid).set({
    refreshToken: tokens.refresh_token,
    updatedAt: Date.now(),
  });
}

// Check if a user has a stored Google refresh token
export async function hasGoogleToken(uid: string): Promise<boolean> {
  const doc = await db.collection("userGoogleTokens").doc(uid).get();
  return doc.exists;
}

// Get an authenticated OAuth2 client for a user using their stored refresh token
export async function getAuthClientForUser(uid: string) {
  const doc = await db.collection("userGoogleTokens").doc(uid).get();
  if (!doc.exists) {
    const err: any = new Error("Google account not connected. Please reconnect via the app.");
    err.code = "GOOGLE_NOT_CONNECTED";
    throw err;
  }

  const { refreshToken } = doc.data()!;
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}
