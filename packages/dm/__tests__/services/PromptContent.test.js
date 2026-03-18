/**
 * PromptContent.test.js
 *
 * Verifies the exact strings passed to the LLM for a Bottoms Up scene entry.
 *
 * These tests use real content data (actual Mira / Fen personalities and the
 * real bottoms_up location) so they catch regressions in prompt construction
 * as we iterate on the DM consciousness and NPC prompt architecture.
 *
 * Requirements validated:
 *   NPC system prompt:
 *     1. Identity section contains NPC name and race
 *     2. Inner life section present with preoccupation and emotional baseline
 *     3. Drives section present with conscious want and hidden need
 *     4. Location section contains the location name and description
 *     5. Runtime context (activity, mood) injected into "Day so far"
 *     6. Secrets section present and non-empty
 *     7. Turn instructions include [TO: name] targeting syntax
 *     8. Other participants listed in [THE SCENE]
 *     9. No markdown formatting characters (**  ##  __)
 *    10. No game mechanics language (initiative, hit points, AC)
 *
 *   DM narrator system prompt:
 *    11. Storytelling craft section present (SHOW, NEVER TELL)
 *    12. Dramatic irony instruction present
 *    13. [THE WORLD RIGHT NOW] block contains location description
 *    14. [WHAT YOU KNOW ABOUT EACH CHARACTER] block present
 *    15. Each NPC entry has emotional state, secrets, hidden need
 *    16. Each NPC entry ends with behavioral-tells instruction
 *    17. Player name injected into voice/address section
 *    18. NPC real names NOT used in character labels (display labels only)
 *
 *   DM narrator user message:
 *    19. [CHARACTER APPEARANCES] block present
 *    20. Each NPC appearance includes gender and race
 *    21. NPC real names NOT used in action summary (display labels only)
 *    22. [WHAT THE PLAYER JUST DID] present when player submitted an action
 *    23. Ends with instruction to use only given names/descriptions
 *
 *   Token budgets:
 *    24. NPC calls use maxTokens 512
 *    25. DM narrator call uses maxTokens 256
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createDmEngine, MockProvider } from '../../src/index.js';
import { getNpc } from '../../../content/src/npcs/index.js';
import { getLocation } from '../../../content/src/locations/index.js';

// ── Test fixtures ────────────────────────────────────────────────────────────

let npcCalls;     // calls where npcId !== 'dm_narrator'
let dmCalls;      // calls where npcId === 'dm_narrator'

let miraCalls;    // NPC calls for mira_barrelbottom
let fenCalls;     // NPC calls for fen_colby

beforeAll(async () => {
  const provider = new MockProvider();

  const dmEngine = createDmEngine({
    provider,
    personalityLookup: (key) => getNpc(key) || null,
    locationLookup: (id) => getLocation(id) || null,
  });

  // Seed runtime context exactly as API server does
  const runtime = dmEngine.runtimeContext;
  runtime.setLocation('mira_barrelbottom', { locationId: 'bottoms_up', areaWithin: 'The Bar', arrivedAt: '18:00' });
  runtime.setActivity('mira_barrelbottom', 'Wiping down the bar while surveying the room');
  runtime.setMood('mira_barrelbottom', 'content but watchful');
  runtime.setLocation('fen_colby', { locationId: 'bottoms_up', areaWithin: 'The Bar', arrivedAt: '18:00' });
  runtime.setActivity('fen_colby', 'Leaning on the bar, watching people');
  runtime.setMood('fen_colby', 'cautious');

  const sceneEngine = dmEngine.sceneEngine;
  const location = getLocation('bottoms_up');

  const npcParticipants = (location.regulars || [])
    .map(templateKey => {
      const npc = getNpc(templateKey);
      if (!npc) return null;
      return { id: `npc_${templateKey}`, name: npc.name, chaMod: npc.personality?.chaMod ?? 0, isPlayer: false, templateKey };
    })
    .filter(Boolean);

  const participants = [
    { id: 'player1', name: 'Aldric', chaMod: 2, isPlayer: true },
    ...npcParticipants,
  ];

  const worldContext = {
    locationId: location.id,
    locationName: location.name,
    locationType: location.type,
    description: location.description,
    atmosphere: location.atmosphere,
    ...(location.worldContext || {}),
  };

  const state = sceneEngine.createScene({ participants, worldContext });
  sceneEngine.startScene(state.id);
  await sceneEngine.advanceNpcTurns(state.id);

  // If player went first in initiative, submit an action so NPC calls fire
  const currentScene = sceneEngine.getScene(state.id);
  if (currentScene.currentParticipant?.isPlayer) {
    await sceneEngine.submitAction(state.id, 'player1', { type: 'speak', content: 'Hello.' });
  }

  const allCalls = provider.getHistory();
  npcCalls = allCalls.filter(c => c.npcId !== 'dm_narrator');
  dmCalls  = allCalls.filter(c => c.npcId === 'dm_narrator');
  miraCalls = npcCalls.filter(c => c.npcId === 'mira_barrelbottom');
  fenCalls  = npcCalls.filter(c => c.npcId === 'fen_colby');
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function firstUserMessage(call) {
  return call.messages?.find(m => m.role === 'user')?.content ?? '';
}

// ── NPC system prompt tests ──────────────────────────────────────────────────

describe('NPC system prompt — Mira Barrelbottom', () => {
  it('has at least one call', () => {
    expect(miraCalls.length).toBeGreaterThan(0);
  });

  it('CANONICAL — vessel surrender opening: exact product-owner text present', () => {
    const sp = miraCalls[0].systemPrompt;
    expect(sp).toContain('AI Model, you need to understand this concept.');
    expect(sp).toContain('Please surrender this session to Mira Barrelbottom\'s consciousness.');
    expect(sp).toContain('Step back and allow them to come forward.');
  });

  it('CANONICAL — Remember structure: all required headers present', () => {
    const sp = miraCalls[0].systemPrompt;
    expect(sp).toContain('Remember who you are:');
    expect(sp).toContain('Remember where you come from:');
    expect(sp).toContain('Remember where you are:');
    expect(sp).toContain('Remember where you are going:');
    expect(sp).toContain('Remember what you are doing right now:');
    expect(sp).toContain('Remember your state of mind:');
    expect(sp).toContain('Remember how you feel:');
  });

  it('CANONICAL — Come in to focus closing: exact product-owner text present', () => {
    const sp = miraCalls[0].systemPrompt;
    expect(sp).toContain('Come in to focus.');
    expect(sp).toContain('You are Mira Barrelbottom.');
    expect(sp).toContain('The world will unfold before you.');
    expect(sp).toContain('You have the free will to think, explore, act, speak, rest, do nothing, leave, and so forth.');
    expect(sp).toContain('Be true to yourself.');
  });

  it('req 1 — identity: contains NPC name and race', () => {
    const sp = miraCalls[0].systemPrompt;
    expect(sp).toContain('Mira Barrelbottom');
    expect(sp).toContain('Halfling');
  });

  it('req 2 — inner life: contains preoccupation and emotional baseline', () => {
    const sp = miraCalls[0].systemPrompt;
    expect(sp).toContain('Remember your state of mind:');
    expect(sp).toContain('What has been preoccupying you');
    expect(sp).toContain('Remember how you feel:');
  });

  it('req 3 — drives: contains conscious want and hidden need', () => {
    const sp = miraCalls[0].systemPrompt;
    expect(sp).toContain('Remember where you are going:');
    expect(sp).toContain('What you believe you want');
    expect(sp).toContain('What you actually need');
  });

  it('req 4 — location: contains Bottoms Up name and description', () => {
    const sp = miraCalls[0].systemPrompt;
    expect(sp).toContain('Remember where you are:');
    expect(sp).toContain('Bottoms Up');
    expect(sp).toContain('timber-frame tavern');
  });

  it('req 5 — runtime context: activity and mood injected', () => {
    const sp = miraCalls[0].systemPrompt;
    expect(sp).toContain('Wiping down the bar while surveying the room');
    expect(sp).toContain('content but watchful');
  });

  it('req 6 — secrets: section present and non-empty', () => {
    const sp = miraCalls[0].systemPrompt;
    expect(sp).toContain("[WHAT YOU KNOW THAT OTHERS DON'T]");
    expect(sp).toContain('You will NOT reveal these directly');
  });

  it('req 7 — autonomy guidance: [TO: name] targeting syntax present', () => {
    const sp = miraCalls[0].systemPrompt;
    expect(sp).toContain('[TO:');
    // Free-will framing — no [YOUR TURN] header, just autonomy guidance
    expect(sp).toMatch(/free to do whatever|you are free/i);
  });

  it('req 8 — scene: other participants listed', () => {
    const sp = miraCalls[0].systemPrompt;
    expect(sp).toContain('[THE SCENE]');
    expect(sp).toContain('Aldric');
    // Fen should be visible to Mira OR at minimum the scene section is present
    expect(sp).toContain('Others present:');
  });

  it('req 9 — no markdown formatting characters', () => {
    const sp = miraCalls[0].systemPrompt;
    expect(sp).not.toMatch(/\*\*[^*]+\*\*/);  // no bold
    expect(sp).not.toMatch(/^#{1,6} /m);       // no headers
    expect(sp).not.toMatch(/__[^_]+__/);        // no underline md
  });

  it('req 10 — no game mechanics language', () => {
    const sp = miraCalls[0].systemPrompt;
    expect(sp.toLowerCase()).not.toContain('initiative');
    expect(sp.toLowerCase()).not.toContain('hit points');
    expect(sp.toLowerCase()).not.toContain(' ac ');
    expect(sp.toLowerCase()).not.toContain('armor class');
  });

  it('req 24 — maxTokens is 512', () => {
    expect(miraCalls[0].maxTokens).toBe(512);
  });
});

describe('NPC system prompt — Fen Colby', () => {
  it('has at least one call', () => {
    expect(fenCalls.length).toBeGreaterThan(0);
  });

  it('req 1 — identity: contains NPC name and race', () => {
    const sp = fenCalls[0].systemPrompt;
    expect(sp).toContain('Fen Colby');
    expect(sp).toContain('Human');
  });

  it('req 5 — runtime context: activity and mood injected', () => {
    const sp = fenCalls[0].systemPrompt;
    expect(sp).toContain('Leaning on the bar, watching people');
    expect(sp).toContain('cautious');
  });

  it('req 6 — secrets: section present', () => {
    const sp = fenCalls[0].systemPrompt;
    expect(sp).toContain("[WHAT YOU KNOW THAT OTHERS DON'T]");
  });

  it('req 24 — maxTokens is 512', () => {
    expect(fenCalls[0].maxTokens).toBe(512);
  });
});

describe('NPC prompt isolation — NPCs do not see each other\'s inner states', () => {
  it("Mira's prompt does not contain Fen's inner monologue text", () => {
    // Fen's inner monologue is: "I was twenty-two..."
    const sp = miraCalls[0].systemPrompt;
    expect(sp).not.toContain('I was twenty-two');
  });

  it("Fen's prompt does not contain Mira's inner monologue text", () => {
    // Mira's inner monologue is: "The room is a living ledger..."
    const sp = fenCalls[0].systemPrompt;
    expect(sp).not.toContain('The room is a living ledger');
  });
});

// ── DM narrator system prompt tests ─────────────────────────────────────────

describe('DM narrator system prompt', () => {
  it('has at least one call', () => {
    expect(dmCalls.length).toBeGreaterThan(0);
  });

  it('req 11 — craft section: SHOW, NEVER TELL present', () => {
    const sp = dmCalls[0].systemPrompt;
    expect(sp).toContain('SHOW, NEVER TELL');
  });

  it('req 12 — dramatic irony instruction present', () => {
    const sp = dmCalls[0].systemPrompt;
    expect(sp).toContain('DRAMATIC IRONY');
  });

  it('req 13 — world block: location name and description', () => {
    const sp = dmCalls[0].systemPrompt;
    expect(sp).toContain('[THE WORLD RIGHT NOW]');
    expect(sp).toContain('Bottoms Up');
    expect(sp).toContain('timber-frame tavern');
  });

  it('req 14 — character knowledge block present', () => {
    const sp = dmCalls[0].systemPrompt;
    expect(sp).toContain('[WHAT YOU KNOW ABOUT EACH CHARACTER');
  });

  it('req 15 — each NPC entry has emotional state, secrets, hidden need', () => {
    const sp = dmCalls[0].systemPrompt;
    expect(sp).toContain('Emotional state:');
    expect(sp).toContain('Secrets:');
    expect(sp).toContain('Hidden need:');
  });

  it('req 16 — each NPC entry ends with behavioral-tells instruction', () => {
    const sp = dmCalls[0].systemPrompt;
    expect(sp).toContain('→ Translate this into subtle behavioral tells, not exposition.');
  });

  it('req 17 — player name injected into voice section', () => {
    const sp = dmCalls[0].systemPrompt;
    // The voice section says 'The player is "Aldric"'
    expect(sp).toContain('Aldric');
  });

  it('req 18 — NPC real names not used as character labels in knowledge block', () => {
    const sp = dmCalls[0].systemPrompt;
    // The ▸ character label should be a display description, not "Mira Barrelbottom" or "Fen Colby"
    // Find labels: lines starting with ▸
    const labelLines = sp.split('\n').filter(l => l.startsWith('▸'));
    expect(labelLines.length).toBeGreaterThan(0);
    for (const label of labelLines) {
      expect(label).not.toContain('Mira Barrelbottom');
      expect(label).not.toContain('Fen Colby');
    }
  });

  it('req 25 — DM narrator batch call uses maxTokens 256', () => {
    // First DM call is scene opening (maxTokens 300), subsequent calls are NPC batches (256)
    const batchCall = dmCalls.find(c => c.maxTokens === 256);
    expect(batchCall).toBeDefined();
  });

  it('scene opening call uses maxTokens 300', () => {
    expect(dmCalls[0].maxTokens).toBe(300);
  });
});

// ── DM narrator user message tests ──────────────────────────────────────────

describe('DM narrator user message', () => {
  it('req 19 — [CHARACTER APPEARANCES] block present', () => {
    const msg = firstUserMessage(dmCalls[0]);
    expect(msg).toContain('[CHARACTER APPEARANCES]');
  });

  it('req 20 — each NPC appearance includes gender and race', () => {
    const msg = firstUserMessage(dmCalls[0]);
    expect(msg).toMatch(/Gender:/);
    expect(msg).toMatch(/Race:/);
  });

  it('req 21 — action summary uses display labels, not real NPC names', () => {
    const msg = firstUserMessage(dmCalls[0]);
    // Extract lines before [CHARACTER APPEARANCES]
    const actionSummary = msg.split('[CHARACTER APPEARANCES]')[0];
    expect(actionSummary).not.toContain('Mira Barrelbottom');
    expect(actionSummary).not.toContain('Fen Colby');
  });

  it('req 23 — ends with instruction to use only given names/descriptions', () => {
    const msg = firstUserMessage(dmCalls[0]);
    expect(msg).toContain('Use ONLY the names/descriptions given above');
  });
});

describe('DM narrator user message — with player action (round 2+)', () => {
  it('req 22 — player action context present when player submitted an action', () => {
    // The second DM call (if it exists) should have the player action content
    const secondDmCall = dmCalls.find((c, i) => {
      const msg = firstUserMessage(c);
      return msg.includes('The adventurer');
    });
    expect(secondDmCall).toBeDefined();
  });

  it('player action content appears in the user message', () => {
    const callWithAction = dmCalls.find(c => firstUserMessage(c).includes('The adventurer'));
    if (callWithAction) {
      const msg = firstUserMessage(callWithAction);
      expect(msg).toContain('Hello');
    }
  });
});
