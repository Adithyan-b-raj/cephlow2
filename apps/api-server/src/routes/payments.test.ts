import { test, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import { Cashfree } from "cashfree-pg";
import { supabaseAdmin } from '@workspace/supabase';
import { resetCreditsConfig } from '../lib/creditsConfig.js';
import router from './payments.js';

const originalEnv = { ...process.env };

beforeEach(() => {
  resetCreditsConfig();
  process.env.CREDITS_PER_RUPEE = '10';
  process.env.CREDIT_COST_GENERATION = '5';
  process.env.CREDIT_COST_EMAIL = '1';
  process.env.CREDIT_COST_WHATSAPP = '2';
  process.env.MIN_RECHARGE_AMOUNT = '100';
});

afterEach(() => {
  process.env = { ...originalEnv };
});

test('POST /payments/create-order - should reject amounts below MIN_RECHARGE_AMOUNT', async () => {
  process.env.CREDITS_PER_RUPEE = '10';
  process.env.MIN_RECHARGE_AMOUNT = '100';

  // Get handler
  const layer = router.stack.find(l => l.route && l.route.path === '/payments/create-order');
  const route = layer ? layer.route : undefined;
  const handler = route ? route.stack[0].handle : undefined;
  assert.ok(handler);

  const req: any = {
    body: { amount: 50 }, // below 100
    user: { uid: 'user-123', email: 'test@example.com' },
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

  assert.strictEqual(statusCode, 400);
  assert.match(responseData.error, /Minimum recharge amount is Rs. 100/);
});

test('POST /payments/create-order - should allow valid amounts and call PGCreateOrder', async () => {
  process.env.CREDITS_PER_RUPEE = '10';
  process.env.MIN_RECHARGE_AMOUNT = '100';

  const originalPGCreateOrder = Cashfree.prototype.PGCreateOrder;
  const originalFrom = supabaseAdmin.from;

  try {
    let orderRequest: any = null;
    Cashfree.prototype.PGCreateOrder = (async (request: any) => {
      orderRequest = request;
      return {
        data: {
          order_id: 'order-999',
          payment_session_id: 'session-888',
        }
      };
    }) as any;

    let insertedData: any = null;
    supabaseAdmin.from = ((table: string) => {
      assert.strictEqual(table, 'payment_orders');
      return {
        insert: (data: any) => {
          insertedData = data;
          return {
            error: null,
          };
        }
      } as any;
    }) as any;

    const layer = router.stack.find(l => l.route && l.route.path === '/payments/create-order');
    const route = layer ? layer.route : undefined;
    const handler = route ? route.stack[0].handle : undefined;
    assert.ok(handler);

    const req: any = {
      body: { amount: 150 }, // above 100
      user: { uid: 'user-123', email: 'test@example.com' },
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
      payment_session_id: 'session-888',
      order_id: 'order-999',
    });
    assert.strictEqual(orderRequest.order_amount, 150);
    assert.deepStrictEqual(insertedData, {
      order_id: 'order-999',
      workspace_id: 'ws-123',
      user_id: 'user-123',
      amount: 150,
    });

  } finally {
    Cashfree.prototype.PGCreateOrder = originalPGCreateOrder;
    supabaseAdmin.from = originalFrom;
  }
});

test('POST /payments/verify - should verify Cashfree status and credit wallet with credits', async () => {
  process.env.CREDITS_PER_RUPEE = '10';
  process.env.MIN_RECHARGE_AMOUNT = '100';

  const originalPGFetchOrder = Cashfree.prototype.PGFetchOrder;
  const originalFrom = supabaseAdmin.from;
  const originalRpc = supabaseAdmin.rpc;

  try {
    let fetchedOrderId = '';
    Cashfree.prototype.PGFetchOrder = (async (orderId: string) => {
      fetchedOrderId = orderId;
      return {
        data: {
          order_id: orderId,
          order_status: 'PAID',
          order_amount: 250,
        }
      };
    }) as any;

    supabaseAdmin.from = ((table: string) => {
      assert.strictEqual(table, 'payment_orders');
      return {
        select: (cols: string) => {
          return {
            eq: (field: string, val: any) => {
              assert.strictEqual(field, 'order_id');
              assert.strictEqual(val, 'order-999');
              return {
                maybeSingle: async () => {
                  return {
                    data: {
                      workspace_id: 'ws-123',
                      user_id: 'user-123',
                      amount: 250,
                      processed: false,
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

    let rpcMethod = '';
    let rpcArgs: any = null;
    supabaseAdmin.rpc = (async (method: string, args: any) => {
      rpcMethod = method;
      rpcArgs = args;
      return {
        data: { status: 'ok' },
        error: null,
      };
    }) as any;

    const layer = router.stack.find(l => l.route && l.route.path === '/payments/verify');
    const route = layer ? layer.route : undefined;
    const handler = route ? route.stack[0].handle : undefined;
    assert.ok(handler);

    const req: any = {
      body: { order_id: 'order-999' },
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
    assert.strictEqual(fetchedOrderId, 'order-999');
    assert.strictEqual(rpcMethod, 'process_payment');
    assert.strictEqual(rpcArgs.p_user_id, 'user-123');
    assert.strictEqual(rpcArgs.p_order_id, 'order-999');
    assert.strictEqual(rpcArgs.p_amount, 250);
    assert.strictEqual(rpcArgs.p_credits, 2500); // 250 * 10
  } finally {
    Cashfree.prototype.PGFetchOrder = originalPGFetchOrder;
    supabaseAdmin.from = originalFrom;
    supabaseAdmin.rpc = originalRpc;
  }
});
