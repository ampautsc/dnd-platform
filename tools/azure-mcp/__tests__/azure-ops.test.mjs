import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  checkQuotas,
  requestQuotaIncrease,
  listResources,
  getAppServicePlan,
  upgradeAppServicePlan,
  listLocations,
  _setExec,
  _resetExec,
} from '../lib/azure-ops.mjs';

// ── Test Helpers ─────────────────────────────────────────────
// We inject a mock execFile into azure-ops so tests never shell out.

function mockExec(mockMap) {
  _setExec(async (cmd, args) => {
    const key = `${cmd} ${args.join(' ')}`;
    for (const [pattern, handler] of Object.entries(mockMap)) {
      if (key.includes(pattern)) {
        if (typeof handler === 'function') return handler(cmd, args);
        if (handler instanceof Error) throw handler;
        return { stdout: typeof handler === 'string' ? handler : JSON.stringify(handler), stderr: '' };
      }
    }
    throw new Error(`Unmocked command: ${key}`);
  });
}

// ============================================================
// checkQuotas
// ============================================================
describe('checkQuotas', () => {
  afterEach(() => _resetExec());

  it('should return parsed quota data for a location', async () => {
    mockExec({
      'vm list-usage': JSON.stringify([
        { name: { value: 'basicAFamily', localizedValue: 'Basic A Family vCPUs' }, currentValue: 0, limit: 0 },
        { name: { value: 'standardDSv2Family', localizedValue: 'Standard DSv2 Family vCPUs' }, currentValue: 2, limit: 10 },
        { name: { value: 'standardDv3Family', localizedValue: 'Standard Dv3 Family vCPUs' }, currentValue: 0, limit: 4 },
      ]),
    });

    const result = await checkQuotas({ location: 'eastus' });
    assert.ok(Array.isArray(result.quotas));
    assert.equal(result.location, 'eastus');

    const basic = result.quotas.find(q => q.family === 'basicAFamily');
    assert.ok(basic, 'Should include basicAFamily');
    assert.equal(basic.limit, 0);
    assert.equal(basic.used, 0);
    assert.equal(basic.available, 0);
  });

  it('should use default location when none provided', async () => {
    let capturedArgs;
    mockExec({
      'vm list-usage': (cmd, args) => {
        capturedArgs = args;
        return { stdout: '[]', stderr: '' };
      },
    });

    await checkQuotas({});
    assert.ok(capturedArgs.some(a => a === 'eastus'), 'Should default to eastus');
  });

  it('should throw when az CLI fails', async () => {
    mockExec({
      'vm list-usage': new Error('az: command not found'),
    });

    await assert.rejects(
      () => checkQuotas({ location: 'eastus' }),
      /az: command not found/
    );
  });

  it('should flag families needing quota for B1', async () => {
    mockExec({
      'vm list-usage': JSON.stringify([
        { name: { value: 'basicAFamily', localizedValue: 'Basic A Family vCPUs' }, currentValue: 0, limit: 0 },
      ]),
    });

    const result = await checkQuotas({ location: 'eastus' });
    const basic = result.quotas.find(q => q.family === 'basicAFamily');
    assert.equal(basic.available, 0);
    assert.ok(result.summary.includes('basicAFamily'), 'Summary should mention families with 0 available');
  });
});

// ============================================================
// requestQuotaIncrease
// ============================================================
describe('requestQuotaIncrease', () => {
  afterEach(() => _resetExec());

  it('should request quota increase and return result', async () => {
    mockExec({
      'account show': JSON.stringify({ id: 'sub-123' }),
      'provider register': '',
      'rest': JSON.stringify({
        properties: { provisioningState: 'Succeeded' },
      }),
    });

    const result = await requestQuotaIncrease({
      location: 'eastus',
      family: 'basicAFamily',
      newLimit: 4,
    });

    assert.equal(result.state, 'Succeeded');
    assert.equal(result.family, 'basicAFamily');
    assert.equal(result.requestedLimit, 4);
  });

  it('should default family to basicAFamily if not provided', async () => {
    let capturedUrl;
    mockExec({
      'account show': JSON.stringify({ id: 'sub-123' }),
      'provider register': '',
      'rest': (cmd, args) => {
        capturedUrl = args.find((a, i) => args[i - 1] === '--url');
        return { stdout: JSON.stringify({ properties: { provisioningState: 'Succeeded' } }), stderr: '' };
      },
    });

    await requestQuotaIncrease({ location: 'eastus' });
    assert.ok(capturedUrl.includes('basicAFamily'), 'Should default to basicAFamily');
  });

  it('should handle quota request failure gracefully', async () => {
    mockExec({
      'account show': JSON.stringify({ id: 'sub-123' }),
      'provider register': '',
      'rest': new Error('QuotaExceeded: limit too high'),
    });

    const result = await requestQuotaIncrease({
      location: 'eastus',
      family: 'basicAFamily',
      newLimit: 100,
    });

    assert.equal(result.state, 'Failed');
    assert.ok(result.error.includes('QuotaExceeded'));
  });

  it('should require location', async () => {
    await assert.rejects(
      () => requestQuotaIncrease({}),
      /location is required/
    );
  });
});

// ============================================================
// listResources
// ============================================================
describe('listResources', () => {
  afterEach(() => _resetExec());

  it('should return resource groups and their resources', async () => {
    mockExec({
      'group list': JSON.stringify([
        { name: 'dnd-platform-rg', location: 'eastus' },
      ]),
      'resource list': JSON.stringify([
        { name: 'dnd-platform-api', type: 'Microsoft.Web/sites', resourceGroup: 'dnd-platform-rg' },
        { name: 'dnd-platform-plan', type: 'Microsoft.Web/serverfarms', resourceGroup: 'dnd-platform-rg' },
      ]),
    });

    const result = await listResources({});
    assert.ok(Array.isArray(result.resourceGroups));
    assert.equal(result.resourceGroups[0].name, 'dnd-platform-rg');
    assert.ok(Array.isArray(result.resourceGroups[0].resources));
    assert.equal(result.resourceGroups[0].resources.length, 2);
  });

  it('should filter by resource group when specified', async () => {
    let capturedArgs;
    mockExec({
      'resource list': (cmd, args) => {
        capturedArgs = args;
        return { stdout: '[]', stderr: '' };
      },
    });

    await listResources({ resourceGroup: 'my-rg' });
    assert.ok(capturedArgs.includes('my-rg'), 'Should filter by resource group');
  });
});

// ============================================================
// getAppServicePlan
// ============================================================
describe('getAppServicePlan', () => {
  afterEach(() => _resetExec());

  it('should return plan details', async () => {
    mockExec({
      'appservice plan list': JSON.stringify([
        {
          name: 'dnd-platform-plan',
          resourceGroup: 'dnd-platform-rg',
          sku: { name: 'F1', tier: 'Free', capacity: 1 },
          properties: { status: 'Ready', numberOfSites: 2 },
          location: 'eastus',
        },
      ]),
    });

    const result = await getAppServicePlan({});
    assert.ok(result.plan);
    assert.equal(result.plan.name, 'dnd-platform-plan');
    assert.equal(result.plan.sku, 'F1');
    assert.equal(result.plan.tier, 'Free');
  });

  it('should return not found when no plans exist', async () => {
    mockExec({
      'appservice plan list': '[]',
    });

    const result = await getAppServicePlan({});
    assert.equal(result.plan, null);
    assert.ok(result.message.includes('No App Service Plan'));
  });
});

// ============================================================
// upgradeAppServicePlan
// ============================================================
describe('upgradeAppServicePlan', () => {
  afterEach(() => _resetExec());

  it('should upgrade plan and return new SKU', async () => {
    mockExec({
      'appservice plan list': JSON.stringify([
        { name: 'dnd-plan', resourceGroup: 'dnd-rg', sku: { name: 'F1' } },
      ]),
      'appservice plan update': JSON.stringify({
        name: 'dnd-plan',
        sku: { name: 'B1', tier: 'Basic' },
      }),
      'webapp list': JSON.stringify([
        { name: 'dnd-gw' },
      ]),
      'webapp config set': '',
    });

    const result = await upgradeAppServicePlan({ targetSku: 'B1' });
    assert.equal(result.previousSku, 'F1');
    assert.equal(result.newSku, 'B1');
    assert.equal(result.plan, 'dnd-plan');
  });

  it('should skip if already on target SKU', async () => {
    mockExec({
      'appservice plan list': JSON.stringify([
        { name: 'dnd-plan', resourceGroup: 'dnd-rg', sku: { name: 'B1' } },
      ]),
    });

    const result = await upgradeAppServicePlan({ targetSku: 'B1' });
    assert.ok(result.message.includes('already'));
  });

  it('should require targetSku', async () => {
    await assert.rejects(
      () => upgradeAppServicePlan({}),
      /targetSku is required/
    );
  });

  it('should enable WebSockets on gateway when upgrading from F1', async () => {
    let websocketsEnabled = false;
    mockExec({
      'appservice plan list': JSON.stringify([
        { name: 'dnd-plan', resourceGroup: 'dnd-rg', sku: { name: 'F1' } },
      ]),
      'appservice plan update': JSON.stringify({
        name: 'dnd-plan',
        sku: { name: 'B1', tier: 'Basic' },
      }),
      'webapp list': JSON.stringify([
        { name: 'dnd-gw' },
      ]),
      'webapp config set': (cmd, args) => {
        if (args.includes('--web-sockets-enabled') && args.includes('true')) {
          websocketsEnabled = true;
        }
        return { stdout: '', stderr: '' };
      },
    });

    await upgradeAppServicePlan({ targetSku: 'B1' });
    assert.ok(websocketsEnabled, 'Should enable WebSockets on gateway');
  });
});

// ============================================================
// listLocations
// ============================================================
describe('listLocations', () => {
  afterEach(() => _resetExec());

  it('should return available Azure locations', async () => {
    mockExec({
      'account list-locations': JSON.stringify([
        { name: 'eastus', displayName: 'East US' },
        { name: 'westus2', displayName: 'West US 2' },
      ]),
    });

    const result = await listLocations();
    assert.ok(Array.isArray(result.locations));
    assert.equal(result.locations.length, 2);
    assert.equal(result.locations[0].name, 'eastus');
  });
});
