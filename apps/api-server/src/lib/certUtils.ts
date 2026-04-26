import { supabaseAdmin } from "@workspace/supabase";

const PHONE_COLUMN_NAMES = ["phonenumber", "phone", "mobile", "mobilenumber", "contact", "contactnumber", "contactno", "phoneno"];

export function normalizeColumnName(name: string): string {
  return name.toLowerCase().replace(/[\s_\-]/g, "");
}

export function normalizePhoneNumber(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^0+/, "");
}

export function extractPhoneNumber(rowData: Record<string, string>): string {
  const configuredColumn = process.env.R2_PHONE_COLUMN;
  let raw = "";
  if (configuredColumn && rowData[configuredColumn]) {
    raw = rowData[configuredColumn];
  } else {
    for (const key of Object.keys(rowData)) {
      if (PHONE_COLUMN_NAMES.includes(normalizeColumnName(key))) {
        raw = rowData[key];
        break;
      }
    }
  }
  return normalizePhoneNumber(raw);
}

export function emailToSlug(email: string): string {
  const prefix = email.split("@")[0] ?? "user";
  return prefix
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "user";
}

export async function upsertStudentProfile(params: {
  email: string;
  name: string;
  certId: string;
  batchId: string;
  batchName: string;
  r2PdfUrl: string | null;
  pdfUrl: string | null;
  slideUrl: string | null;
  status: string;
}) {
  const { email, name, certId, batchId, batchName, r2PdfUrl, pdfUrl, slideUrl, status } = params;
  const emailKey = email.toLowerCase().replace(/[^a-z0-9]/g, "_");

  // Slug is derived deterministically from the email prefix — no collision loop needed.
  // email_key is unique in student_profile_index, so one email always maps to one slug.
  const slug = emailToSlug(email);

  // Upsert profile and index in parallel — both are idempotent
  await Promise.all([
    supabaseAdmin
      .from("student_profiles")
      .upsert({ slug, name, email, updated_at: new Date().toISOString() }, { onConflict: "slug" }),
    supabaseAdmin
      .from("student_profile_index")
      .upsert({ email_key: emailKey, slug }, { onConflict: "email_key" }),
  ]);

  await supabaseAdmin.from("student_profile_certs").upsert(
    {
      profile_slug: slug,
      cert_id: certId,
      batch_id: batchId,
      batch_name: batchName,
      recipient_name: name,
      r2_pdf_url: r2PdfUrl ?? null,
      pdf_url: pdfUrl ?? null,
      slide_url: slideUrl ?? null,
      issued_at: new Date().toISOString(),
      status,
    },
    { onConflict: "profile_slug,cert_id" }
  );
}
