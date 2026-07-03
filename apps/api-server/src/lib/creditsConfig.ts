export interface CreditsConfig {
  CREDITS_PER_RUPEE: number;
  CREDIT_COST_GENERATION: number;
  CREDIT_COST_EMAIL: number;
  CREDIT_COST_WHATSAPP: number;
  MIN_RECHARGE_AMOUNT: number;
}

let cachedConfig: CreditsConfig | null = null;

/**
 * Resets the cached configuration. Useful for unit testing.
 */
export function resetCreditsConfig(): void {
  cachedConfig = null;
}

/**
 * Retrieves the credits configuration, parsing environment variables.
 * Throws an error if required configuration is missing or invalid.
 */
export function getCreditsConfig(): CreditsConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const creditsPerRupeeStr = process.env.CREDITS_PER_RUPEE;
  const creditCostGenerationStr = process.env.CREDIT_COST_GENERATION;
  const creditCostEmailStr = process.env.CREDIT_COST_EMAIL;
  const creditCostWhatsappStr = process.env.CREDIT_COST_WHATSAPP;
  const minRechargeAmountStr = process.env.MIN_RECHARGE_AMOUNT;

  if (creditsPerRupeeStr === undefined) {
    throw new Error('Missing required credits configuration: CREDITS_PER_RUPEE');
  }
  if (creditCostGenerationStr === undefined) {
    throw new Error('Missing required credits configuration: CREDIT_COST_GENERATION');
  }
  if (creditCostEmailStr === undefined) {
    throw new Error('Missing required credits configuration: CREDIT_COST_EMAIL');
  }
  if (creditCostWhatsappStr === undefined) {
    throw new Error('Missing required credits configuration: CREDIT_COST_WHATSAPP');
  }

  const creditsPerRupee = Number(creditsPerRupeeStr);
  const creditCostGeneration = Number(creditCostGenerationStr);
  const creditCostEmail = Number(creditCostEmailStr);
  const creditCostWhatsapp = Number(creditCostWhatsappStr);
  const minRechargeAmount = minRechargeAmountStr !== undefined ? Number(minRechargeAmountStr) : 100;

  if (
    isNaN(creditsPerRupee) ||
    isNaN(creditCostGeneration) ||
    isNaN(creditCostEmail) ||
    isNaN(creditCostWhatsapp) ||
    isNaN(minRechargeAmount)
  ) {
    throw new Error('Invalid credits configuration value: all config values must be numbers');
  }

  cachedConfig = {
    CREDITS_PER_RUPEE: creditsPerRupee,
    CREDIT_COST_GENERATION: creditCostGeneration,
    CREDIT_COST_EMAIL: creditCostEmail,
    CREDIT_COST_WHATSAPP: creditCostWhatsapp,
    MIN_RECHARGE_AMOUNT: minRechargeAmount,
  };

  return cachedConfig;
}
