/**
 * Records a privileged platform-admin action (credit grant, feature toggle,
 * suspend/enable, user approval) for accountability. Best-effort — a failure
 * here should never block the primary write it's logging.
 */
export async function logAdminAction(
  db: D1Database,
  adminUserId: string,
  action: string,
  targetWorkspaceId: string | null,
  details: Record<string, unknown>,
  adminEmail?: string | null,
  targetUserId?: string | null,
): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO admin_audit_log (id, admin_user_id, admin_email, action, target_workspace_id, target_user_id, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      adminUserId,
      adminEmail ?? null,
      action,
      targetWorkspaceId,
      targetUserId ?? null,
      JSON.stringify(details),
    ).run();
  } catch (err: any) {
    console.warn("[adminAudit] failed to log admin action:", err.message);
  }
}
