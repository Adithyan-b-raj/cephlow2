import { test, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import { calculateCreditsFromRupees, deductDeliveryCredits } from './creditsService.js';
import { resetCreditsConfig } from './creditsConfig.js';
import { supabaseAdmin } from '@workspace/supabase';

const originalEnv = { ...process.env };

beforeEach(() => {
  resetCreditsConfig();
  delete process.env.CREDITS_PER_RUPEE;
  delete process.env.CREDIT_COST_GENERATION;
  delete process.env.CREDIT_COST_EMAIL;
  delete process.env.CREDIT_COST_WHATSAPP;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

test('creditsService - should convert rupees to credits correctly based on CREDITS_PER_RUPEE', () => {
  process.env.CREDITS_PER_RUPEE = '10';
  process.env.CREDIT_COST_GENERATION = '5';
  process.env.CREDIT_COST_EMAIL = '1';
  process.env.CREDIT_COST_WHATSAPP = '2';

  const credits = calculateCreditsFromRupees(150);
  assert.strictEqual(credits, 1500);
});

test('creditsService - should handle zero amount', () => {
  process.env.CREDITS_PER_RUPEE = '10';
  process.env.CREDIT_COST_GENERATION = '5';
  process.env.CREDIT_COST_EMAIL = '1';
  process.env.CREDIT_COST_WHATSAPP = '2';

  const credits = calculateCreditsFromRupees(0);
  assert.strictEqual(credits, 0);
});

test('creditsService - should throw if config is missing when performing calculation', () => {
  assert.throws(() => {
    calculateCreditsFromRupees(100);
  }, /Missing required credits configuration/);
});

test('creditsService - deductDeliveryCredits should call RPC and return success', async () => {
  const originalRpc = supabaseAdmin.rpc;
  try {
    let calledMethod = '';
    let calledArgs: any = null;
    supabaseAdmin.rpc = (async (method: string, args: any) => {
      calledMethod = method;
      calledArgs = args;
      return { data: 950, error: null };
    }) as any;

    const result = await deductDeliveryCredits('ws-123', 'user-456', 'email', 'Test email', { certId: 'c-1' });
    assert.strictEqual(result, true);
    assert.strictEqual(calledMethod, 'deduct_delivery_credits');
    assert.strictEqual(calledArgs.p_workspace_id, 'ws-123');
    assert.strictEqual(calledArgs.p_user_id, 'user-456');
    assert.strictEqual(calledArgs.p_action_type, 'email');
    assert.strictEqual(calledArgs.p_description, 'Test email');
  } finally {
    supabaseAdmin.rpc = originalRpc;
  }
});

test('creditsService - deductDeliveryCredits should return false and log/throw if RPC fails with insufficient funds', async () => {
  const originalRpc = supabaseAdmin.rpc;
  try {
    supabaseAdmin.rpc = (async () => {
      return { data: null, error: { message: 'insufficient_funds' } };
    }) as any;

    const result = await deductDeliveryCredits('ws-123', 'user-456', 'email', 'Test email', { certId: 'c-1' });
    assert.strictEqual(result, false);
  } finally {
    supabaseAdmin.rpc = originalRpc;
  }
});

