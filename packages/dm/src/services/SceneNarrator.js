/**
 * SceneNarrator — DM narration layer for initiative-based social scenes.
 *
 * Sits between raw NPC outputs (private transcript) and the player-facing
 * transcript. Takes a batch of NPC actions and produces a single DM narration
 * that describes what the player can observe.
 *
 * Key rules:
 *   - NPC inner thoughts / inner monologue → NEVER shown to player
 *   - Direct NPC speech → quoted with attribution
 *   - Observable actions → described in third person by the DM
 *   - PASS / OBSERVE → omitted or briefly noted
 *   - LEAVE → narrated as departure
 *   - Narration is in second person ("you see", "you notice")
 *
 * Uses LLM for rich narration, with rules-based fallback.
 * System prompt is built by buildDmConsciousnessPrompt — the DM's mind.
 *
 * @module SceneNarrator
 */

import { buildDmConsciousnessPrompt } from '../npc/buildDmConsciousnessPrompt.js';

export class SceneNarrator {
  /**
   * @param {Object} deps
   * @param {import('../npc/CharacterResponseService.js').CharacterResponseService} deps.responseService
   * @param {import('../llm/LLMProvider.js').LLMProvider|import('../llm/MockProvider.js').MockProvider} deps.provider
   * @param {import('./RelationshipRepository.js').RelationshipRepository} [deps.relationshipRepo]
   * @param {(templateKey: string) => Object|null} [deps.personalityLookup] — returns NPC personality data by template key
   */
  constructor({ responseService, provider, relationshipRepo, personalityLookup }) {
    this._responseService = responseService;
    this._provider = provider;
    this._relationshipRepo = relationshipRepo || null;
    this._personalityLookup = personalityLookup || null;
  }

  /**
   * Resolve a display name for an NPC from the player's perspective.
   * Uses RelationshipRepository if available; falls back to the provided name.
   *
   * @param {string} templateKey — NPC template key
   * @param {string} realName — fallback real name
   * @returns {string}
   */
  _resolveDisplayName(templateKey, realName) {
    if (!this._relationshipRepo || !templateKey) return realName;
    return this._relationshipRepo.getDisplayName('player', templateKey, realName);
  }

  /**
   * Build a text block describing an NPC's visible appearance for the LLM.
   * Uses display name as the header — never the real name.
   *
   * @param {string} templateKey — NPC template key
   * @param {string} displayName — player-facing label (already resolved)
   * @returns {string|null} — formatted appearance block, or null if no data
   */
  _buildAppearanceBlock(templateKey, displayName) {
    if (!this._personalityLookup || !templateKey) return null;
    const personality = this._personalityLookup(templateKey);
    if (!personality?.appearance) return null;

    const a = personality.appearance;
    const lines = [`${displayName}:`];

    if (personality.gender) lines.push(`  Gender: ${personality.gender}`);
    if (personality.race) lines.push(`  Race: ${personality.race}`);
    if (a.build) lines.push(`  Build: ${a.build}`);
    if (a.hair) lines.push(`  Hair: ${a.hair}`);
    if (a.skin) lines.push(`  Skin: ${a.skin}`);
    if (a.eyes) lines.push(`  Eyes: ${a.eyes}`);
    if (a.height) lines.push(`  Height: ${a.height}`);
    if (a.typicalAttire) lines.push(`  Attire: ${a.typicalAttire}`);
    if (a.distinguishingFeatures?.length) {
      lines.push('  Distinguishing features:');
      for (const f of a.distinguishingFeatures) {
        lines.push(`    - ${f}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Build a [CHARACTER APPEARANCES] section from a list of { templateKey, displayName } pairs.
   *
   * @param {Array<{ templateKey: string, displayName: string }>} characters
   * @returns {string} — formatted section, or empty string if no data
   */
  _buildAppearancesSection(characters) {
    const blocks = [];
    for (const { templateKey, displayName } of characters) {
      const block = this._buildAppearanceBlock(templateKey, displayName);
      if (block) blocks.push(block);
    }
    if (blocks.length === 0) return '';
    return `\n\n[CHARACTER APPEARANCES]\n${blocks.join('\n\n')}`;
  }

  /**
   * Build the DM narration system prompt using the full consciousness prompt.
   *
   * @param {{ worldContext: Object, playerName: string, npcInnerStates: Array }} params
   * @returns {string}
   */
  buildDmNarrationPrompt({ worldContext, playerName, npcInnerStates = null }) {
    return buildDmConsciousnessPrompt({
      playerName,
      worldContext: worldContext || undefined,
      npcInnerStates: npcInnerStates || undefined,
    });
  }

  /**
   * Narrate a batch of NPC actions for the player-facing transcript.
   *
   * @param {Object} params
   * @param {Array<{ participantId, participantName, type, content }>} params.npcActions
   * @param {Object} params.worldContext
   * @param {number} params.round
   * @param {string} params.playerName
   * @param {Array<Object>} [params.npcInnerStates] — DM-only inner state data for each NPC
   * @param {{ type: string, content: string }} [params.playerAction] — What the player just did
   * @param {string} [params.sceneMemory] — Rolling summary of earlier scene events
   * @returns {Promise<{ narration: string, source: 'llm'|'fallback' }>}
   */
  async narrateNpcBatch({ npcActions, worldContext, round, playerName, npcInnerStates = null, playerAction = null, sceneMemory = null }) {
    if (!npcActions || npcActions.length === 0) {
      return { narration: '', source: 'fallback' };
    }

    const systemPrompt = this.buildDmNarrationPrompt({ worldContext, playerName, npcInnerStates });

    // Build a natural-prose summary of what each NPC did (for the LLM to narrate)
    // Resolve names through the relationship repo so strangers get display labels
    // Omit pass actions entirely; describe others in natural language
    const actionLines = [];
    for (const a of npcActions) {
      const displayName = this._resolveDisplayName(a.templateKey, a.participantName);
      switch (a.type) {
        case 'speech':
          actionLines.push(`${displayName} says: "${a.content}"`);
          break;
        case 'act':
          actionLines.push(`${displayName}: ${a.content || 'does something'}`);
          break;
        case 'observe':
          actionLines.push(`${displayName} watches quietly.`);
          break;
        case 'leave':
          actionLines.push(`${displayName} gets up and leaves.${a.content ? ' ' + a.content : ''}`);
          break;
        case 'pass':
          // Omit entirely — nothing observable happened
          break;
        default:
          if (a.content) actionLines.push(`${displayName}: ${a.content}`);
          break;
      }
    }
    const actionSummary = actionLines.join('\n\n');

    // Build appearance data for each NPC so the LLM can write vivid, properly gendered prose
    const characters = npcActions.map(a => ({
      templateKey: a.templateKey,
      displayName: this._resolveDisplayName(a.templateKey, a.participantName),
    }));
    const appearancesSection = this._buildAppearancesSection(characters);

    // Build optional context sections
    const contextParts = [];

    if (sceneMemory) {
      contextParts.push(`[SCENE SO FAR]\n${sceneMemory}`);
    }

    if (playerAction) {
      contextParts.push(`The adventurer ${playerAction.content}`);
    }

    const contextBlock = contextParts.length > 0 ? '\n\n' + contextParts.join('\n\n') + '\n\n' : '\n\n';

    const userMessage = `Continue telling the story to the adventurer.${contextBlock}Here is what happened:\n\n${actionSummary}${appearancesSection}\n\nNarrate what the adventurer perceives. Use ONLY the names/descriptions given above to refer to characters.`;

    try {
      const response = await this._provider.generateResponse({
        systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        maxTokens: 256,
        npcId: 'dm_narrator',
        npcName: 'DM',
      });

      const text = response?.text?.trim();
      if (!text) throw new Error('Empty DM narration');

      // Check for name leaks before returning to player
      const npcInfo = npcActions.map(a => ({
        templateKey: a.templateKey,
        participantName: a.participantName,
        displayName: this._resolveDisplayName(a.templateKey, a.participantName),
      }));
      const leakCheck = this._detectNameLeaks(text, npcInfo);
      if (leakCheck.leaked) {
        // Use the cleaned narration with display names substituted in
        return { narration: leakCheck.cleaned, source: 'llm' };
      }

      return { narration: text, source: 'llm' };
    } catch {
      // Fallback: rules-based narration
      return { narration: this._buildFallbackNarration(npcActions), source: 'fallback' };
    }
  }

  /**
   * Narrate the scene opening (atmosphere, who's present).
   *
   * @param {Object} params
   * @param {Object} params.worldContext
   * @param {string[]} params.participantNames — NPC names present
   * @param {string} params.playerName
   * @param {Array<Object>} [params.npcInnerStates] — DM-only inner state data for each NPC
   * @returns {Promise<{ narration: string, source: 'llm'|'fallback' }>}
   */
  async narrateSceneOpening({ worldContext, participantNames, playerName, npcInnerStates = null }) {
    const systemPrompt = this.buildDmNarrationPrompt({ worldContext, playerName, npcInnerStates });

    // Resolve participant names — accept either strings or { realName, templateKey } objects
    const resolvedNames = participantNames.map(p => {
      if (typeof p === 'string') return p;
      return this._resolveDisplayName(p.templateKey, p.realName);
    });

    // Build appearance data for each NPC
    const characters = participantNames
      .filter(p => typeof p === 'object' && p.templateKey)
      .map(p => ({
        templateKey: p.templateKey,
        displayName: this._resolveDisplayName(p.templateKey, p.realName),
      }));
    const appearancesSection = this._buildAppearancesSection(characters);

    const locationName = worldContext?.locationName || 'the area';
    const peopleList = resolvedNames.join(', ');
    const userMessage = `An adventurer has just walked into ${locationName}. The following people are already here: ${peopleList}.${appearancesSection}\n\nSet the scene. Atmosphere, sounds, smells, light — then the people. Tell the adventurer what they walk into. Use ONLY the names/descriptions given above to refer to characters.`;

    try {
      const response = await this._provider.generateResponse({
        systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        maxTokens: 300,
        npcId: 'dm_narrator',
        npcName: 'DM',
      });

      const text = response?.text?.trim();
      if (!text) throw new Error('Empty opening narration');

      return { narration: text, source: 'llm' };
    } catch {
      return { narration: this._buildFallbackOpening(worldContext, resolvedNames), source: 'fallback' };
    }
  }

  // ── Name-Leak Detection ──────────────────────────────────────

  /**
   * Detect if the LLM narration leaked any real NPC names that the player
   * hasn't learned yet (i.e., display name differs from real name).
   *
   * @param {string} narration — The LLM-generated narration text
   * @param {Array<{ templateKey: string, participantName: string, displayName: string }>} npcInfo
   * @returns {{ leaked: boolean, leakedNames: string[], narration: string, cleaned: string }}
   */
  _detectNameLeaks(narration, npcInfo) {
    const leakedNames = [];
    let cleaned = narration;

    for (const npc of npcInfo) {
      const realName = npc.participantName;
      const displayName = npc.displayName;

      // If real name equals display name, nothing to leak
      if (realName === displayName) continue;

      // Check for full name
      const fullNameRegex = new RegExp(`\\b${this._escapeRegex(realName)}\\b`, 'gi');
      if (fullNameRegex.test(narration)) {
        leakedNames.push(realName);
        cleaned = cleaned.replace(fullNameRegex, displayName);
      }

      // Check for first name (if multi-word real name)
      const nameParts = realName.split(/\s+/);
      if (nameParts.length > 1) {
        const firstName = nameParts[0];
        // Only flag if the first name isn't already part of the display name
        if (!displayName.toLowerCase().includes(firstName.toLowerCase())) {
          const firstNameRegex = new RegExp(`\\b${this._escapeRegex(firstName)}\\b`, 'gi');
          if (firstNameRegex.test(cleaned)) {
            if (!leakedNames.includes(realName)) leakedNames.push(realName);
            cleaned = cleaned.replace(firstNameRegex, displayName);
          }
        }
      }
    }

    return {
      leaked: leakedNames.length > 0,
      leakedNames,
      narration,
      cleaned: leakedNames.length > 0 ? cleaned : narration,
    };
  }

  /**
   * Escape special regex characters in a string.
   * @param {string} str
   * @returns {string}
   */
  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ── Fallback narration (rules-based) ────────────────────────────

  /**
   * Build a rules-based narration from NPC actions when LLM is unavailable.
   * Extracts observable content only.
   *
   * @param {Array<{ participantName, type, content }>} npcActions
   * @returns {string}
   */
  _buildFallbackNarration(npcActions) {
    const parts = [];

    for (const action of npcActions) {
      const displayName = this._resolveDisplayName(action.templateKey, action.participantName);
      switch (action.type) {
        case 'speech':
          parts.push(`${displayName} says, "${action.content}"`);
          break;
        case 'act':
          parts.push(`${displayName} ${action.content}`);
          break;
        case 'leave':
          parts.push(`${displayName} leaves the scene.`);
          break;
        case 'observe':
          // Brief mention — they're watching but not doing anything notable
          break;
        case 'pass':
          // Omit entirely
          break;
      }
    }

    return parts.join(' ') || '';
  }

  /**
   * Build a rules-based opening narration.
   *
   * @param {Object} worldContext
   * @param {string[]} participantNames
   * @returns {string}
   */
  _buildFallbackOpening(worldContext, participantNames) {
    const name = worldContext?.locationName || 'the area';
    const desc = worldContext?.description || '';
    const people = participantNames.length > 0
      ? ` You notice ${participantNames.join(', ')} among those present.`
      : '';
    return `You enter ${name}. ${desc}${people}`.trim();
  }
}
