export function emailToSlug(email: string): string {
  const prefix = email.split("@")[0] || "user";
  return prefix
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "user";
}

export async function upsertStudentProfile(
  db: D1Database,
  params: {
    email: string;
    name: string;
    certId: string;
    batchId: string;
    batchName: string;
    r2PdfUrl: string | null;
    pdfUrl: string | null;
    slideUrl: string | null;
    status: string;
  }
): Promise<void> {
  const { email, name, certId, batchId, batchName, r2PdfUrl, pdfUrl, slideUrl, status } = params;
  const emailKey = email.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const slug = emailToSlug(email);

  await db.batch([
    db.prepare(`
      INSERT INTO student_profiles (slug, name)
      VALUES (?, ?)
      ON CONFLICT(slug) DO UPDATE SET name = excluded.name
    `).bind(slug, name),
    
    db.prepare(`
      INSERT INTO student_profile_index (email_key, slug)
      VALUES (?, ?)
      ON CONFLICT(email_key) DO UPDATE SET slug = excluded.slug
    `).bind(emailKey, slug),

    db.prepare(`
      INSERT INTO student_profile_certs (
        id, profile_slug, cert_id, batch_id, batch_name, recipient_name, 
        r2_pdf_url, pdf_url, slide_url, issued_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
      ON CONFLICT(cert_id) DO UPDATE SET
        profile_slug = excluded.profile_slug,
        batch_id = excluded.batch_id,
        batch_name = excluded.batch_name,
        recipient_name = excluded.recipient_name,
        r2_pdf_url = excluded.r2_pdf_url,
        pdf_url = excluded.pdf_url,
        slide_url = excluded.slide_url,
        status = excluded.status,
        updated_at = datetime('now')
    `).bind(crypto.randomUUID(), slug, certId, batchId, batchName, name, r2PdfUrl, pdfUrl, slideUrl, status)
  ]);
}
