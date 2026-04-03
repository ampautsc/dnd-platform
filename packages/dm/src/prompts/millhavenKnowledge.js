import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Millhaven setting knowledge, structured as XML.
 * 
 * Contains town-specific details: overview, geography, factions, economy,
 * social norms, and local religion for the town of Millhaven in the Vale.
 * 
 * Designed as a supplementary context block for LLM system prompts,
 * layered after the universal world knowledge.
 * 
 * Usage in prompt builders:
 *   import { millhavenKnowledge } from '../prompts/millhavenKnowledge.js';
 *   // Insert into system prompt after worldKnowledge
 */
export const millhavenKnowledge = readFileSync(
  resolve(__dirname, 'millhavenKnowledge.xml'),
  'utf-8'
);
