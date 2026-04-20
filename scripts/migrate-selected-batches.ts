/**
 * Selective batch migration: Firestore → Supabase
 * Migrates only the batches listed in BATCH_NAMES below.
 *
 * Run from monorepo root:
 *   npx tsx --env-file=.env scripts/migrate-selected-batches.ts
 */

import { initializeApp, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const BATCH_NAMES = [
  "Prototype 2.0",
  "Xcepthon Coordinator",
  "Xcepthon Winners",
  "Xcepthon honors cert",
  "Xcepthon Participants cert",
];

// ─── Init Firebase Admin ────────────────────────────────────────────────────

let serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountKey) {
  try {
    serviceAccountKey = readFileSync(
      resolve(import.meta.dirname, "..", "firebase-service-account.json"),
      "utf-8"
    );
  } catch { /* not found */ }
}
if (!serviceAccountKey) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY not found");

const firebaseApp = initializeApp({ credential: cert(JSON.parse(serviceAccountKey) as ServiceAccount) });
const db = getFirestore(firebaseApp);
const firebaseAuth = getAuth(firebaseApp);

// ─── Init Supabase ──────────────────────────────────────────────────────────

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Helpers ────────────────────────────────────────────────────────────────

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
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, retries = 5, baseMs = 3000): Promise<T> {
  for (let i = 1; i <= retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      const isQuota = err?.code === 8 || String(err?.message).includes("RESOURCE_EXHAUSTED");
      if (isQuota && i < retries) {
        const wait = baseMs * i;
        log(`  QUOTA — waiting ${wait}ms (retry ${i}/${retries})...`);
        await delay(wait);
      } else throw err;
    }
  }
  throw new Error("withRetry exhausted");
}

// ─── Step 1: Build UID map for affected users only ──────────────────────────

async function buildUserMapping(firebaseUids: Set<string>): Promise<Map<string, string>> {
  log("Step 1: Building Firebase UID → Supabase UUID mapping...");

  // Fetch all existing Supabase users by email
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

  const map = new Map<string, string>();

  // Only process Firebase users that own the selected batches
  let nextPageToken: string | undefined;
  do {
    const result = await firebaseAuth.listUsers(1000, nextPageToken);
    for (const fbUser of result.users) {
      if (!firebaseUids.has(fbUser.uid)) continue;
      const email = fbUser.email;
      if (!email) { log(`  WARN: Firebase user ${fbUser.uid} has no email`); continue; }

      const existing = supabaseByEmail.get(email.toLowerCase());
      if (existing) {
        map.set(fbUser.uid, existing);
        log(`  Mapped: ${email} → ${existing}`);
      } else {
        const { data: created, error } = await supabase.auth.admin.createUser({ email, email_confirm: true });
        if (error || !created?.user) { log(`  ERROR creating user ${email}: ${error?.message}`); continue; }
        map.set(fbUser.uid, created.user.id);
        log(`  Created: ${email} → ${created.user.id}`);
      }
    }
    nextPageToken = result.pageToken;
  } while (nextPageToken);

  log(`Step 1 done: ${map.size} users mapped.`);
  return map;
}

// ─── Main migration ──────────────────────────────────────────────────────────

async function main() {
  log("=== Selective Batch Migration START ===");
  log(`Targeting batches: ${BATCH_NAMES.join(", ")}`);

  // Find matching batches in Firestore
  log("\nFetching batch list from Firestore...");
  const allBatchesSnap = await withRetry(() => db.collection("batches").get());
  const targetBatches = allBatchesSnap.docs.filter((d) => BATCH_NAMES.includes(d.data().name));

  if (targetBatches.length === 0) {
    log("ERROR: No matching batches found. Check that the names match exactly.");
    process.exit(1);
  }

  log(`Found ${targetBatches.length}/${BATCH_NAMES.length} matching batches:`);
  targetBatches.forEach((d) => log(`  - ${d.data().name} (${d.id})`));

  const missingNames = BATCH_NAMES.filter((n) => !targetBatches.find((d) => d.data().name === n));
  if (missingNames.length > 0) {
    log(`\nWARN: These batch names were not found in Firestore:`);
    missingNames.forEach((n) => log(`  - "${n}"`));
  }

  // Collect Firebase UIDs from these batches
  const firebaseUids = new Set(targetBatches.map((d) => d.data().userId).filter(Boolean));

  // Build user mapping
  const uidMap = await buildUserMapping(firebaseUids);

  // Delete any previously migrated copies of these batches (by name + user_id)
  log("\nRemoving any existing copies of these batches from Supabase...");
  for (const batchDoc of targetBatches) {
    const supabaseUid = uidMap.get(batchDoc.data().userId);
    if (!supabaseUid) continue;
    await supabase
      .from("batches")
      .delete()
      .eq("name", batchDoc.data().name)
      .eq("user_id", supabaseUid);
  }

  // Migrate each batch + its certificates
  const batchMap = new Map<string, string>(); // firestoreBatchId → supabaseBatchId
  const certMap = new Map<string, string>();  // firestoreCertId  → supabaseCertId

  log("\nStep 2: Migrating batches + certificates...");
  for (const batchDoc of targetBatches) {
    const bd = batchDoc.data();
    const supabaseUid = uidMap.get(bd.userId);
    if (!supabaseUid) {
      log(`  SKIP "${bd.name}": no UID mapping for ${bd.userId}`);
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
      log(`  ERROR inserting "${bd.name}": ${batchErr?.message}`);
      continue;
    }

    const supabaseBatchId = inserted.id;
    batchMap.set(batchDoc.id, supabaseBatchId);
    log(`  Batch migrated: "${bd.name}" → ${supabaseBatchId}`);

    // Migrate certificates
    await delay(200);
    const certSnap = await withRetry(() =>
      db.collection("batches").doc(batchDoc.id).collection("certificates").get()
    );

    const certRows = certSnap.docs.map((certDoc) => {
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

    const CHUNK = 100;
    for (let i = 0; i < certRows.length; i += CHUNK) {
      const chunk = certRows.slice(i, i + CHUNK);
      const insertRows = chunk.map(({ _firestoreId: _, ...row }) => row);
      const { data: insertedCerts, error: certErr } = await supabase
        .from("certificates")
        .insert(insertRows)
        .select("id");

      if (certErr) {
        log(`  ERROR inserting certs chunk for "${bd.name}": ${certErr.message}`);
        continue;
      }

      (insertedCerts || []).forEach((sc, idx) => {
        certMap.set(chunk[idx]._firestoreId, sc.id);
      });
    }

    log(`    → ${certSnap.size} certs migrated`);
  }

  // Migrate student profiles for affected certs
  log("\nStep 3: Migrating student profiles for these batches...");
  await delay(300);
  const profileSnap = await withRetry(() => db.collection("studentProfiles").get());
  let profileCount = 0;
  let spcCount = 0;

  for (const profileDoc of profileSnap.docs) {
    const pd = profileDoc.data();
    const slug = profileDoc.id;

    await delay(100);
    const spcSnap = await withRetry(() =>
      db.collection("studentProfiles").doc(slug).collection("certs").get()
    );

    // Only process profiles that have certs from our target batches
    const relevantCerts = spcSnap.docs.filter((d) => {
      const batchId = d.data().batchId;
      return batchId && batchMap.has(batchId);
    });

    if (relevantCerts.length === 0) continue;

    await supabase.from("student_profiles").upsert({
      slug,
      name: pd.name,
      email: pd.email,
      updated_at: toIso(pd.updatedAt) ?? new Date().toISOString(),
    }, { onConflict: "slug" });

    await supabase.from("student_profile_index").upsert({
      email_key: pd.email?.toLowerCase() ?? slug,
      slug,
    }, { onConflict: "email_key" });

    profileCount++;

    for (const spcDoc of relevantCerts) {
      const sc = spcDoc.data();
      const supabaseCertId = certMap.get(sc.certId ?? spcDoc.id) ?? null;
      const supabaseBatchId = batchMap.get(sc.batchId) ?? null;
      if (!supabaseCertId || !supabaseBatchId) continue;

      const { error } = await supabase.from("student_profile_certs").upsert({
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

      if (!error) spcCount++;
    }
  }

  log(`Step 3 done: ${profileCount} profiles, ${spcCount} profile-certs migrated.`);

  // Migrate wa_messages for these batches
  log("\nStep 4: Migrating WhatsApp messages for these batches...");
  await delay(200);
  const waSnap = await withRetry(() => db.collection("waMessages").get());
  let waCount = 0;
  for (const doc of waSnap.docs) {
    const { batchId, certId } = doc.data() as { batchId: string; certId: string };
    const supabaseBatchId = batchMap.get(batchId);
    const supabaseCertId = certMap.get(certId);
    if (!supabaseBatchId || !supabaseCertId) continue;

    const { error } = await supabase.from("wa_messages").upsert({
      wamid: doc.id,
      batch_id: supabaseBatchId,
      cert_id: supabaseCertId,
    }, { onConflict: "wamid" });

    if (!error) waCount++;
  }
  log(`Step 4 done: ${waCount} WA messages migrated.`);

  log("\n=== Migration COMPLETE ===");
  log(`Batches migrated: ${batchMap.size}`);
  log(`Certs migrated:   ${certMap.size}`);
  log(`Profiles:         ${profileCount}`);
  log(`WA messages:      ${waCount}`);
}

main().catch((err) => {
  console.error("Migration FAILED:", err);
  process.exit(1);
});
