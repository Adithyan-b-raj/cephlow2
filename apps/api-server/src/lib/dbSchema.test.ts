import { test } from 'node:test';
import * as assert from 'node:assert';
import { validateWorkspace, validateLedger } from './dbSchema.js';

test('dbSchema - should validate workspace object with credit cost properties successfully', () => {
  const validWorkspace = {
    id: 'ws-123',
    name: 'Test Workspace',
    ownerId: 'user-456',
    currentBalance: 1000,
    generationCost: 1.5,
    emailCost: 0.2,
    whatsappCost: 0.5,
    createdAt: new Date().toISOString()
  };

  const result = validateWorkspace(validWorkspace);
  assert.strictEqual(result, true);
});

test('dbSchema - should throw or fail validation if workspace is missing credit cost properties', () => {
  const invalidWorkspace = {
    id: 'ws-123',
    name: 'Test Workspace',
    ownerId: 'user-456',
    currentBalance: 1000,
    createdAt: new Date().toISOString()
  };

  assert.throws(() => {
    validateWorkspace(invalidWorkspace);
  }, /Missing required workspace credit cost property/);
});

test('dbSchema - should validate ledger object with optional actionType successfully', () => {
  const validLedger = {
    id: 'ledger-789',
    workspaceId: 'ws-123',
    userId: 'user-456',
    type: 'deduction',
    amount: -5,
    balanceAfter: 995,
    description: 'WhatsApp delivery cost',
    actionType: 'whatsapp',
    createdAt: new Date().toISOString()
  };

  const result = validateLedger(validLedger);
  assert.strictEqual(result, true);
});

test('dbSchema - should fail validation if ledger has invalid actionType', () => {
  const invalidLedger = {
    id: 'ledger-789',
    workspaceId: 'ws-123',
    userId: 'user-456',
    type: 'deduction',
    amount: -5,
    balanceAfter: 995,
    description: 'Invalid action type ledger',
    actionType: 'invalid_type',
    createdAt: new Date().toISOString()
  };

  assert.throws(() => {
    validateLedger(invalidLedger);
  }, /Invalid ledger actionType/);
});
