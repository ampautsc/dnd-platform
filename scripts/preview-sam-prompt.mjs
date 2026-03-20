import { readFileSync } from 'fs';
import { buildEncounterSystemPrompt } from '../packages/dm/src/npc/buildEncounterSystemPrompt.js';

const sam = JSON.parse(readFileSync(new URL('../packages/content/src/npcs/data/sam_malone.json', import.meta.url)));

const prompt = buildEncounterSystemPrompt({
  personality: sam,
  location: null,
  runtimeSnapshot: null,
  ageInDays: Math.floor(sam.age * 365.25),
  memorySummary: null,
  evolutionSummary: '',
  relationshipContext: '',
});

console.log(prompt);
console.log('\n\n--- TOKEN ESTIMATE ---');
console.log('Characters:', prompt.length);
console.log('Estimated tokens (chars/4):', Math.ceil(prompt.length / 4));
