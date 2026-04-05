# Azure MCP Server

A Model Context Protocol server for managing Azure infrastructure from within VS Code Copilot.

## Prerequisites

- **Azure CLI** (`az`) installed and authenticated (`az login`)
- **Node.js 20+**

## Tools

| Tool | Description |
|---|---|
| `check_quotas` | Check VM compute quotas in a region. Shows which families have available capacity. |
| `request_quota_increase` | Request a quota increase for a specific VM family (e.g., `basicAFamily` for B1 plans). |
| `list_resources` | List Azure resource groups and their resources. |
| `get_app_service_plan` | Get current App Service Plan details (SKU, tier, capacity). |
| `upgrade_app_service_plan` | Upgrade the App Service Plan SKU (e.g., F1 → B1). Auto-enables WebSockets. |
| `list_locations` | List available Azure regions. |

## Quick Start

```bash
# Install dependencies
cd tools/azure-mcp
npm install

# Run the server (stdio transport — used by VS Code MCP)
npm start

# Run tests
npm test
```

## VS Code Integration

Already registered in `.vscode/mcp.json` as `azure-tool`. Copilot can use these tools automatically.

## Common Workflows

### Fix "Basic VM quota = 0" issue

```
1. check_quotas(location: "eastus")           → See current quota limits
2. request_quota_increase(location: "eastus")  → Request basicAFamily quota
3. upgrade_app_service_plan(targetSku: "B1")   → Upgrade from F1 to B1
```

### Check deployment status

```
1. list_resources()                            → See all Azure resources
2. get_app_service_plan()                      → Check current plan SKU/tier
```

## VM Family Reference

| App Service SKU | VM Family | Notes |
|---|---|---|
| B1, B2, B3 | `basicAFamily` | Basic tier — WebSockets, always-on |
| S1, S2, S3 | `standardDSv2Family` | Standard tier — staging slots |
| P1v3, P2v3, P3v3 | `standardDv3Family` | Premium tier — high-traffic |
| F1 | *(none)* | Free tier — shared compute, no quota needed |
