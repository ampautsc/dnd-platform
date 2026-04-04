# Handoff — 2026-04-04: Post-Azure-PR-Merge

> **Read this first.** This document exists because the PR containing the Azure deployment
> workflows had to be merged before those workflows were visible in GitHub Actions.
> Merging closed the previous session. This is the full context dump so you can pick up
> exactly where we left off.

---

## What Was Just Merged

**PR: `copilot/deploy-to-cloud-azure-pipeline`**

Added 4 GitHub Actions workflows:

| File | Purpose |
|---|---|
| `.github/workflows/azure-provision.yml` | One-time provisioning — creates all Azure resources, wires up GitHub secrets |
| `.github/workflows/deploy-client.yml` | Deploys `packages/client/` to Azure Static Web Apps on push to master |
| `.github/workflows/deploy-api.yml` | Deploys `packages/api/` (+ dm/content/combat/world) to Azure App Service |
| `.github/workflows/deploy-gateway.yml` | Deploys `packages/gateway/` to Azure App Service |

**Why the PR had to be merged:** GitHub only shows `workflow_dispatch` triggers from the
default branch (master). The workflows were on the PR branch — invisible in the Actions tab
until merged.

---

## What Needs to Happen RIGHT NOW (Azure Setup)

The full instructions are in `AZURE_SETUP.md`. Short version:

### Step 1 — Create Azure Service Principal
In Azure Cloud Shell:
```bash
az ad sp create-for-rbac \
  --name dnd-platform-deploy \
  --role contributor \
  --scopes /subscriptions/$(az account show --query id -o tsv) \
  --sdk-auth
```
Add the JSON output as GitHub secret: `AZURE_CREDENTIALS`

### Step 2 — Create GitHub PAT
GitHub → Settings → Developer settings → Fine-grained tokens
- Permissions: Repository secrets → Read/write, Variables → Read/write
Add as GitHub secret: `GH_PAT`

### Step 3 — Run the Provision Workflow
GitHub → Actions → **Provision Azure Infrastructure** → Run workflow
- `resource_prefix`: a short globally unique prefix (e.g. `dnd-amp`)
- `location`: `eastus` (default)
- `anthropic_api_key`: paste from `.keys/anthropic.env` (for real LLM narration)
- `groq_api_key`: paste from Groq console (for ambient NPC reactions)

The workflow creates all Azure resources and stores all tokens as GitHub secrets.
After it finishes, the workflow summary shows your live URLs.

---

## What Was Being Worked On Before the Azure Detour

The last real feature work (2026-04-03) was **`worldKnowledge.xml` subsection restructuring**:

- **File**: `packages/dm/src/prompts/worldKnowledge.xml`
- **State**: Complete. 7 top-level sections, each with semantic subsections. 89/89 tests passing.
- **Test file**: `packages/dm/__tests__/prompts/worldKnowledge.test.js`

### The Prompt Caching Context
The work leading up to this was establishing **Anthropic prompt caching** for NPC consciousness:

- **LLMProvider** (`packages/dm/src/services/LLMProvider.js`) — Prompt caching is enabled.
  System prompts are sent as structured `[{ type: 'text', text, cache_control: { type: 'ephemeral' } }]` arrays.
- **Default model**: `claude-sonnet-4-6` (changed from haiku — see 2026-04-02 history)
- **Cross-NPC prefix sharing**: Confirmed working on Sonnet 4.6. worldKnowledge block (~1,903 tokens) > Sonnet's 1,024 minimum.
- **worldKnowledge.xml current size**: ~9,617 chars / ~2,200 tokens (still below Haiku 4.5's 4,096 minimum)
- **Pending question** (never fully resolved): Should worldKnowledge be expanded to 4,096+ tokens to enable Haiku caching, or keep it focused and stay on Sonnet?

### The NPC Consciousness Architecture
- **NPC files**: `packages/dm/src/prompts/npcs/` — each NPC has a JSON consciousness file
- **Millhaven knowledge**: `packages/dm/src/prompts/millhavenKnowledge.xml` — setting-specific context separate from universal worldKnowledge
- **The three-block prompt structure**: (1) worldKnowledge [cacheable prefix], (2) NPC consciousness [cacheable per-NPC], (3) scene/encounter context [uncached, changes per interaction]

---

## Current Test State

As of the last commit on master (before the Azure PR):
```
packages/dm   — 89/89 passing (including worldKnowledge + millhavenKnowledge)
packages/combat — 516 tests passing
packages/content — passing
```

Run tests:
```bash
cd packages/dm && node --test
cd packages/combat && npm test
```

---

## Next Work (What the User Will Likely Ask For Next)

The pending plan in `plans/world-simulation-tick-engine.md` describes building:
- **`WorldTickEngine`** — background tick engine for `packages/world/`
- NPC daily schedules (24 time slots, location/activity/mood)
- Villain storyline engine (advances each tick regardless of player presence)
- Location/region state (weather, events, seasons)
- Downtime activity processor
- Public interface for `packages/dm/` to query world state

This was drafted but never started. It may or may not be the next task the user wants.

---

## Key User Preferences (Hard-Won, Do Not Forget)

1. **Commoner perspective filter** — worldKnowledge facts must be what a village farmer would know. Not scholar/adventurer knowledge. No schools of magic. No alignment codes. No exotic cosmology. No fan lore that isn't in the PHB/SRD.
2. **PHB/SRD citations required** — every fact needs a source. "Common is a trade language" is fan lore, not PHB canon.
3. **Outline before content** — when rewriting major content, the user wants 10+ outline iterations before a single word of content is written. Do not rush to prose.
4. **TDD** — tests before implementation, always. Tests assert specific behavior.
5. **Default model**: `claude-sonnet-4-6` everywhere (not haiku, not older sonnet versions).
6. **Never delegate** — do not tell the user "now you run X." Automate everything possible.

---

## Key Files

| Path | What it is |
|---|---|
| `packages/dm/src/services/LLMProvider.js` | LLM provider with prompt caching enabled |
| `packages/dm/src/prompts/worldKnowledge.xml` | Universal D&D 5e commoner knowledge |
| `packages/dm/src/prompts/worldKnowledge.js` | JS export for worldKnowledge.xml |
| `packages/dm/src/prompts/millhavenKnowledge.xml` | Millhaven setting context |
| `packages/dm/src/prompts/npcs/` | NPC consciousness JSON files |
| `packages/dm/__tests__/prompts/worldKnowledge.test.js` | 89 tests for worldKnowledge |
| `plans/world-simulation-tick-engine.md` | Drafted plan for world/ package |
| `AZURE_SETUP.md` | Full Azure setup instructions |
| `skills/` | All skill files — check the index in copilot-instructions.md |
| `history/` | Daily history files — read the most recent ones |

---

## Skills Index Matches for Likely Next Tasks

If working on **NPC/LLM tasks**: load these skills first:
- `skills/code/anthropic-prompt-caching.md` — #anthropic #prompt-caching
- `skills/code/xml-prompt-engineering.md` — #xml #prompt
- `skills/code/npc-consciousness-creation.md` — #npc #consciousness
- `skills/code/npc-consciousness-json-authoring.md` — #npc #json

If working on **world/ tick engine**: load these skills first:
- `skills/code/combat-engine-patterns.md` — immutable state pattern applies here too
- `skills/code/dm-mvp-tests-first-bootstrap.md` — bootstrapping a new package with TDD

---

## Session Closed Reason

Merged PR `copilot/deploy-to-cloud-azure-pipeline` which added Azure CI/CD workflows.
Merge was required because GitHub only surfaces `workflow_dispatch` triggers from the default branch.
