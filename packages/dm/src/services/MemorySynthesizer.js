/**
 * MemorySynthesizer — LLM-powered encounter memory extraction.
 *
 * At the end of every encounter or scene, this service asks the DM LLM
 * to synthesize what each participant would remember about every other
 * participant. The results are narrative summaries stored in the
 * RelationshipRepository for injection into future prompts.
 *
 * The LLM is asked to produce:
 *   - A narrative summary from each participant's perspective
 *   - Significance rating (trivial → life-changing)
 *   - Emotional shift (-1 to +1)
 *   - Recognition tier promotion suggestion
 *
 * Fallback: If the LLM is unavailable, basic "was present" memories
 * are generated from the transcript alone.
 *
 * Architecture: Uses the provider abstraction. No direct vendor imports.
 * Depends on nothing but the LLM provider.
 *
 * @module MemorySynthesizer
 */

const MEMORY_SYNTHESIS_SYSTEM_PROMPT = `You are a memory extraction system for a D&D game. Your job is to analyze a conversation transcript and determine what each participant would remember about the encounter.

For EACH participant pair (A remembers B), produce a memory entry:
- summary: A 1-3 sentence narrative from A's perspective. What happened? What was said? Any promises, debts, agreements, information shared? Write as if A is recalling the encounter to themselves.
- significance: Rate the encounter's importance to this participant: "trivial" (passed in the hallway), "minor" (brief chat), "notable" (meaningful exchange), "major" (life-changing favor, betrayal, revelation), "life-changing" (saved their life, major oath, profound bond)
- emotionalShift: A number from -1.0 to +1.0 representing how this encounter shifted A's feelings toward B. Positive = warmer, negative = colder. Most casual encounters are 0.05-0.15.
- tierPromotion: Should A now recognize B better? null = no change, "recognized" = would remember their face, "acquaintance" = learned their name, "familiar" = knows them well. Most first encounters go to "recognized" at best. "acquaintance" requires a name exchange. "familiar" takes multiple meaningful interactions.

IMPORTANT:
- Write memories from each participant's subjective perspective. An NPC might misremember or interpret events differently than the player.
- The player's memories should note what they LEARNED, not what they already knew.
- NPCs who didn't directly interact still notice each other.
- Include specific details: names exchanged, information shared, promises made, items given.
- If someone told a lie, the listener's memory records the lie as truth (unless they detected it).

Respond with ONLY a JSON object:
{
  "memories": [
    {
      "subjectId": "who_remembers",
      "targetId": "who_they_remember",
      "summary": "narrative memory text",
      "significance": "minor",
      "emotionalShift": 0.1,
      "tierPromotion": "recognized"
    }
  ]
}`;

const VALID_TIERS = [null, 'recognized', 'acquaintance', 'familiar'];
const VALID_SIGNIFICANCE = ['trivial', 'minor', 'notable', 'major', 'life-changing'];

export class MemorySynthesizer {
  /**
   * @param {Object} deps
   * @param {Object} deps.provider — LLM provider with generateResponse()
   */
  constructor({ provider } = {}) {
    if (!provider) {
      throw new Error('MemorySynthesizer requires an LLM provider');
    }
    this._provider = provider;
  }

  /**
   * Synthesize memories for all participant pairs after an encounter.
   *
   * @param {Object} params
   * @param {Array} params.transcript — Array of { sender, senderName?, text }
   * @param {Array} params.participants — Array of { id, name, isPlayer, templateKey? }
   * @returns {Promise<{ memories: Array, fallback: boolean }>}
   */
  async synthesizeEncounterMemories({ transcript, participants }) {
    if (!transcript || transcript.length === 0 || !participants || participants.length <= 1) {
      return { memories: [], fallback: false };
    }

    try {
      const result = await this._callLLM(transcript, participants);
      return { memories: result.memories || [], fallback: false };
    } catch (err) {
      // Fallback: generate basic presence memories from transcript
      return {
        memories: this._generateFallbackMemories(transcript, participants),
        fallback: true,
      };
    }
  }

  /**
   * Call the LLM to synthesize memories.
   */
  async _callLLM(transcript, participants) {
    const transcriptText = this._formatTranscript(transcript, participants);
    const participantList = participants
      .map(p => `- ${p.id} (${p.name}${p.isPlayer ? ', PLAYER' : ', NPC'})`)
      .join('\n');

    const userPrompt = `## Encounter Transcript

Participants:
${participantList}

Transcript:
${transcriptText}

Analyze this encounter and produce memory entries for EVERY participant pair (each participant remembers each other participant). That means ${participants.length * (participants.length - 1)} memory entries total.`;

    const response = await this._provider.generateResponse({
      systemPrompt: MEMORY_SYNTHESIS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 2000,
      temperature: 0.3,
    });

    return this._parseResponse(response.text);
  }

  /**
   * Format transcript for LLM consumption.
   */
  _formatTranscript(transcript, participants) {
    const nameMap = new Map(participants.map(p => [p.id, p.name]));
    return transcript
      .map(entry => {
        const name = nameMap.get(entry.sender) || entry.senderName || entry.sender;
        return `${name}: "${entry.text}"`;
      })
      .join('\n');
  }

  /**
   * Parse LLM response into structured memory data.
   */
  _parseResponse(text) {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in LLM response');

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.memories || !Array.isArray(parsed.memories)) {
      throw new Error('Invalid memory structure');
    }

    // Validate and sanitize each memory
    parsed.memories = parsed.memories.map(mem => ({
      subjectId: mem.subjectId,
      targetId: mem.targetId,
      summary: String(mem.summary || ''),
      significance: VALID_SIGNIFICANCE.includes(mem.significance) ? mem.significance : 'minor',
      emotionalShift: typeof mem.emotionalShift === 'number'
        ? Math.max(-1, Math.min(1, mem.emotionalShift))
        : 0,
      tierPromotion: VALID_TIERS.includes(mem.tierPromotion) ? mem.tierPromotion : null,
    }));

    return parsed;
  }

  /**
   * Generate basic fallback memories when LLM is unavailable.
   * These are simple "was present" memories derived from the transcript.
   */
  _generateFallbackMemories(transcript, participants) {
    const memories = [];

    // Build a set of who actually spoke
    const speakers = new Set(transcript.map(e => e.sender));

    for (const subject of participants) {
      for (const target of participants) {
        if (subject.id === target.id) continue;

        // Only generate if at least one of them spoke
        if (!speakers.has(subject.id) && !speakers.has(target.id)) continue;

        const targetSpoke = speakers.has(target.id);
        const summary = targetSpoke
          ? `${target.name} was present and spoke during the encounter.`
          : `${target.name} was present during the encounter.`;

        memories.push({
          subjectId: subject.id,
          targetId: target.id,
          summary,
          significance: 'trivial',
          emotionalShift: 0,
          tierPromotion: null,
        });
      }
    }

    return memories;
  }

  // ── Static Utilities ────────────────────────────────────────────

  /**
   * Generate an appearance-based display label from NPC data.
   * Used for the "stranger" tier — what you'd notice about someone
   * at a glance without knowing their name.
   *
   * @param {Object} npcData — NPC personality data from content package
   * @returns {string} — e.g., "an old fisherman mending nets by the fire"
   */
  static generateDisplayLabel(npcData) {
    if (!npcData) return 'a stranger';

    const appearance = npcData.appearance;

    // Best case: use the authored firstImpression
    if (appearance?.firstImpression) {
      return appearance.firstImpression;
    }

    // Construct from build + attire
    if (appearance?.build && appearance?.typicalAttire) {
      const buildLower = appearance.build.toLowerCase();
      const article = /^[aeiou]/i.test(buildLower) ? 'an' : 'a';
      return `${article} ${buildLower} figure in ${appearance.typicalAttire.toLowerCase()}`;
    }

    // Minimal: just race
    if (npcData.race) {
      const race = npcData.race.toLowerCase();
      const article = /^[aeiou]/i.test(race) ? 'an' : 'a';
      return `${article} ${race}`;
    }

    return 'a stranger';
  }
}
