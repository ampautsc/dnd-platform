/**
 * Azure Operations Library
 *
 * Wraps the `az` CLI to provide structured operations for managing
 * Azure infrastructure: quotas, App Service Plans, resource listing.
 *
 * All functions return plain objects (not CLI text) so the MCP server
 * can return structured JSON to the agent.
 *
 * The `az` CLI must be installed and authenticated (`az login`) on
 * the host running this server.
 */

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFileCb);

// ── Injectable exec (for testing) ───────────────────────────

let _exec = async (cmd, args) => {
  const { stdout, stderr } = await execFileAsync(cmd, args, {
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120_000,
  });
  return { stdout, stderr };
};

/** @internal — inject a mock exec for testing */
export function _setExec(fn) { _exec = fn; }

/** @internal — restore real exec */
export function _resetExec() {
  _exec = async (cmd, args) => {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120_000,
    });
    return { stdout, stderr };
  };
}

// ── Helpers ─────────────────────────────────────────────────

async function az(...args) {
  const { stdout } = await _exec('az', args);
  return stdout;
}

function azJson(...args) {
  return az(...args, '-o', 'json').then(out => JSON.parse(out || '[]'));
}

const SKU_FAMILIES = {
  B1: 'basicAFamily', B2: 'basicAFamily', B3: 'basicAFamily',
  S1: 'standardDSv2Family', S2: 'standardDSv2Family', S3: 'standardDSv2Family',
  P1v3: 'standardDv3Family', P2v3: 'standardDv3Family', P3v3: 'standardDv3Family',
};

// ── Quota Operations ────────────────────────────────────────

/**
 * Check VM quotas for a given Azure location.
 * Returns all quotas with a summary of which families have insufficient quota.
 *
 * @param {{ location?: string }} opts
 * @returns {Promise<{ location: string, quotas: Array, summary: string }>}
 */
export async function checkQuotas({ location = 'eastus' } = {}) {
  const raw = await azJson('vm', 'list-usage', '--location', location);

  const relevantFamilies = new Set(Object.values(SKU_FAMILIES));

  const quotas = raw.map(entry => ({
    family: entry.name.value,
    displayName: entry.name.localizedValue,
    used: entry.currentValue,
    limit: entry.limit,
    available: entry.limit - entry.currentValue,
  }));

  const zeroAvailable = quotas.filter(q =>
    relevantFamilies.has(q.family) && q.available <= 0
  );

  const summary = zeroAvailable.length > 0
    ? `⚠️  These App Service VM families have NO available quota in ${location}: ${zeroAvailable.map(q => q.family).join(', ')}. Use request_quota_increase to request more.`
    : `✅ All App Service VM families have available quota in ${location}.`;

  return { location, quotas, summary };
}

/**
 * Request a quota increase for a specific VM family.
 *
 * @param {{ location: string, family?: string, newLimit?: number }} opts
 * @returns {Promise<{ family: string, requestedLimit: number, state: string, error?: string }>}
 */
export async function requestQuotaIncrease({ location, family = 'basicAFamily', newLimit = 4 } = {}) {
  if (!location) throw new Error('location is required');

  // Get subscription ID
  const account = await azJson('account', 'show');
  const subId = account.id;

  // Register the Quota resource provider (idempotent)
  try {
    await az('provider', 'register', '--namespace', 'Microsoft.Quota');
  } catch { /* may already be registered */ }

  // Submit the quota increase request
  const url = `https://management.azure.com/subscriptions/${subId}/providers/Microsoft.Compute/locations/${location}/providers/Microsoft.Quota/quotas/${family}?api-version=2023-02-01`;
  const body = JSON.stringify({
    properties: {
      limit: { limitObjectType: 'LimitValue', value: newLimit },
      name: { value: family },
    },
  });

  try {
    const response = await azJson('rest', '--method', 'put', '--url', url, '--body', body);
    const state = response?.properties?.provisioningState || 'Unknown';

    return {
      family,
      requestedLimit: newLimit,
      state,
      ...(state === 'Succeeded' ? {} : { note: 'If InProgress, check Azure portal for approval status.' }),
    };
  } catch (err) {
    return {
      family,
      requestedLimit: newLimit,
      state: 'Failed',
      error: err.message,
    };
  }
}

// ── Resource Operations ─────────────────────────────────────

/**
 * List Azure resources, optionally filtered by resource group.
 *
 * @param {{ resourceGroup?: string }} opts
 * @returns {Promise<{ resourceGroups: Array }>}
 */
export async function listResources({ resourceGroup } = {}) {
  if (resourceGroup) {
    const resources = await azJson('resource', 'list', '--resource-group', resourceGroup);
    return {
      resourceGroups: [{
        name: resourceGroup,
        resources: resources.map(r => ({
          name: r.name,
          type: r.type,
          resourceGroup: r.resourceGroup,
        })),
      }],
    };
  }

  const groups = await azJson('group', 'list');
  const result = [];

  for (const g of groups) {
    const resources = await azJson('resource', 'list', '--resource-group', g.name);
    result.push({
      name: g.name,
      location: g.location,
      resources: resources.map(r => ({
        name: r.name,
        type: r.type,
        resourceGroup: r.resourceGroup,
      })),
    });
  }

  return { resourceGroups: result };
}

/**
 * Get the first App Service Plan's details.
 *
 * @param {{ resourceGroup?: string }} opts
 * @returns {Promise<{ plan: object | null, message?: string }>}
 */
export async function getAppServicePlan({ resourceGroup } = {}) {
  const args = ['appservice', 'plan', 'list'];
  if (resourceGroup) args.push('--resource-group', resourceGroup);

  const plans = await azJson(...args);

  if (plans.length === 0) {
    return { plan: null, message: 'No App Service Plan found. Run the provision workflow first.' };
  }

  const p = plans[0];
  return {
    plan: {
      name: p.name,
      resourceGroup: p.resourceGroup,
      sku: p.sku?.name,
      tier: p.sku?.tier,
      capacity: p.sku?.capacity,
      status: p.properties?.status,
      numberOfSites: p.properties?.numberOfSites,
      location: p.location,
    },
  };
}

/**
 * Upgrade the App Service Plan to a new SKU tier.
 * If the current SKU is F1, also enables WebSockets on gateway apps.
 *
 * @param {{ targetSku: string, resourceGroup?: string }} opts
 * @returns {Promise<{ plan: string, previousSku: string, newSku: string, webSocketsEnabled?: boolean, message?: string }>}
 */
export async function upgradeAppServicePlan({ targetSku, resourceGroup } = {}) {
  if (!targetSku) throw new Error('targetSku is required');

  const args = ['appservice', 'plan', 'list'];
  if (resourceGroup) args.push('--resource-group', resourceGroup);

  const plans = await azJson(...args);
  if (plans.length === 0) {
    throw new Error('No App Service Plan found. Run the provision workflow first.');
  }

  const plan = plans[0];
  const currentSku = plan.sku?.name;
  const rg = plan.resourceGroup;

  if (currentSku === targetSku) {
    return {
      plan: plan.name,
      previousSku: currentSku,
      newSku: targetSku,
      message: `Plan ${plan.name} is already on ${targetSku}. Nothing to do.`,
    };
  }

  // Upgrade
  const updated = await azJson(
    'appservice', 'plan', 'update',
    '--name', plan.name,
    '--resource-group', rg,
    '--sku', targetSku,
  );

  const result = {
    plan: plan.name,
    previousSku: currentSku,
    newSku: updated?.sku?.name || targetSku,
  };

  // If upgrading from F1, enable WebSockets on gateway
  if (currentSku === 'F1') {
    const apps = await azJson('webapp', 'list', '--resource-group', rg);
    const gwApp = apps.find(a => a.name.includes('gw'));
    if (gwApp) {
      await az(
        'webapp', 'config', 'set',
        '--name', gwApp.name,
        '--resource-group', rg,
        '--web-sockets-enabled', 'true',
      );
      result.webSocketsEnabled = true;
      result.gatewayApp = gwApp.name;
    }
  }

  return result;
}

// ── Location Operations ─────────────────────────────────────

/**
 * List available Azure locations.
 *
 * @returns {Promise<{ locations: Array<{ name: string, displayName: string }> }>}
 */
export async function listLocations() {
  const raw = await azJson('account', 'list-locations');
  return {
    locations: raw.map(l => ({
      name: l.name,
      displayName: l.displayName,
    })),
  };
}
