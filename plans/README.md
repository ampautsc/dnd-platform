# Plans Directory

This directory contains development plan documents created through the Plan MCP tool.

## Rules
- Only `.md` files belong here
- Plans are created via the `write_plan` MCP tool
- No source code, no configuration files
- Plans follow the best-practices template (see `tools/plan-mcp/lib/template.mjs`)

## Usage
In VS Code Copilot **Plan mode** with tools enabled:
- Ask Copilot to create a plan — it calls `write_plan`
- Ask Copilot to review a plan — it calls `read_plan`
- Ask what plans exist — it calls `list_plans`

The tool physically cannot edit any file outside this directory.
