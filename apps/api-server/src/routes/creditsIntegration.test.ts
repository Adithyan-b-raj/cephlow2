process.env.CREDITS_PER_RUPEE = '12';
process.env.CREDIT_COST_GENERATION = '4';
process.env.CREDIT_COST_EMAIL = '1.5';
process.env.CREDIT_COST_WHATSAPP = '3';
process.env.MIN_RECHARGE_AMOUNT = '200';

import { test, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import { calculateCreditsFromRupees, deductDeliveryCredits } from '../lib/creditsService.js';
import { getCreditsConfig, resetCreditsConfig } from '../lib/creditsConfig.js';
import { supabaseAdmin } from '@workspace/supabase';
import { Cashfree } from 'cashfree-pg';
import clientGenerateRouter from './clientGenerate.js';
import paymentsRouter from './payments.js';

// Mock Cashfree SDK
Cashfree.prototype.PGCreateOrder = (async () => ({
  data: { payment_session_id: 'session-123', order_id: 'order-123' }
})) as any;

Cashfree.prototype.PGFetchOrder = (async () => ({
  data: { order_status: 'PAID' }
})) as any;

const originalEnv = { ...process.env };

beforeEach(() => {
  resetCreditsConfig();
  process.env.CREDITS_PER_RUPEE = '12';
  process.env.CREDIT_COST_GENERATION = '4';
  process.env.CREDIT_COST_EMAIL = '1.5';
  process.env.CREDIT_COST_WHATSAPP = '3';
  process.env.MIN_RECHARGE_AMOUNT = '200';
});

afterEach(() => {
  process.env = { ...originalEnv };
});

test('Integration - Complete Recharge Flow with Credits', async () => {
  const config = getCreditsConfig();
  assert.strictEqual(config.CREDITS_PER_RUPEE, 12);
  assert.strictEqual(config.MIN_RECHARGE_AMOUNT, 200);

  // 1. Calculate credits from rupees
  const rupees = 250;
  const credits = calculateCreditsFromRupees(rupees);
  assert.strictEqual(credits, 3000); // 250 * 12

  // 2. Mock payment verify calling process_payment RPC
  const originalRpc = supabaseAdmin.rpc;
  let rpcMethod = '';
  let rpcArgs: any = null;

  try {
    supabaseAdmin.rpc = (async (method: string, args: any) => {
      rpcMethod = method;
      rpcArgs = args;
      return { data: { status: 'ok', new_balance: 5000 }, error: null };
    }) as any;

    const originalFrom = supabaseAdmin.from;
    supabaseAdmin.from = ((table: string) => {
      if (table === 'payment_orders') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: 'order-123',
                  workspace_id: 'ws-123',
                  amount: rupees,
                  status: 'pending',
                  user_id: 'user-123',
                },
                error: null,
              }),
              maybeSingle: async () => ({
                data: {
                  id: 'order-123',
                  workspace_id: 'ws-123',
                  amount: rupees,
                  status: 'pending',
                  user_id: 'user-123',
                },
                error: null,
              }),
            })
          })
        } as any;
      }
      // General mock query chain
      const queryChain = {
        select: () => queryChain,
        eq: () => queryChain,
        in: () => queryChain,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
        then: (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve),
      };
      return queryChain as any;
    }) as any;

    // Get verify route handler (post /payments/verify)
    const layer = paymentsRouter.stack.find(l => l.route && l.route.path === '/payments/verify');
    const handler = layer?.route?.stack[0].handle;
    assert.ok(handler);

    const req: any = {
      body: { order_id: 'order-123' },
    };
    let responseData: any = null;
    const res: any = {
      status: () => res,
      json: (data: any) => {
        responseData = data;
        return res;
      }
    };

    // Trigger verification
    await handler(req, res, () => {});

    // Assert process_payment RPC is called with correct params
    assert.strictEqual(rpcMethod, 'process_payment');
    assert.strictEqual(rpcArgs.p_user_id, 'user-123');
    assert.strictEqual(rpcArgs.p_order_id, 'order-123');
    assert.strictEqual(rpcArgs.p_amount, rupees);
    assert.strictEqual(rpcArgs.p_credits, credits); // Should credit 3000 credits
    assert.strictEqual(responseData.credited, true);

    supabaseAdmin.from = originalFrom;
  } finally {
    supabaseAdmin.rpc = originalRpc;
  }
});

test('Integration - Certificate Generation with Credit Deduction', async () => {
  const originalFrom = supabaseAdmin.from;
  const originalRpc = supabaseAdmin.rpc;

  try {
    // 1. Mock Supabase query chain for generating batch certificates
    supabaseAdmin.from = ((table: string) => {
      if (table === 'batches') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: 'batch-123',
                  name: 'Integration Batch',
                  workspace_id: 'ws-123',
                  user_id: 'user-123',
                  template_id: 'tpl-123',
                  template_kind: 'slides',
                },
                error: null,
              })
            })
          })
        } as any;
      }
      if (table === 'certificates') {
        return {
          select: () => ({
            eq: async () => ({
              data: [
                { id: 'c-1', is_paid: false, status: 'pending' },
                { id: 'c-2', is_paid: false, status: 'pending' },
                { id: 'c-3', is_paid: true, status: 'outdated', requires_visual_regen: true },
              ],
              error: null,
            })
          })
        } as any;
      }
      if (table === 'workspaces') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  generation_cost: 5.0, // custom cost rate
                },
                error: null,
              }),
              maybeSingle: async () => ({
                data: {
                  owner_id: 'user-123',
                },
                error: null,
              }),
            })
          })
        } as any;
      }
      if (table === 'user_profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { is_approved: true },
                error: null,
              })
            })
          })
        } as any;
      }
      // General mock query chain
      const queryChain = {
        select: () => queryChain,
        eq: () => queryChain,
        in: () => queryChain,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
        then: (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve),
      };
      return queryChain as any;
    }) as any;

    let rpcMethod = '';
    let rpcArgs: any = null;
    supabaseAdmin.rpc = (async (method: string, args: any) => {
      rpcMethod = method;
      rpcArgs = args;
      return { data: null, error: null };
    }) as any;

    // Get client-generate handler
    const layer = clientGenerateRouter.stack.find(l => l.route && l.route.path === '/batches/:batchId/client-generate');
    const handler = layer?.route?.stack[0].handle;
    assert.ok(handler);

    const req: any = {
      params: { batchId: 'batch-123' },
      user: { uid: 'user-123' },
      workspace: { id: 'ws-123', role: 'owner' },
    };
    let responseData: any = null;
    const res: any = {
      status: () => res,
      json: (data: any) => {
        responseData = data;
        return res;
      }
    };

    await handler(req, res, () => {});

    // unpaid = 2, regen = 1. rate = 5.0, regenRate = 1.0. cost = 2 * 5.0 + 1 * 1.0 = 11.0
    assert.strictEqual(rpcMethod, 'start_batch_generation');
    assert.strictEqual(rpcArgs.p_cost, 11.0);
    assert.strictEqual(rpcArgs.p_unpaid_count, 2);
    assert.strictEqual(rpcArgs.p_regen_count, 1);
    assert.deepStrictEqual(responseData.costBreakdown, {
      rate: 5.0,
      regenRate: 1.0,
      unpaidCount: 2,
      visualRegenCount: 1,
      totalCost: 11.0,
    });

  } finally {
    supabaseAdmin.from = originalFrom;
    supabaseAdmin.rpc = originalRpc;
  }
});

test('Integration - Email and WhatsApp Delivery with Credit Deduction', async () => {
  const originalFrom = supabaseAdmin.from;
  const originalRpc = supabaseAdmin.rpc;

  try {
    // 1. Mock workspace query returning custom delivery costs
    supabaseAdmin.from = ((table: string) => {
      assert.strictEqual(table, 'workspaces');
      return {
        select: (cols: string) => {
          assert.ok(cols.includes('email_cost'));
          return {
            eq: () => ({
              single: async () => ({
                data: {
                  email_cost: 1.5,
                  whatsapp_cost: 3.5,
                },
                error: null,
              })
            })
          };
        }
      } as any;
    }) as any;

    let rpcMethod = '';
    let rpcArgs: any = null;
    supabaseAdmin.rpc = (async (method: string, args: any) => {
      rpcMethod = method;
      rpcArgs = args;
      return { data: null, error: null };
    }) as any;

    // 2. Trigger email delivery credits deduction (workspaceId, userId, actionType, description)
    const successEmail = await deductDeliveryCredits('ws-123', 'user-123', 'email', 'job-email-123');
    assert.strictEqual(successEmail, true);
    assert.strictEqual(rpcMethod, 'deduct_delivery_credits');
    assert.strictEqual(rpcArgs.p_workspace_id, 'ws-123');
    assert.strictEqual(rpcArgs.p_action_type, 'email');

    // 3. Trigger WhatsApp delivery credits deduction (workspaceId, userId, actionType, description)
    const successWa = await deductDeliveryCredits('ws-123', 'user-123', 'whatsapp', 'job-wa-123');
    assert.strictEqual(successWa, true);
    assert.strictEqual(rpcMethod, 'deduct_delivery_credits');
    assert.strictEqual(rpcArgs.p_workspace_id, 'ws-123');
    assert.strictEqual(rpcArgs.p_action_type, 'whatsapp');

  } finally {
    supabaseAdmin.from = originalFrom;
    supabaseAdmin.rpc = originalRpc;
  }
});
