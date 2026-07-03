export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  currentBalance: number;
  transferCode?: string | null;
  generationCost: number;
  emailCost: number;
  whatsappCost: number;
  createdAt: string;
}

export interface Ledger {
  id: string;
  workspaceId: string;
  userId: string;
  type: "topup" | "deduction";
  amount: number;
  balanceAfter: number;
  description: string;
  metadata?: Record<string, any> | null;
  transferId?: string | null;
  actionType?: "generation" | "email" | "whatsapp" | null;
  createdAt: string;
}

/**
 * Validates that a workspace object has the required credit cost fields.
 */
export function validateWorkspace(ws: any): boolean {
  if (ws.generationCost === undefined || ws.generationCost === null) {
    throw new Error('Missing required workspace credit cost property: generationCost');
  }
  if (ws.emailCost === undefined || ws.emailCost === null) {
    throw new Error('Missing required workspace credit cost property: emailCost');
  }
  if (ws.whatsappCost === undefined || ws.whatsappCost === null) {
    throw new Error('Missing required workspace credit cost property: whatsappCost');
  }
  return true;
}

/**
 * Validates that a ledger object has a valid actionType if specified.
 */
export function validateLedger(ledger: any): boolean {
  if (ledger.actionType !== undefined && ledger.actionType !== null) {
    const validActionTypes = ['generation', 'email', 'whatsapp'];
    if (!validActionTypes.includes(ledger.actionType)) {
      throw new Error(`Invalid ledger actionType: ${ledger.actionType}`);
    }
  }
  return true;
}
