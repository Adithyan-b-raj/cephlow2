import { test, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import router from './clientGenerate.js';
import { supabaseAdmin } from '@workspace/supabase';
import { resetCreditsConfig } from '../lib/creditsConfig.js';

const originalEnv = { ...process.env };

beforeEach(() => {
  resetCreditsConfig();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

test('POST /batches/:batchId/client-generate - should return cost breakdown and call start_batch_generation RPC', async () => {
  const originalFrom = supabaseAdmin.from;
  const originalRpc = supabaseAdmin.rpc;

  try {
    // Mock Supabase from
    supabaseAdmin.from = ((table: string) => {
      if (table === 'batches') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: 'batch-123',
                  name: 'Test Batch',
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
                  generation_cost: 3.0,
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

    // Get handler
    const layer = router.stack.find(l => l.route && l.route.path === '/batches/:batchId/client-generate');
    const route = layer ? layer.route : undefined;
    const handler = route ? route.stack[0].handle : undefined;
    assert.ok(handler);

    const req: any = {
      params: { batchId: 'batch-123' },
      user: { uid: 'user-123' },
      workspace: { id: 'ws-123', role: 'owner' },
    };

    let responseData: any = null;
    let statusCode = 200;
    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (data: any) => {
        responseData = data;
        return res;
      }
    };

    await handler(req, res, () => {});

    assert.strictEqual(statusCode, 200);
    assert.strictEqual(rpcMethod, 'start_batch_generation');
    // rate = 3.0, regenRate = 0.6. unpaid = 2, regen = 1. cost = 2 * 3.0 + 1 * 0.6 = 6.6
    assert.strictEqual(rpcArgs.p_cost, 6.6);
    assert.strictEqual(rpcArgs.p_unpaid_count, 2);
    assert.strictEqual(rpcArgs.p_regen_count, 1);

    assert.deepStrictEqual(responseData.costBreakdown, {
      rate: 3.0,
      regenRate: 3.0 * 0.2,
      unpaidCount: 2,
      visualRegenCount: 1,
      totalCost: 6.6,
    });

  } finally {
    supabaseAdmin.from = originalFrom;
    supabaseAdmin.rpc = originalRpc;
  }
});

test('POST /batches/:batchId/client-generate - should return 402 if start_batch_generation fails with insufficient funds', async () => {
  const originalFrom = supabaseAdmin.from;
  const originalRpc = supabaseAdmin.rpc;

  try {
    supabaseAdmin.from = ((table: string) => {
      if (table === 'batches') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: 'batch-123',
                  name: 'Test Batch',
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
                  generation_cost: 3.0,
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

    supabaseAdmin.rpc = (async () => {
      return { data: null, error: { message: 'insufficient_funds: need 3.0, have 1.0' } };
    }) as any;

    const layer = router.stack.find(l => l.route && l.route.path === '/batches/:batchId/client-generate');
    const route = layer ? layer.route : undefined;
    const handler = route ? route.stack[0].handle : undefined;
    assert.ok(handler);

    const req: any = {
      params: { batchId: 'batch-123' },
      user: { uid: 'user-123' },
      workspace: { id: 'ws-123', role: 'owner' },
    };

    let responseData: any = null;
    let statusCode = 200;
    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (data: any) => {
        responseData = data;
        return res;
      }
    };

    await handler(req, res, () => {});

    assert.strictEqual(statusCode, 402);
    assert.match(responseData.error, /Insufficient funds:  need 3.0, have 1.0/);

  } finally {
    supabaseAdmin.from = originalFrom;
    supabaseAdmin.rpc = originalRpc;
  }
});
