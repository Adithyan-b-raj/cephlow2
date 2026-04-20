/**
 * One-time migration script: Firestore → Supabase PostgreSQL
 *
 * Run with app OFFLINE:
 *   cd scripts
 *   npx tsx migrate-firestore-to-supabase.ts
 *
 * Requires env vars:
 *   FIREBASE_SERVICE_ACCOUNT_KEY  (JSON string or file path)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { initializeApp, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// ─── Init Firebase Admin ────────────────────────────────────────────────────

let serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountKey) {
  try {
    serviceAccountKey = readFileSync(
      resolve(import.meta.dirname, "..", "firebase-service-account.json"),
      "utf-8"
    );
  } catch {
    // not found
  }
}
if (!serviceAccountKey) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY not found");

const firebaseApp = initializeApp({ credential: cert(JSON.parse(serviceAccountKey) as ServiceAccount) });
const db = getFirestore(firebaseApp);
const firebaseAuth = getAuth(firebaseApp);

// ─── Init Supabase Admin ────────────────────────────────────────────────────

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Helper ─────────────────────────────────────────────────────────────────

function toIso(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, retries = 5, baseDelayMs = 2000): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isQuota = err?.code === 8 || String(err?.message).includes("RESOURCE_EXHAUSTED") || String(err?.message).includes("Quota");
      if (isQuota && attempt < retries) {
        const wait = baseDelayMs * attempt;
        log(`  QUOTA hit — waiting ${wait}ms before retry ${attempt}/${retries}...`);
        await delay(wait);
      } else {
        throw err;
      }
    }
  }
  throw new Error("withRetry exhausted");
}

// ─── Step 1: Build Firebase UID → Supabase UUID mapping ─────────────────────

async function buildUserMapping(): Promise<Map<string, string>> {
  log("Step 1: Building Firebase UID → Supabase UUID mapping...");
  const map = new Map<string, string>();

  // Fetch all existing Supabase users upfront and index by email
  const supabaseByEmail = new Map<string, string>();
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) {
      if (u.email) supabaseByEmail.set(u.email.toLowerCase(), u.id);
    }
    if (data.users.length < 1000) break;
    page++;
  }
  log(`  Found ${supabaseByEmail.size} existing Supabase users.`);

  // Walk all Firebase users
  let nextPageToken: string | undefined;
  do {
    const result = await firebaseAuth.listUsers(1000, nextPageToken);
    for (const fbUser of result.users) {
      const email = fbUser.email;
      if (!email) {
        log(`  WARN: Firebase user ${fbUser.uid} has no email — skipping`);
        continue;
      }

      const existing = supabaseByEmail.get(email.toLowerCase());
      if (existing) {
        map.set(fbUser.uid, existing);
        log(`  Mapped (existing): ${email} → ${existing}`);
      } else {
        // Create Supabase user
        const { data: created, error } = await supabase.auth.admin.createUser({
          email,
          email_confirm: true,
        });
        if (error || !created?.user) {
          log(`  ERROR: Could not create Supabase user for ${email}: ${error?.message}`);
          continue;
        }
        map.set(fbUser.uid, created.user.id);
        supabaseByEmail.set(email.toLowerCase(), created.user.id);
        log(`  Mapped (created): ${email} → ${created.user.id}`);
      }
    }
    nextPageToken = result.pageToken;
  } while (nextPageToken);

  log(`Step 1 done: ${map.size} users mapped.`);
  return map;
}

// ─── Step 2: Migrate userProfiles → user_profiles ───────────────────────────

async function migrateUserProfiles(uidMap: Map<string, string>) {
  log("Step 2: Migrating userProfiles → user_profiles...");
  const snapshot = await db.collection("userProfiles").get();
  let count = 0;
  for (const doc of snapshot.docs) {
    const supabaseUid = uidMap.get(doc.id);
    if (!supabaseUid) { log(`  SKIP: no mapping for Firebase UID ${doc.id}`); continue; }
    const data = doc.data();
    const { error } = await supabase.from("user_profiles").upsert({
      id: supabaseUid,
      current_balance: data.currentBalance ?? 0,
    }, { onConflict: "id" });
    if (error) log(`  ERROR user_profiles ${doc.id}: ${error.message}`);
    else count++;
  }
  log(`Step 2 done: ${count}/${snapshot.size} user profiles migrated.`);
}

// ─── Step 3: Migrate userGoogleTokens → user_google_tokens ──────────────────

async function migrateGoogleTokens(uidMap: Map<string, string>) {
  log("Step 3: Migrating userGoogleTokens → user_google_tokens...");
  const snapshot = await db.collection("userGoogleTokens").get();
  let count = 0;
  for (const doc of snapshot.docs) {
    const supabaseUid = uidMap.get(doc.id);
    if (!supabaseUid) { log(`  SKIP: no mapping for Firebase UID ${doc.id}`); continue; }
    const data = doc.data();
    const { error } = await supabase.from("user_google_tokens").upsert({
      user_id: supabaseUid,
      refresh_token: data.refreshToken,
      updated_at: new Date(data.updatedAt || Date.now()).toISOString(),
    }, { onConflict: "user_id" });
    if (error) log(`  ERROR user_google_tokens ${doc.id}: ${error.message}`);
    else count++;
  }
  log(`Step 3 done: ${count}/${snapshot.size} Google tokens migrated.`);
}

// ─── Step 4: Migrate batches + certificates ──────────────────────────────────

async function migrateBatchesAndCerts(uidMap: Map<string, string>) {
  log("Step 4: Migrating batches + certificates...");
  const batchMap = new Map<string, string>(); // firestoreBatchId → supabaseBatchId
  const certMap = new Map<string, string>();  // firestoreCertId  → supabaseCertId

  // Clear any partially migrated batch data so re-runs are clean
  log("  Clearing existing batches from Supabase (cascade deletes certs)...");
  await supabase.from("batches").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  const batchSnapshot = await withRetry(() => db.collection("batches").get());
  log(`  Found ${batchSnapshot.size} batches in Firestore.`);

  for (const batchDoc of batchSnapshot.docs) {
    const bd = batchDoc.data();
    const supabaseUid = uidMap.get(bd.userId);
    if (!supabaseUid) {
      log(`  SKIP batch ${batchDoc.id}: no mapping for userId ${bd.userId}`);
      continue;
    }

    const { data: inserted, error: batchErr } = await supabase
      .from("batches")
      .insert({
        user_id: supabaseUid,
        name: bd.name,
        sheet_id: bd.sheetId,
        sheet_name: bd.sheetName,
        tab_name: bd.tabName ?? null,
        template_id: bd.templateId,
        template_name: bd.templateName,
        column_map: bd.columnMap ?? {},
        email_column: bd.emailColumn,
        name_column: bd.nameColumn,
        email_subject: bd.emailSubject ?? null,
        email_body: bd.emailBody ?? null,
        category_column: bd.categoryColumn ?? null,
        category_template_map: bd.categoryTemplateMap ?? null,
        category_slide_map: bd.categorySlideMap ?? null,
        category_slide_indexes: bd.categorySlideIndexes ?? null,
        status: bd.status ?? "draft",
        drive_folder_id: bd.driveFolderId ?? null,
        pdf_folder_id: bd.pdfFolderId ?? null,
        total_count: bd.totalCount ?? 0,
        generated_count: bd.generatedCount ?? 0,
        sent_count: bd.sentCount ?? 0,
        whatsapp_sent_count: bd.whatsappSentCount ?? 0,
        failed_count: bd.failedCount ?? 0,
        created_at: toIso(bd.createdAt) ?? new Date().toISOString(),
      })
      .select("id")
      .single();

    if (batchErr || !inserted) {
      log(`  ERROR inserting batch ${batchDoc.id}: ${batchErr?.message}`);
      continue;
    }

    const supabaseBatchId = inserted.id;
    batchMap.set(batchDoc.id, supabaseBatchId);
    log(`  Batch migrated: ${bd.name} → ${supabaseBatchId}`);

    // Migrate certificates subcollection
    await delay(150); // avoid Firestore rate limits
    const certSnapshot = await withRetry(() =>
      db.collection("batches").doc(batchDoc.id).collection("certificates").get()
    );

    const certRows = certSnapshot.docs.map((certDoc) => {
      const cd = certDoc.data();
      return {
        _firestoreId: certDoc.id,
        batch_id: supabaseBatchId,
        recipient_name: cd.recipientName,
        recipient_email: cd.recipientEmail ?? "",
        status: cd.status ?? "pending",
        slide_file_id: cd.slideFileId ?? null,
        slide_url: cd.slideUrl ?? null,
        pdf_file_id: cd.pdfFileId ?? null,
        pdf_url: cd.pdfUrl ?? null,
        r2_pdf_url: cd.r2PdfUrl ?? null,
        sent_at: toIso(cd.sentAt),
        error_message: cd.errorMessage ?? null,
        row_data: cd.rowData ?? null,
        is_paid: cd.isPaid ?? false,
        requires_visual_regen: cd.requiresVisualRegen ?? false,
        whatsapp_status: cd.whatsappStatus ?? null,
        whatsapp_message_id: cd.whatsappMessageId ?? null,
        created_at: toIso(cd.createdAt) ?? new Date().toISOString(),
        updated_at: toIso(cd.updatedAt) ?? new Date().toISOString(),
      };
    });

    // Insert in chunks to avoid request size limits
    const CHUNK = 100;
    for (let i = 0; i < certRows.length; i += CHUNK) {
      const chunk = certRows.slice(i, i + CHUNK);
      const insertRows = chunk.map(({ _firestoreId: _, ...row }) => row);
      const { data: insertedCerts, error: certErr } = await supabase
        .from("certificates")
        .insert(insertRows)
        .select("id, recipient_email");

      if (certErr) {
        log(`  ERROR inserting certs for batch ${batchDoc.id}: ${certErr.message}`);
        continue;
      }

      // Map Firestore cert IDs → Supabase cert IDs by position
      (insertedCerts || []).forEach((sc, idx) => {
        const firestoreId = chunk[idx]._firestoreId;
        certMap.set(firestoreId, sc.id);
      });
    }

    log(`    → ${certSnapshot.size} certs migrated for batch ${bd.name}`);
  }

  log(`Step 4 done: ${batchMap.size} batches, ${certMap.size} certs migrated.`);
  return { batchMap, certMap };
}

// ─── Step 5: Migrate studentProfiles + subcollection certs ───────────────────

async function migrateStudentProfiles(batchMap: Map<string, string>, certMap: Map<string, string>) {
  log("Step 5: Migrating studentProfiles → student_profiles...");
  const profileSnapshot = await db.collection("studentProfiles").get();
  let profileCount = 0;
  let spcCount = 0;

  for (const profileDoc of profileSnapshot.docs) {
    const pd = profileDoc.data();
    const slug = profileDoc.id;

    const { error: profileErr } = await supabase.from("student_profiles").upsert({
      slug,
      name: pd.name,
      email: pd.email,
      updated_at: toIso(pd.updatedAt) ?? new Date().toISOString(),
    }, { onConflict: "slug" });

    if (profileErr) { log(`  ERROR student_profiles ${slug}: ${profileErr.message}`); continue; }
    profileCount++;

    // Migrate subcollection certs
    await delay(100);
    const spcSnapshot = await withRetry(() =>
      db.collection("studentProfiles").doc(slug).collection("certs").get()
    );

    for (const spcDoc of spcSnapshot.docs) {
      const sc = spcDoc.data();
      const supabaseCertId = certMap.get(sc.certId ?? spcDoc.id) ?? null;
      const supabaseBatchId = batchMap.get(sc.batchId) ?? null;

      if (!supabaseCertId || !supabaseBatchId) {
        log(`  WARN: spc ${spcDoc.id} — could not resolve cert/batch IDs, skipping`);
        continue;
      }

      const { error: spcErr } = await supabase.from("student_profile_certs").upsert({
        profile_slug: slug,
        cert_id: supabaseCertId,
        batch_id: supabaseBatchId,
        batch_name: sc.batchName,
        recipient_name: sc.recipientName,
        r2_pdf_url: sc.r2PdfUrl ?? null,
        pdf_url: sc.pdfUrl ?? null,
        slide_url: sc.slideUrl ?? null,
        issued_at: toIso(sc.issuedAt) ?? new Date().toISOString(),
        status: sc.status ?? "generated",
      }, { onConflict: "profile_slug,cert_id" });

      if (spcErr) log(`  ERROR student_profile_certs ${spcDoc.id}: ${spcErr.message}`);
      else spcCount++;
    }
  }

  log(`Step 5 done: ${profileCount} profiles, ${spcCount} profile-certs migrated.`);
}

// ─── Step 6: Migrate studentProfileIndex → student_profile_index ─────────────

async function migrateStudentProfileIndex() {
  log("Step 6: Migrating studentProfileIndex → student_profile_index...");
  const snapshot = await db.collection("studentProfileIndex").get();
  let count = 0;
  for (const doc of snapshot.docs) {
    const { error } = await supabase.from("student_profile_index").upsert({
      email_key: doc.id,
      slug: doc.data().slug,
    }, { onConflict: "email_key" });
    if (error) log(`  ERROR student_profile_index ${doc.id}: ${error.message}`);
    else count++;
  }
  log(`Step 6 done: ${count}/${snapshot.size} index entries migrated.`);
}

// ─── Step 7: Migrate ledgers ──────────────────────────────────────────────────

async function migrateLedgers(uidMap: Map<string, string>) {
  log("Step 7: Migrating ledgers...");
  const profileSnapshot = await db.collection("userProfiles").get();
  let total = 0;
  for (const profileDoc of profileSnapshot.docs) {
    const supabaseUid = uidMap.get(profileDoc.id);
    if (!supabaseUid) continue;
    const ledgerSnapshot = await db
      .collection("userProfiles")
      .doc(profileDoc.id)
      .collection("ledgers")
      .get();

    for (const ledgerDoc of ledgerSnapshot.docs) {
      const ld = ledgerDoc.data();
      const { error } = await supabase.from("ledgers").upsert({
        id: ledgerDoc.id,
        user_id: supabaseUid,
        type: ld.type ?? "topup",
        amount: ld.amount ?? 0,
        balance_after: ld.balanceAfter ?? 0,
        description: ld.description ?? "",
        metadata: ld.metadata ?? null,
        created_at: toIso(ld.createdAt) ?? new Date().toISOString(),
      }, { onConflict: "id" });
      if (error) log(`  ERROR ledger ${ledgerDoc.id}: ${error.message}`);
      else total++;
    }
  }
  log(`Step 7 done: ${total} ledger entries migrated.`);
}

// ─── Step 8: Migrate waMessages → wa_messages ────────────────────────────────

async function migrateWaMessages(batchMap: Map<string, string>, certMap: Map<string, string>) {
  log("Step 8: Migrating waMessages → wa_messages...");
  const snapshot = await db.collection("waMessages").get();
  let count = 0;
  for (const doc of snapshot.docs) {
    const { batchId, certId } = doc.data() as { batchId: string; certId: string };
    const supabaseBatchId = batchMap.get(batchId);
    const supabaseCertId = certMap.get(certId);
    if (!supabaseBatchId || !supabaseCertId) {
      log(`  WARN: waMessage ${doc.id} — could not resolve IDs, skipping`);
      continue;
    }
    const { error } = await supabase.from("wa_messages").upsert({
      wamid: doc.id,
      batch_id: supabaseBatchId,
      cert_id: supabaseCertId,
    }, { onConflict: "wamid" });
    if (error) log(`  ERROR wa_messages ${doc.id}: ${error.message}`);
    else count++;
  }
  log(`Step 8 done: ${count}/${snapshot.size} WA messages migrated.`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log("=== Firestore → Supabase Migration START ===");

  const uidMap = await buildUserMapping();
  await migrateUserProfiles(uidMap);
  await migrateGoogleTokens(uidMap);
  const { batchMap, certMap } = await migrateBatchesAndCerts(uidMap);
  await migrateStudentProfiles(batchMap, certMap);
  await migrateStudentProfileIndex();
  await migrateLedgers(uidMap);
  await migrateWaMessages(batchMap, certMap);

  log("=== Migration COMPLETE ===");
  log("Next steps:");
  log("  1. Verify row counts in Supabase Table Editor");
  log("  2. Fill in your real SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in .env");
  log("  3. Start the app and test");
}

main().catch((err) => {
  console.error("Migration FAILED:", err);
  process.exit(1);
});
