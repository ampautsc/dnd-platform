import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Loads a static XML context file by name (without the .xml extension).
 * Results are cached in memory after the first read so subsequent calls
 * return the same byte-for-byte string — a requirement for Anthropic
 * prompt caching to produce cache hits across API calls.
 *
 * Available files:
 *   world-common          — Faerûn 1492 DR baseline (all NPCs)
 *   city-waterdeep        — Waterdeep-specific knowledge
 *   city-baldurs-gate     — Baldur's Gate-specific knowledge
 *   city-neverwinter      — Neverwinter-specific knowledge
 *   location-bottoms-up   — Bottoms Up tavern operational knowledge (Samren)
 *   town-millhaven        — Millhaven town knowledge (Millhaven-based NPCs)
 *
 * @internal Not exposed via any API route.
 */

const cache = new Map();

export function loadContextFile(name) {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;

  const filePath = resolve(__dirname, `${name}.xml`);
  const content = readFileSync(filePath, 'utf8');
  cache.set(name, content);
  return content;
}

/** Clears the in-memory cache. Intended for use in tests only. */
export function clearContextCache() {
  cache.clear();
}
