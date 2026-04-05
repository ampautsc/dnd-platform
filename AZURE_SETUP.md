# Azure Deployment Setup

Two things to do, then everything runs automatically.

---

## Step 1 — Azure Service Principal

Open Azure Cloud Shell (or any terminal with `az` installed) and run:

```bash
az ad sp create-for-rbac \
  --name dnd-platform-deploy \
  --role contributor \
  --scopes /subscriptions/$(az account show --query id -o tsv) \
  --sdk-auth
```

Copy the entire JSON output. In GitHub → **Settings → Secrets and variables → Actions → New repository secret**, create:

| Name | Value |
|---|---|
| `AZURE_CREDENTIALS` | *(the JSON output from above)* |

---

## Step 2 — GitHub Personal Access Token

Go to **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens** and create a token with:

- **Repository access**: this repo only
- **Permissions**: Repository secrets → Read and write, Variables → Read and write

In the same **Actions secrets** page, create:

| Name | Value |
|---|---|
| `GH_PAT` | *(the token you just created)* |

---

## Step 3 — Run the provision workflow

Go to **Actions → Provision Azure Infrastructure → Run workflow**.

Inputs:
- `resource_prefix` — a short globally unique prefix (e.g. `dnd-yourname`). If Azure says a name is taken, re-run with a different prefix.
- `location` — Azure region, e.g. `eastus` (default)
- `anthropic_api_key` — optional, paste your key to enable real LLM narration
- `groq_api_key` — optional, paste your key to enable ambient NPC reactions

The workflow will:
1. Create all Azure resources (Resource Group, App Service Plan, two App Services, Static Web App)
2. Link the API as the SWA backend (so `/api/*` calls are proxied automatically)
3. Store all deployment tokens and config as GitHub secrets/variables

When it finishes, the workflow summary shows your live URLs.

---

## Ongoing deploys

After provisioning, every push to `master` automatically triggers the relevant deploy workflow:

| What changed | Workflow triggered |
|---|---|
| `packages/client/**` | Deploy Client → Static Web App |
| `packages/api/**` (or dm/content/combat/world) | Deploy API → App Service |
| `packages/gateway/**` | Deploy Gateway → App Service |

Pull requests get a preview URL automatically (Static Web Apps PR environments).

---

## Troubleshooting

### "Operation cannot be completed without additional quota" (Basic VMs)

New Azure subscriptions often start with **0 quota for Basic VMs**. The provisioning workflow handles this automatically:

1. **It tries your requested SKU** (default: B1).
2. **It requests a quota increase** via the Azure Quota API.
3. **If the increase isn't instant**, it falls back to the **F1 (Free) tier** so resources are created.

If you're running on F1 (Free tier), the API will work but the **Gateway won't have WebSocket support**. To upgrade:

1. Go to **Actions → Manage Azure Infrastructure → request-quota-increase** to request Basic VM quota.
2. Check the [Azure Quota portal](https://portal.azure.com/#view/Microsoft_Azure_Capacity/QuotaMenuBlade/~/myQuotas) for approval status.
3. Once approved, go to **Actions → Manage Azure Infrastructure → upgrade-plan-sku** and select B1.

Alternatively, you can request the quota increase manually:

```bash
# Check current quotas
az vm list-usage --location eastus -o table

# Request increase via Azure portal
# https://portal.azure.com/#view/Microsoft_Azure_Capacity/QuotaMenuBlade/~/myQuotas
# → Select "Compute" → Filter for "Basic" → Request increase to 4
```

### Available SKUs

| SKU | Cost | WebSockets | Always-On | Best For |
|---|---|---|---|---|
| F1 | Free | ❌ | ❌ | Initial setup / testing API only |
| B1 | ~$13/mo | ✅ | ✅ | Development / small deployments |
| S1 | ~$73/mo | ✅ | ✅ | Production with staging slots |
| P1v3 | ~$138/mo | ✅ | ✅ | High-traffic production |
