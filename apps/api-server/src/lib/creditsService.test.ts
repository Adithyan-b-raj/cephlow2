import { test, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import { calculateCreditsFromRupees } from './creditsService.js';
import { resetCreditsConfig } from './creditsConfig.js';

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
