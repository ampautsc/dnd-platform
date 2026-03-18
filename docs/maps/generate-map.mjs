#!/usr/bin/env node
/**
 * AI-Powered Millhaven Map Generator
 * 
 * Reads location data from the content package, sends it to Claude,
 * and asks it to produce a proper SVG town map with road-aware building placement.
 * 
 * Usage: node docs/maps/generate-map.mjs
 * Output: docs/maps/millhaven.html
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

// Load .env manually (no dotenv dependency needed)
const envPath = resolve(ROOT, '.env');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^(\w+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim();
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('ERROR: ANTHROPIC_API_KEY not found in .env');
  process.exit(1);
}

// Use Sonnet for better spatial reasoning on this one-off generation
const MODEL = 'claude-sonnet-4-20250514';

// ── Gather town data ────────────────────────────────────────────
const townPath = resolve(ROOT, 'packages/content/src/towns/data/millhaven.json');
const town = JSON.parse(readFileSync(townPath, 'utf-8'));

// Read all location files for geographic clues
const locDir = resolve(ROOT, 'packages/content/src/locations/data');
const locationDetails = [];
for (const loc of town.notableLocations) {
  const entry = { name: loc.name, type: loc.type, description: loc.description, npcs: loc.npcInstances };
  if (loc.locationFile) {
    try {
      const data = JSON.parse(readFileSync(resolve(locDir, `${loc.locationFile}.json`), 'utf-8'));
      if (data.description) entry.fullDescription = data.description;
      if (data.atmosphere?.exterior) entry.exterior = data.atmosphere.exterior;
    } catch { /* no file, that's fine */ }
  }
  locationDetails.push(entry);
}

// ── Build the prompt ────────────────────────────────────────────
const systemPrompt = `You are an expert cartographer and SVG artist specializing in fantasy town maps. 
You produce beautiful, hand-drawn style SVG maps that look like they belong in a D&D sourcebook.

CRITICAL RULES FOR BUILDING PLACEMENT:
1. Buildings must NEVER overlap roads. Place buildings in lots ALONGSIDE roads, offset from the road centerline.
2. Roads are paths between buildings — buildings line the edges of roads like a real town.
3. Market Square is an open area SURROUNDED by buildings on its edges, not filled with them.
4. Use proper urban planning: buildings face roads, with gaps between them for alleys and yards.
5. Larger/important buildings (Town Hall, Temple, Forge) get larger rectangles.
6. Building colors indicate function (use a consistent legend).

STYLE REQUIREMENTS:
- Parchment/aged paper background (#f0deb0 to #e4d0a0 gradient)
- Hand-drawn cartography aesthetic — slight irregularity is good
- River should be a beautiful flowing S-curve, NOT straight
- Forest shown as clusters of tree symbols (circles or triangles)
- Include: compass rose, scale bar, title cartouche, legend
- Building hover tooltips via SVG <title> elements (building name + key NPCs)
- Color-coding: taverns=warm orange, government=blue, military=dark red, religious=gold, shops=amber, services=teal, entertainment=purple, industrial=brown, residential=muted tan

GEOGRAPHIC CONSTRAINTS:
- Stoneback River flows North-to-South on the EAST side of town
- King's Road runs East-West through the center, crossing the river via a stone bridge
- A North-South trade road creates a crossroads at Market Square  
- Mill Road branches southwest from near the crossroads
- River Road runs along the west bank of the river (near the docks)
- The Mill is on the EAST bank of the river (across the bridge)
- Darkwood Forest is to the north (tree line along top of map)
- Cemetery is on a north hill overlooking town
- Farmland is to the west
- South pastures below town
- SE tree line near the lumber yard
- Town population ~1200 — show residential clusters as small generic house symbols along roads

OUTPUT FORMAT:
Return ONLY a complete, valid HTML document containing the SVG. No markdown code fences. No explanation before or after.
The SVG viewBox should be "0 0 1400 1050".
Use embedded CSS in a <style> tag. No external dependencies except Google Fonts (Cinzel + Crimson Text).
Every named building must have a <title> tooltip with its name and NPC list.`;

const userPrompt = `Generate a beautiful fantasy town map of Millhaven as a complete HTML file with inline SVG.

Here is the town data:

TOWN: ${town.name}
POPULATION: ${town.population}
REGION: ${town.location.region}
TERRAIN: ${town.location.terrain}
LANDMARKS: ${town.location.nearestLandmarks.join(', ')}
DESCRIPTION: ${town.description}

LOCATIONS (${locationDetails.length} total):
${locationDetails.map((loc, i) => {
  let text = `${i + 1}. "${loc.name}" [${loc.type}] — ${loc.description}`;
  if (loc.fullDescription) text += `\n   Full: ${loc.fullDescription}`;
  if (loc.exterior) text += `\n   Exterior: ${loc.exterior}`;
  if (loc.npcs?.length) text += `\n   NPCs: ${loc.npcs.join(', ')}`;
  return text;
}).join('\n\n')}

SPECIFIC PLACEMENT CLUES FROM LOCATION FILES:
- Bottoms Up: "corner of Mill Road and King's Road"
- Cogsworth Workshop: "converted barn at the end of Mill Road" (east end)
- Mill: "east bank of the Stoneback River" (ACROSS the bridge)
- General Store: "on the market square"
- Town Hall: "north side of the market square"
- Healer: "quieter end of Mill Road", "Vesna Calloway's apothecary is two doors down"
- Lumber Yard: "southeast edge of town where the road meets the tree line"
- Butcher: "narrow shop squeezed between two larger buildings on the market square"
- Cemetery: "north hill above Millhaven, overlooking the river and the rooftops"
- Schoolhouse: "south side of Market Square"
- Counting House: "wedged between the town hall and the tailor's shop", "north side adjacent to Town Hall"
- Warehouse: "end of the docks, where the river road meets the wharf"
- Tannery: "edge of town where Mill Road meets the south pastures"
- Tea House: "river walk between the docks and the temple"
- Theater: "west side of Market Square"
- Bookshop: "east side of Market Square, between the tailor's and the counting house"
- Bathhouse: "south side of Mill Road"
- Driftwood Tavern: "end of the docks", "south end of wharf"
- Tinctures Shop: "north side of Market Square, between the temple and the tailor's shop"
- Curiosity Shop: "east road, between the stables and the town wall gate"
- Guard Post: next to the town gate (east side of town)
- Stables: on the east road
- Forge: on the market square
- Bakery: near the market area
- Apothecary: on Mill Road, two doors from the healer
- Blue Lantern Alley: near the docks, warehouse back door faces it
- Docks/Wharf: along the west bank of the river

IMPORTANT: Buildings must be placed IN LOTS alongside roads, never ON the road itself. 
Roads should have clear space to walk/ride through. Think of real medieval town layout.

Remember: output the COMPLETE HTML document only. No markdown fences, no explanation.`;

// ── Call Claude ──────────────────────────────────────────────────
console.log(`Calling ${MODEL} to generate Millhaven map...`);
console.log(`Sending ${locationDetails.length} locations with geographic clues...`);

const client = new Anthropic({ apiKey });

try {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const svgContent = response.content[0].text;
  
  // Validate we got HTML back
  if (!svgContent.includes('<svg') || !svgContent.includes('</svg>')) {
    console.error('ERROR: Response does not contain SVG content');
    console.error('First 500 chars:', svgContent.substring(0, 500));
    process.exit(1);
  }

  // Extract just the HTML if there's any markdown wrapping
  let html = svgContent;
  if (html.startsWith('```')) {
    html = html.replace(/^```html?\n?/, '').replace(/\n?```$/, '');
  }

  const outputPath = resolve(__dirname, 'millhaven.html');
  writeFileSync(outputPath, html, 'utf-8');
  
  console.log(`\nMap generated successfully!`);
  console.log(`Output: ${outputPath}`);
  console.log(`Tokens used: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`);
  console.log(`\nOpen in browser: file://${outputPath.replace(/\\/g, '/')}`);
  
} catch (err) {
  console.error('API Error:', err.message);
  if (err.status === 401) console.error('Check your ANTHROPIC_API_KEY in .env');
  process.exit(1);
}
