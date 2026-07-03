import { test } from 'node:test';
import * as assert from 'node:assert';
import router from './wallet.js';
import { supabaseAdmin } from '@workspace/supabase';

test('GET /wallet - should return current balance and cost breakdown', async () => {
  const originalFrom = supabaseAdmin.from;

  try {
    // Mock Supabase select single
    supabaseAdmin.from = ((table: string) => {
      assert.strictEqual(table, 'workspaces');
      return {
        select: (cols: string) => {
          assert.ok(cols.includes('generation_cost'));
          return {
            eq: (field: string, val: any) => {
              assert.strictEqual(field, 'id');
              assert.strictEqual(val, 'ws-123');
              return {
                single: async () => {
                  return {
                    data: {
                      current_balance: 550,
                      transfer_code: 'TRANS123',
                      generation_cost: 2.5,
                      email_cost: 0.5,
                      whatsapp_cost: 1.5,
                    },
                    error: null,
                  };
                }
              };
            }
          };
        }
      } as any;
    }) as any;

    // Get the handler
    const layer = router.stack.find(l => l.route && l.route.path === '/wallet');
    const route = layer ? layer.route : undefined;
    const handler = route ? route.stack[0].handle : undefined;
    assert.ok(handler);

    // Mock Express req and res
    const req: any = {
      workspace: { id: 'ws-123' },
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
    assert.deepStrictEqual(responseData, {
      currentBalance: 550,
      transferCode: 'TRANS123',
      costs: {
        generation: 2.5,
        email: 0.5,
        whatsapp: 1.5,
      }
    });

  } finally {
    supabaseAdmin.from = originalFrom;
  }
});
