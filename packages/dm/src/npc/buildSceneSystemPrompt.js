/**
 * buildSceneSystemPrompt — Scene-aware system prompt for NPC consciousness.
 *
 * Extends the encounter system prompt with scene-specific sections:
 *  - Scene Context: who is present (without NPC/player labels)
 *  - Turn Instructions: what the NPC may do on their turn
 *
 * Delegates to buildEncounterSystemPrompt for the 11 core consciousness sections,
 * then appends scene-specific context.
 *
 * CRITICAL: Participant descriptions NEVER distinguish NPCs from player characters.
 * Every participant is just "a person in the scene."
 *
 * @module buildSceneSystemPrompt
 */

import { buildEncounterSystemPrompt } from './buildEncounterSystemPrompt.js';

/**
 * @param {object} params
 * @param {object}  params.personality     — Full NPC data from content/
 * @param {object|null}  [params.location]        — Location data
 * @param {object|null}  [params.runtimeSnapshot] — From NpcRuntimeContext
 * @param {number|null}  [params.ageInDays]       — From NpcRuntimeContext
 * @param {string|null}  [params.memorySummary]    — From EncounterMemoryService
 * @param {string}       [params.evolutionSummary] — From PersonalityEvolutionService
 * @param {string}       [params.relationshipContext] — From RelationshipRepository.buildRelationshipContext() (unified)
 * @param {string|null}  [params.timeOfDay]        — Time of day string (e.g., "late evening")
 * @param {object}  params.sceneContext    — Scene-specific data
 * @param {Array<{ id, name }>} params.sceneContext.participants — All scene participants
 * @param {number}  params.sceneContext.round — Current round number
 * @param {string}  params.sceneContext.thisParticipantId — This NPC's participant ID
 * @param {function} [params.sceneContext.nameResolver] — (participantId, realName) => displayName
 * @returns {string}
 */
export function buildSceneSystemPrompt({
  personality,
  location = null,
  runtimeSnapshot = null,
  ageInDays = null,
  memorySummary = null,
  evolutionSummary = '',
  relationshipContext = '',
  timeOfDay = null,
  sceneContext,
}) {
  // Build the core consciousness prompt
  const basePrompt = buildEncounterSystemPrompt({
    personality,
    location,
    runtimeSnapshot,
    ageInDays,
    memorySummary,
    evolutionSummary,
    relationshipContext,
  });

  // ── Scene Context Section ──────────────────────────────────────

  const others = sceneContext.participants
    .filter(p => p.id !== sceneContext.thisParticipantId)
    .map(p => {
      if (sceneContext.nameResolver) {
        return sceneContext.nameResolver(p.id, p.name);
      }
      return p.name;
    });

  const sceneLines = ['[THE SCENE]'];
  if (timeOfDay) {
    sceneLines.push(`It is ${timeOfDay}.`);
  }

  sceneLines.push('Others present: ' + (others.length > 0 ? others.join(', ') + '.' : 'No one.'));
  sceneLines.push('You can see and hear everything happening around you. You have been aware of everything that has happened so far.');

  // ── Free Will / Autonomy ───────────────────────────────────────
  // This section shows the RANGE of what the consciousness can do.
  // It does NOT command. It does not say "your turn." It does not
  // give formatting rules. It shows possibilities and examples so
  // the consciousness knows the full scope of its autonomy.

  const autonomyLines = [];
  autonomyLines.push('You are free to do whatever feels natural to you right now. Here are some of the things you might choose to do:');
  autonomyLines.push('');
  autonomyLines.push('- Say something to someone specific, or to the room');
  autonomyLines.push('- Do something physical — pour a drink, move to a table, pick up an object, investigate something');
  autonomyLines.push('- Watch and listen. Take in what is happening around you');
  autonomyLines.push('- Do nothing. Continue what you were doing. Let the moment pass');
  autonomyLines.push('- Leave. Walk away. Go somewhere else. You are not obligated to stay');
  autonomyLines.push('');
  autonomyLines.push('To help the world understand your choice, please begin your response with one of these in brackets: [SPEAK], [ACT], [OBSERVE], [PASS], or [LEAVE].');
  autonomyLines.push('If your action is directed at a specific person, add [TO: their name] after.');
  autonomyLines.push('');
  autonomyLines.push('Examples:');
  autonomyLines.push('  [SPEAK][TO: the tall dragonborn] "Can I help you with something?"');
  autonomyLines.push('  [ACT] *wipes down the counter, glancing at the door*');
  autonomyLines.push('  [ACT][TO: the hooded figure] *slides a drink across the bar*');
  autonomyLines.push('  [SPEAK] "Last call, everyone!"');
  autonomyLines.push('  [OBSERVE] *watches the stranger from the corner of her eye*');
  autonomyLines.push('  [LEAVE] *sets down the rag, unties her apron, and heads upstairs without a word*');
  autonomyLines.push('');
  autonomyLines.push('There is no obligation to speak or engage. Silence, refusal, and disinterest are valid choices.');
  autonomyLines.push('React only to what has actually happened. Do not invent events or statements that have not occurred.');

  return [basePrompt, sceneLines.join('\n'), autonomyLines.join('\n')].join('\n\n');
}
