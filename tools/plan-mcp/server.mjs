#!/usr/bin/env node

/**
 * Plan MCP Server
 * 
 * A Model Context Protocol server that provides plan-file-only editing tools
 * for use in VS Code Copilot Plan mode. This server enforces a hard boundary:
 * it can ONLY read/write .md files within the workspace's plans/ directory.
 * 
 * Tools provided:
 *   - list_plans: List all plan files
 *   - read_plan: Read a specific plan file
 *   - write_plan: Create or update a plan file (with best-practices template)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { resolve } from 'node:path';

import { listPlans, readPlan, writePlan } from './lib/plan-ops.mjs';
import { generatePlanTemplate, PLANNING_BEST_PRACTICES } from './lib/template.mjs';

// The workspace root is passed as the first CLI argument
const WORKSPACE_ROOT = process.argv[2] || process.cwd();
const PLANS_DIR = resolve(WORKSPACE_ROOT, 'plans');

const server = new Server(
  { name: 'plan-mcp-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// ── Tool Definitions ────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_plans',
      description: 'List all development plan files in the plans/ directory. Returns filenames only.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'read_plan',
      description: 'Read the contents of a specific plan file from the plans/ directory.',
      inputSchema: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            description: 'The filename of the plan to read (e.g., "combat-refactor.md"). Must be a .md file in the plans/ directory.',
          },
        },
        required: ['filename'],
      },
    },
    {
      name: 'write_plan',
      description: `Create or update a development plan file in the plans/ directory. 
This is the ONLY editing tool available in Plan mode — it can ONLY write .md files to the plans/ directory.
No source code, no config files, no other locations.

${PLANNING_BEST_PRACTICES}

If the 'useTemplate' flag is true and no content is provided, a best-practices template will be generated.
If content is provided, it is written as-is.`,
      inputSchema: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            description: 'The filename for the plan (e.g., "combat-refactor.md"). Must end in .md. No paths — just the filename.',
          },
          title: {
            type: 'string',
            description: 'The title of the plan. Used for template generation and as the H1 heading.',
          },
          content: {
            type: 'string',
            description: 'The full markdown content of the plan. If provided, this is written directly. If omitted and useTemplate is true, a structured template is generated.',
          },
          useTemplate: {
            type: 'boolean',
            description: 'If true and content is not provided, generates a structured plan template with best-practices sections.',
          },
          sectionContent: {
            type: 'object',
            description: 'Optional content for specific template sections. Keys are section names: objective, successCriteria, scope, architectureDecisions, phases, tasks, risks, testingStrategy, dependencies, openQuestions.',
            properties: {
              objective: { type: 'string' },
              successCriteria: { type: 'string' },
              scope: { type: 'string' },
              architectureDecisions: { type: 'string' },
              phases: { type: 'string' },
              tasks: { type: 'string' },
              risks: { type: 'string' },
              testingStrategy: { type: 'string' },
              dependencies: { type: 'string' },
              openQuestions: { type: 'string' },
            },
          },
        },
        required: ['filename'],
      },
    },
  ],
}));

// ── Tool Execution ──────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list_plans': {
        const plans = await listPlans(PLANS_DIR);
        if (plans.length === 0) {
          return {
            content: [{ type: 'text', text: 'No plan files found in plans/ directory. Use write_plan to create one.' }],
          };
        }
        return {
          content: [{ type: 'text', text: `Plan files:\n${plans.map(p => `  - ${p}`).join('\n')}` }],
        };
      }

      case 'read_plan': {
        const content = await readPlan(PLANS_DIR, args.filename);
        return {
          content: [{ type: 'text', text: content }],
        };
      }

      case 'write_plan': {
        let planContent = args.content;

        // Generate from template if no content provided
        if (!planContent && (args.useTemplate || args.title)) {
          const title = args.title || args.filename.replace('.md', '').replace(/[-_]/g, ' ');
          planContent = generatePlanTemplate(title, args.sectionContent || {});
        }

        if (!planContent) {
          return {
            content: [{ type: 'text', text: 'Error: Either provide content directly, or set useTemplate: true with a title.' }],
            isError: true,
          };
        }

        const writtenPath = await writePlan(PLANS_DIR, args.filename, planContent);
        return {
          content: [{ type: 'text', text: `Plan written to: ${writtenPath}` }],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// ── Start Server ────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Plan MCP server running. Plans dir: ${PLANS_DIR}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
