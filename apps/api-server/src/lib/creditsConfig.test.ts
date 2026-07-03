import { test, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import { getCreditsConfig, resetCreditsConfig } from './creditsConfig.js';

const originalEnv = { ...process.env };

beforeEach(() => {
  resetCreditsConfig();
  // Clear env vars to make tests isolated
  delete process.env.CREDITS_PER_RUPEE;
  delete process.env.CREDIT_COST_GENERATION;
  delete process.env.CREDIT_COST_EMAIL;
  delete process.env.CREDIT_COST_WHATSAPP;
  delete process.env.MIN_RECHARGE_AMOUNT;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

test('creditsConfig - should load config successfully with valid environment variables', () => {
  process.env.CREDITS_PER_RUPEE = '10';
  process.env.CREDIT_COST_GENERATION = '5';
  process.env.CREDIT_COST_EMAIL = '1';
  process.env.CREDIT_COST_WHATSAPP = '2';
  process.env.MIN_RECHARGE_AMOUNT = '150';

  const config = getCreditsConfig();
  assert.strictEqual(config.CREDITS_PER_RUPEE, 10);
  assert.strictEqual(config.CREDIT_COST_GENERATION, 5);
  assert.strictEqual(config.CREDIT_COST_EMAIL, 1);
  assert.strictEqual(config.CREDIT_COST_WHATSAPP, 2);
  assert.strictEqual(config.MIN_RECHARGE_AMOUNT, 150);
});

test('creditsConfig - should fall back to default MIN_RECHARGE_AMOUNT if not specified', () => {
  process.env.CREDITS_PER_RUPEE = '10';
  process.env.CREDIT_COST_GENERATION = '5';
  process.env.CREDIT_COST_EMAIL = '1';
  process.env.CREDIT_COST_WHATSAPP = '2';

  const config = getCreditsConfig();
  assert.strictEqual(config.MIN_RECHARGE_AMOUNT, 100);
});

test('creditsConfig - should throw error if required env variable is missing', () => {
  process.env.CREDIT_COST_GENERATION = '5';
  process.env.CREDIT_COST_EMAIL = '1';
  process.env.CREDIT_COST_WHATSAPP = '2';

  assert.throws(() => {
    getCreditsConfig();
  }, /Missing required credits configuration: CREDITS_PER_RUPEE/);
});

test('creditsConfig - should throw error if env variable is invalid number', () => {
  process.env.CREDITS_PER_RUPEE = 'abc';
  process.env.CREDIT_COST_GENERATION = '5';
  process.env.CREDIT_COST_EMAIL = '1';
  process.env.CREDIT_COST_WHATSAPP = '2';

  assert.throws(() => {
    getCreditsConfig();
  }, /Invalid credits configuration value/);
});
