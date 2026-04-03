import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '..', '..', '..', '.env') });

if (!process.env.ANTHROPIC_API_KEY) {
    console.error('FATAL: No ANTHROPIC_API_KEY in .env');
    process.exit(1);
}

const promptTemplate = readFileSync(join(__dirname, 'prompts', 'npc-fantasy-wash.txt'), 'utf8');

// Pick one character: Bender
const character = {
    id: 'bender_the_robot',
    originalName: 'Bender',
    archetype: 'Kleptomaniac Construct',
    description: 'Alcohol-fueled, chain-smoking robot fundamentally programmed to steal, commit crimes, and complain.',
    relationships: ['fry_the_delivery_boy'],
};
const tone = 'Sci-fi comedy, staggering incompetence, corporate greed.';

const prompt = promptTemplate
    .replace('{universeTone}', tone)
    .replace('{originalName}', character.originalName)
    .replace('{archetype}', character.archetype)
    .replace('{description}', character.description)
    .replace('{relationships}', character.relationships.join(', '))
    .replace('{id}', character.id);

const systemPrompt = [
    'You are a master D&D 5e world builder and NPC designer.',
    'Your only job is to output a single, valid JSON object conforming exactly to the schema the user provides.',
    'Do not include any markdown fences, commentary, or explanation.',
    'Output raw JSON only. No ```json, no ```, no preamble, no postamble.',
    'All string fields must be meaningful, specific, and evocative — no placeholders.',
].join('\n');

const body = JSON.stringify({
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
    max_tokens: 4096,
    temperature: 0.9,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: prompt }],
});

console.log('Calling Claude for bender_the_robot...');

const req = https.request({
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
    },
}, res => {
    let raw = '';
    res.on('data', chunk => { raw += chunk; });
    res.on('end', () => {
        try {
            const parsed = JSON.parse(raw);
            if (parsed.error) {
                console.error('API Error:', parsed.error);
                process.exit(1);
            }
            const text = (parsed.content?.[0]?.text || '')
                .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
            const u = parsed.usage;
            console.log(`Usage: in:${u.input_tokens} out:${u.output_tokens}`);

            const npc = JSON.parse(text);
            const outPath = join(__dirname, '..', 'src', 'npcs', 'data', 'bender_the_robot.json');
            writeFileSync(outPath, JSON.stringify(npc, null, 2));
            console.log(`\nWrote to ${outPath}`);
            console.log('\n=== FULL OUTPUT ===');
            console.log(JSON.stringify(npc, null, 2));
        } catch (e) {
            console.error('FAILED:', e.message);
            console.log('Raw:', raw.slice(0, 1000));
            process.exit(1);
        }
    });
});
req.on('error', e => { console.error('Request error:', e.message); process.exit(1); });
req.write(body);
req.end();
