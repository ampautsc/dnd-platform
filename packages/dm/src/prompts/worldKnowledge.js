import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Universal D&D 5e world knowledge, structured as XML.
 * 
 * Contains generic 5e knowledge: peoples (races), currency, calendar,
 * languages, social structure, religion (full pantheon), magic (schools,
 * caster types), creatures (comprehensive taxonomy), travel, adventurers,
 * planes, death & afterlife, daily life.
 * 
 * Setting-specific knowledge (e.g. Millhaven) is in separate files.
 * 
 * Designed as a static context block for LLM system prompts.
 * Exceeds 1,024 tokens to qualify for Anthropic prompt caching.
 * 
 * Usage in prompt builders:
 *   import { worldKnowledge } from '../prompts/worldKnowledge.js';
 *   // Insert into system prompt as a section
 */
export const worldKnowledge = readFileSync(
  resolve(__dirname, 'worldKnowledge.xml'),
  'utf-8'
);
