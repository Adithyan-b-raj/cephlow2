/**
 * Returns true if the given user is a platform admin (cephlow team member
 * managing all client workspaces), not to be confused with a workspace-scoped
 * "admin" role in workspace_members.
 */
export async function isPlatformAdmin(db: D1Database, userId: string): Promise<boolean> {
  if (!userId) return false;
  const row = await db.prepare(`
    SELECT 1 FROM platform_admins WHERE user_id = ?
  `).bind(userId).first();
  return Boolean(row);
}
