import { getCreditsConfig } from './creditsConfig.js';
import { supabaseAdmin } from '@workspace/supabase';

/**
 * Converts a rupee amount to the equivalent amount of credits based on the CREDITS_PER_RUPEE conversion rate.
 */
export function calculateCreditsFromRupees(rupees: number): number {
  const config = getCreditsConfig();
  return rupees * config.CREDITS_PER_RUPEE;
}

/**
 * Atomically deducts credits from a workspace for a specific delivery action (email or whatsapp).
 * Returns true if the deduction was successful, false if there are insufficient funds or database errors.
 */
export async function deductDeliveryCredits(
  workspaceId: string,
  userId: string,
  actionType: "email" | "whatsapp",
  description: string,
  metadata: Record<string, any> = {}
): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc("deduct_delivery_credits", {
      p_workspace_id: workspaceId,
      p_user_id: userId,
      p_action_type: actionType,
      p_description: description,
      p_metadata: metadata,
    });

    if (error) {
      console.error(`[Credits Service] Failed to deduct delivery credits for action ${actionType}:`, error.message);
      return false;
    }

    return true;
  } catch (err: any) {
    console.error(`[Credits Service] Exception during deductDeliveryCredits:`, err.message);
    return false;
  }
}
