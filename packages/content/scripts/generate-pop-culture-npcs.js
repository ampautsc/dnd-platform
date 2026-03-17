import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import { config as loadEnv } from 'dotenv';

// Load .env from monorepo root (packages/content/scripts → ../../.. → root)
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '..', '..', '..', '.env') });

const USE_MOCK = !process.env.ANTHROPIC_API_KEY;
if (USE_MOCK) {
    console.warn('WARNING: ANTHROPIC_API_KEY not set. Running in mock mode — placeholder data only.');
} else {
    console.log(`Anthropic key loaded. Model: ${process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'}`);
}

const seedDatabasePath = join(__dirname, 'npc-seed-database.json');
const promptTemplatePath = join(__dirname, 'prompts', 'npc-fantasy-wash.txt');
const outputDir = join(__dirname, '..', 'src', 'npcs', 'data');
const indexFile = join(__dirname, '..', 'src', 'npcs', 'index.js');

// Rate limit: 10,000 output tokens/min ≈ 3 NPCs/min → 20s between calls
const DELAY_MS = USE_MOCK ? 0 : 20_000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 60_000; // 60s base backoff for rate limits

/**
 * Check if an existing NPC file has real Claude data (not mock).
 * Mock files have voice = "Distinctive voice reflecting ... archetype".
 */
function hasRealData(filePath) {
    try {
        if (!existsSync(filePath)) return false;
        const data = JSON.parse(readFileSync(filePath, 'utf8'));
        return data?.personality?.voice && !data.personality.voice.includes('Distinctive voice reflecting');
    } catch { return false; }
}

async function main() {
    console.log('Loading seed database...');
    const db = JSON.parse(readFileSync(seedDatabasePath, 'utf8'));
    const promptTemplate = readFileSync(promptTemplatePath, 'utf8');

    if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
    }

    const generatedIds = [];

    for (const [universeKey, universeData] of Object.entries(db)) {
        console.log(`\nProcessing Universe: ${universeData.universe}`);
        
        for (const character of universeData.roster) {
            const outputPath = join(outputDir, `${character.id}.json`);

            // Skip characters already generated with real Claude data
            if (hasRealData(outputPath)) {
                console.log(`  -> Skipping: ${character.originalName} (${character.id}) — already has real data`);
                generatedIds.push(character.id);
                continue;
            }

            console.log(`  -> Generating: ${character.originalName} (${character.id})`);
            
            const prompt = promptTemplate
                .replace('{universeTone}', universeData.tone)
                .replace('{originalName}', character.originalName)
                .replace('{archetype}', character.archetype)
                .replace('{description}', character.description)
                .replace('{relationships}', character.relationships.join(', '))
                .replace('{id}', character.id);

            let npcData;
            if (USE_MOCK) {
                npcData = generateMock(character, universeData.tone, prompt);
            } else {
                // Retry loop with exponential backoff for rate limits
                for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                    const result = await callClaude(prompt, character.id);
                    if (result === 'RATE_LIMITED') {
                        const wait = RETRY_BASE_MS * attempt;
                        console.log(`     ⏳ Rate limited. Waiting ${wait / 1000}s before retry ${attempt}/${MAX_RETRIES}...`);
                        await new Promise(r => setTimeout(r, wait));
                        continue;
                    }
                    npcData = result;
                    break;
                }
                if (!npcData) {
                    console.warn(`     Claude failed for ${character.id} after ${MAX_RETRIES} retries — falling back to mock.`);
                    npcData = generateMock(character, universeData.tone, prompt);
                }
            }

            writeFileSync(outputPath, JSON.stringify(npcData, null, 2));
            generatedIds.push(character.id);
            console.log(`     Saved → ${outputPath}`);
            
            // Rate-limit guard — 10k output tokens/min, ~3k per NPC = ~3/min
            await new Promise(r => setTimeout(r, DELAY_MS));
        }
    }

    console.log(`\nUpdating index.js registry...`);
    updateIndex(generatedIds);
    console.log(`\nDone! Generated ${generatedIds.length} characters.`);
}

/**
 * Call Claude via raw HTTPS (matches AiAssist pattern — prompt caching enabled).
 * Returns parsed NPC object or null on failure.
 */
async function callClaude(userPrompt, characterId) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const model  = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

    const systemPrompt = [
        'You are a master D&D 5e world builder and NPC designer.',
        'Your only job is to output a single, valid JSON object conforming exactly to the schema the user provides.',
        'Do not include any markdown fences, commentary, or explanation.',
        'Output raw JSON only. No ```json, no ```, no preamble, no postamble.',
        'All string fields must be meaningful, specific, and evocative — no placeholders.',
    ].join('\n');

    const body = JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0.9,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userPrompt }],
    });

    return new Promise((resolve) => {
        const req = https.request({
            hostname: 'api.anthropic.com',
            path:     '/v1/messages',
            method:   'POST',
            headers: {
                'x-api-key':         apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-beta':    'prompt-caching-2024-07-31',
                'content-type':      'application/json',
                'content-length':    Buffer.byteLength(body),
            },
        }, res => {
            let raw = '';
            res.on('data', chunk => { raw += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed.error) {
                        const msg = parsed.error.message || '';
                        console.error(`     [Claude] API error for ${characterId}: ${msg}`);
                        if (msg.includes('rate limit')) return resolve('RATE_LIMITED');
                        return resolve(null);
                    }
                    const text = parsed.content?.[0]?.text || '';
                    if (parsed.usage) {
                        const u = parsed.usage;
                        console.log(`     [Claude] in:${u.input_tokens} cache_read:${u.cache_read_input_tokens||0} cache_write:${u.cache_creation_input_tokens||0} out:${u.output_tokens}`);
                    }
                    // Strip any accidental markdown fences
                    const json = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
                    resolve(JSON.parse(json));
                } catch (e) {
                    console.error(`     [Claude] JSON parse failed for ${characterId}: ${e.message}`);
                    resolve(null);
                }
            });
        });
        req.on('error', err => {
            console.error(`     [Claude] Request error for ${characterId}: ${err.message}`);
            resolve(null);
        });
        req.write(body);
        req.end();
    });
}

/**
 * Minimal mock character — structurally valid against the NPC schema.
 */
function generateMock(character, tone, _prompt) {
    return {
        templateKey: character.id,
        name: character.originalName,
        race: "Human",
        npcType: "neutral",
        personality: {
            voice: `Distinctive voice reflecting ${character.archetype} archetype`,
            disposition: tone.split(',')[0].trim(),
            alignment: "true neutral",
            backstory: `A fantasy-washed reimagining of ${character.originalName}: ${character.description}`,
            motivations: ["To fulfill their purpose", "To protect what matters to them"],
            fears: ["Failure", "Irrelevance"],
            mannerisms: ["Pauses before speaking", "Gestures expressively"],
            speechPatterns: ["Speaks with conviction", "Uses metaphors from their background"]
        },
        knowledge: {
            knownFactions: [],
            knownLocations: [],
            secretsHeld: [`The truth behind their origin`],
            languagesSpoken: ["Common"]
        },
        relationships: {
            allies: character.relationships.slice(0, 2),
            enemies: [],
            neutralParties: []
        },
        stats: { intelligence: 12, wisdom: 10, charisma: 12 },
        consciousnessContext: {
            innerMonologue: `Thinking about: ${character.description}`,
            currentPreoccupation: "Their next move",
            emotionalBaseline: "determined",
            socialMask: "Composed",
            contradictions: ["Confident yet secretly afraid of being found out"],
            internalConflicts: ["Duty vs desire"],
            wakeUpQuestions: ["What must I do today?", "Am I becoming who I need to be?"],
            psychologicalProfile: {
                attachmentStyle: "anxious",
                copingMechanisms: ["Humor", "Work"],
                cognitiveBiases: ["Confirmation bias"],
                moralFramework: "pragmatic"
            },
            conversationPersona: {
                defaultTrust: 0.4,
                trustEscalation: "Demonstrated reliability over time",
                informationRelease: "Only when trust is established",
                deflectionPatterns: ["Changes the subject", "Answers a question with a question"]
            },
            consciousWant: "To achieve their goals",
            unconsciousNeed: "To be truly seen and accepted",
            characterArc: {
                summary: `${character.originalName}'s journey of growth and transformation`,
                startState: "Driven but incomplete",
                endState: "Whole and purposeful",
                stages: ["Recognition of flaw", "Crisis point", "Transformation", "Resolution"]
            },
            opinionsAbout: Object.fromEntries(
                character.relationships.map(id => [id, "A complicated but important relationship"])
            )
        },
        fallbackLines: {
            player_addressed: [
                "What brings you to me?",
                "Choose your words carefully.",
                "I don't speak to just anyone."
            ],
            idle: [
                "*stares into the middle distance*",
                "*mutters something under their breath*",
                "*adjusts their gear absently*"
            ]
        }
    };
}

/**
 * Injects new NPC IDs into the NPC_FILES array in src/npcs/index.js.
 * Skips any IDs already present.
 */
function updateIndex(newIds) {
    const content = readFileSync(indexFile, 'utf8');
    
    // Parse out the existing NPC_FILES entries
    const filesMatch = content.match(/const NPC_FILES = \[([\s\S]*?)\]/);
    if (!filesMatch) {
        console.error('ERROR: Could not find NPC_FILES array in index.js — add entries manually.');
        return;
    }

    const existingEntries = filesMatch[1].match(/'([^']+)'/g)?.map(s => s.replace(/'/g, '')) ?? [];
    const toAdd = newIds.filter(id => !existingEntries.includes(id));

    if (toAdd.length === 0) {
        console.log('  index.js already up to date.');
        return;
    }

    const newEntries = toAdd.map(id => `  '${id}',`).join('\n');
    const updatedContent = content.replace(
        /const NPC_FILES = \[([\s\S]*?)\]/,
        `const NPC_FILES = [${filesMatch[1].trimEnd()}\n${newEntries}\n]`
    );

    writeFileSync(indexFile, updatedContent);
    console.log(`  Added ${toAdd.length} new entries to NPC_FILES.`);
}

main().catch(console.error);
