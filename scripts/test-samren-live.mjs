import { GroqReactionProvider } from '../packages/dm/src/ambient/GroqReactionProvider.js';
import { buildReactionPrompt } from '../packages/dm/src/ambient/buildReactionPrompt.js';
import { getNpc } from '../packages/content/src/npcs/index.js';

const samren = getNpc('samren_malondar');
const provider = new GroqReactionProvider({ apiKey: process.env.GROQ_API_KEY });
await provider.init();

const prompt = buildReactionPrompt(samren, { speakerName: 'Adventurer', locationName: 'Bottoms Up' });
console.log('--- PROMPT (first 400 chars) ---');
console.log(prompt.slice(0, 400));
console.log('\n--- CALLING GROQ ---');

const sw = Date.now();
const result = await provider.evaluateReaction(prompt, 'Barkeep! Pour me your coldest ale!');
console.log(`Elapsed: ${Date.now() - sw}ms`);
console.log('Result:', result);

await provider.dispose();
