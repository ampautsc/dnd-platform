#!/usr/bin/env node

/**
 * Azure MCP Server
 *
 * A Model Context Protocol server that provides Azure infrastructure
 * management tools. Requires the `az` CLI to be installed and
 * authenticated on the host.
 *
 * Tools provided:
 *   - check_quotas:          Check VM compute quotas in a region
 *   - request_quota_increase: Request a quota increase for a VM family
 *   - list_resources:        List Azure resource groups and their resources
 *   - get_app_service_plan:  Get current App Service Plan details (SKU, tier)
 *   - upgrade_app_service_plan: Upgrade the App Service Plan to a new SKU
 *   - list_locations:        List available Azure regions
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
  checkQuotas,
  requestQuotaIncrease,
  listResources,
  getAppServicePlan,
  upgradeAppServicePlan,
  listLocations,
} from './lib/azure-ops.mjs';

const server = new Server(
  { name: 'azure-mcp-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// ── Tool Definitions ────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'check_quotas',
      description:
        'Check Azure compute VM quotas in a region. Shows current usage, limits, and available capacity for each VM family. ' +
        'Use this before provisioning to verify quota availability. Highlights families with zero available quota.',
      inputSchema: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'Azure region (e.g., "eastus", "westus2"). Defaults to "eastus".',
          },
        },
        required: [],
      },
    },
    {
      name: 'request_quota_increase',
      description:
        'Request a VM quota increase for a specific VM family in a region. ' +
        'Common families: "basicAFamily" (needed for B1/B2/B3 App Service Plans), ' +
        '"standardDSv2Family" (for S1/S2/S3), "standardDv3Family" (for P1v3/P2v3/P3v3). ' +
        'Approval may be instant or require Azure portal review.',
      inputSchema: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'Azure region (e.g., "eastus"). Required.',
          },
          family: {
            type: 'string',
            description: 'VM family name (e.g., "basicAFamily"). Defaults to "basicAFamily" for B1 App Service Plans.',
            enum: ['basicAFamily', 'standardDSv2Family', 'standardDv3Family'],
          },
          newLimit: {
            type: 'number',
            description: 'Requested new quota limit (vCPU count). Defaults to 4.',
          },
        },
        required: ['location'],
      },
    },
    {
      name: 'list_resources',
      description:
        'List Azure resource groups and their resources. Optionally filter by a specific resource group. ' +
        'Returns resource names, types, and locations.',
      inputSchema: {
        type: 'object',
        properties: {
          resourceGroup: {
            type: 'string',
            description: 'Optional resource group name to filter by.',
          },
        },
        required: [],
      },
    },
    {
      name: 'get_app_service_plan',
      description:
        'Get details of the current App Service Plan: name, SKU (F1/B1/S1/P1v3), tier, capacity, ' +
        'status, number of hosted apps, and location. Returns null if no plan exists.',
      inputSchema: {
        type: 'object',
        properties: {
          resourceGroup: {
            type: 'string',
            description: 'Optional resource group to search in.',
          },
        },
        required: [],
      },
    },
    {
      name: 'upgrade_app_service_plan',
      description:
        'Upgrade the App Service Plan to a new SKU tier. If upgrading from F1 (Free), ' +
        'automatically enables WebSockets on the gateway app. ' +
        'Valid SKUs: B1 (~$13/mo, WebSockets), S1 (~$73/mo, staging slots), P1v3 (~$138/mo, high-traffic). ' +
        'Requires sufficient VM quota — use check_quotas first.',
      inputSchema: {
        type: 'object',
        properties: {
          targetSku: {
            type: 'string',
            description: 'The SKU to upgrade to.',
            enum: ['B1', 'S1', 'P1v3'],
          },
          resourceGroup: {
            type: 'string',
            description: 'Optional resource group to search in.',
          },
        },
        required: ['targetSku'],
      },
    },
    {
      name: 'list_locations',
      description: 'List all available Azure regions. Useful for choosing a deployment region.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  ],
}));

// ── Tool Execution ──────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      case 'check_quotas':
        result = await checkQuotas(args || {});
        break;

      case 'request_quota_increase':
        result = await requestQuotaIncrease(args || {});
        break;

      case 'list_resources':
        result = await listResources(args || {});
        break;

      case 'get_app_service_plan':
        result = await getAppServicePlan(args || {});
        break;

      case 'upgrade_app_service_plan':
        result = await upgradeAppServicePlan(args || {});
        break;

      case 'list_locations':
        result = await listLocations();
        break;

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${error.message}\n\nEnsure the Azure CLI is installed and authenticated (az login).`,
      }],
      isError: true,
    };
  }
});

// ── Start Server ────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Azure MCP server running. Requires `az` CLI to be installed and authenticated.');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
