import { getCreditsConfig } from './creditsConfig.js';

/**
 * Converts a rupee amount to the equivalent amount of credits based on the CREDITS_PER_RUPEE conversion rate.
 */
export function calculateCreditsFromRupees(rupees: number): number {
  const config = getCreditsConfig();
  return rupees * config.CREDITS_PER_RUPEE;
}
