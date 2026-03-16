/**
 * Scenario Simulation Harness
 * 
 * Runs turn-by-turn combat simulations for each of the 8 encounter scenarios
 * defined in evaluate-scenarios.js, using the modular combat engine.
 * 
 * Given a populated build document, this module:
 *   1. Converts the build to a combat creature via buildToCreature()
 *   2. Creates enemy combatants from creature templates
 *   3. Wires up AI profiles for each combatant
 *   4. Runs N simulations using the encounter runner
 *   5. Aggregates win rate, rounds, HP remaining, and per-run analytics
 */

import { createCreature } from '@dnd-platform/content/creatures'
import { buildToCreature } from '@dnd-platform/content/builds'
import { runEncounter } from './engine/encounterRunner.js'
import { makeTacticalAI, makeDecision } from './ai/tactics.js'


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MONSTER â†’ AI PROFILE MAPPING
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Maps creature template keys to their AI profile for the tactics engine.
 */
export const MONSTER_PROFILES = {
  zombie: 'undead_melee',
  skeleton: 'generic_ranged',
  ghoul: 'undead_melee',
  ghast: 'undead_melee',
  cult_fanatic: 'cult_fanatic',
  werewolf: 'generic_melee',
  young_red_dragon: 'dragon',
  hill_giant: 'giant_bruiser',
  frost_giant: 'giant_bruiser',
  ogre: 'generic_melee',
  bandit: 'generic_melee',
  bandit_captain: 'generic_melee',
  mage: 'mage_caster',
  archmage: 'archmage_caster',
  lich: 'lich_caster',
};


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 8 ENCOUNTER SCENARIOS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export const SCENARIOS = [
  {
    id: 'undead-swarm',
    name: 'Undead Swarm',
    desc: 'Tomb breach â€” zombies, skeletons, and ghouls pour from alcoves',
    foes: [
      { template: 'zombie', count: 4, profile: 'undead_melee' },
      { template: 'skeleton', count: 4, profile: 'generic_ranged' },
      { template: 'ghoul', count: 2, profile: 'undead_melee' },
    ],
  },
  {
    id: 'werewolf-pack',
    name: 'Werewolf Pack',
    desc: 'Full-moon ambush â€” 4 werewolves in hybrid form',
    foes: [
      { template: 'werewolf', count: 4, profile: 'generic_melee' },
    ],
  },
  {
    id: 'cult-fanatics',
    name: 'Cult Fanatics',
    desc: 'Ritual chamber â€” 4 fanatics with Dark Devotion + 1 mage',
    foes: [
      { template: 'cult_fanatic', count: 4, profile: 'cult_fanatic' },
      { template: 'mage', count: 1, profile: 'mage_caster' },
    ],
  },
  {
    id: 'dragon-assault',
    name: 'Dragon Assault',
    desc: 'Young Red Dragon â€” breath weapon, multiattack, flight',
    foes: [
      { template: 'young_red_dragon', count: 1, profile: 'dragon' },
    ],
  },
  {
    id: 'frost-giant-smash',
    name: 'Frost Giant Smash',
    desc: 'Frost Giant with 2 ogre bodyguards',
    foes: [
      { template: 'frost_giant', count: 1, profile: 'giant_bruiser' },
      { template: 'ogre', count: 2, profile: 'generic_melee' },
    ],
  },
  {
    id: 'lich-encounter',
    name: 'Lich Encounter',
    desc: 'Ancient Lich â€” Legendary Resistance, Counterspell, immune to charmed',
    foes: [
      { template: 'lich', count: 1, profile: 'lich_caster' },
    ],
  },
  {
    id: 'archmage-duel',
    name: 'Archmage Duel',
    desc: 'Archmage with Magic Resistance, Counterspell, AoE damage',
    foes: [
      { template: 'archmage', count: 1, profile: 'archmage_caster' },
    ],
  },
  {
    id: 'mixed-encounter',
    name: 'Mixed Encounter',
    desc: 'Bandit camp â€” captain, 4 bandits, mage advisor, 2 ogre enforcers',
    foes: [
      { template: 'bandit_captain', count: 1, profile: 'generic_melee' },
      { template: 'bandit', count: 4, profile: 'generic_melee' },
      { template: 'mage', count: 1, profile: 'mage_caster' },
      { template: 'ogre', count: 2, profile: 'generic_melee' },
    ],
  },
];


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// COMBATANT CREATION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Create all combatants for a scenario: 1 bard + N enemies.
 * 
 * @param {Object} build â€” populated build document
 * @param {Object} scenario â€” a SCENARIOS entry
 * @returns {Object[]} array of combat-ready creatures
 */
export function createScenarioCombatants(build, scenario) {
  // Create bard from build
  const bard = buildToCreature(build, {
    id: 'bard-0',
    position: { x: 0, y: 0 },
  });

  // Create enemies
  const enemies = [];
  let enemyIndex = 0;

  for (const foe of scenario.foes) {
    for (let i = 0; i < foe.count; i++) {
      const enemy = createCreature(foe.template, {
        id: `${foe.template}-${enemyIndex}`,
        side: 'enemy',
        position: { x: 8 + enemyIndex, y: Math.floor(enemyIndex / 3) },
      });
      // Tag the enemy with its AI profile for the decision resolver
      enemy._aiProfile = foe.profile;
      enemies.push(enemy);
      enemyIndex++;
    }
  }

  return [bard, ...enemies];
}


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SIMULATION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Simulate a scenario N times with a given build.
 * 
 * @param {Object} build â€” populated build document
 * @param {Object} scenario â€” a SCENARIOS entry
 * @param {Object} [options]
 * @param {number} [options.numRuns=100] â€” number of simulations
 * @param {number} [options.logRuns=3] â€” how many runs to save full combat logs for
 * @param {boolean} [options.verbose=false] â€” log each encounter
 * @returns {Object} aggregated results
 */
export function simulateScenario(build, scenario, options = {}) {
  const { numRuns = 100, logRuns = 3, verbose = false } = options;
  
  const runs = [];
  let wins = 0;
  let totalRounds = 0;
  let totalBardHpPct = 0;

  for (let i = 0; i < numRuns; i++) {
    // Create fresh combatants each run
    const combatants = createScenarioCombatants(build, scenario);

    // Build profile resolver: bard â†’ lore_bard, enemies â†’ their tagged profile
    const getDecision = function (combatant, allCombatants, round, _log) {
      if (combatant.side === 'party') {
        return makeDecision('lore_bard', combatant, allCombatants, round);
      }
      const profile = combatant._aiProfile || MONSTER_PROFILES[combatant.id?.split('-')[0]] || 'generic_melee';
      return makeDecision(profile, combatant, allCombatants, round);
    };

    // Run the encounter
    const result = runEncounter({
      combatants,
      getDecision,
      maxRounds: 20,
      verbose,
    });

    // Extract bard analytics
    const bardAnalytic = result.analytics.find(a => a.side === 'party');
    const bardHpPct = bardAnalytic
      ? Math.max(0, bardAnalytic.finalHP) / bardAnalytic.maxHP
      : 0;

    const isWin = result.winner === 'party';
    if (isWin) wins++;
    totalRounds += result.rounds;
    totalBardHpPct += bardHpPct;

    const runEntry = {
      winner: result.winner,
      rounds: result.rounds,
      bardHpPct: Math.round(bardHpPct * 1000) / 1000,
      analytics: result.analytics,
    };

    // Save full combat log and position snapshots for first N runs (for debugging/viewer)
    if (i < logRuns) {
      runEntry.log = result.log;
      runEntry.positionSnapshots = result.positionSnapshots || [];
    }

    runs.push(runEntry);
  }

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    numRuns,
    winRate: Math.round((wins / numRuns) * 1000) / 1000,
    avgRounds: Math.round((totalRounds / numRuns) * 10) / 10,
    avgBardHpPct: numRuns > 0
      ? Math.round((totalBardHpPct / numRuns) * 1000) / 1000
      : 0,
    runs,
  };
}


/**
 * Run all 8 scenarios against a build.
 * 
 * @param {Object} build â€” populated build document
 * @param {Object} [options] â€” same as simulateScenario
 * @returns {Object[]} array of per-scenario aggregated results
 */
export function simulateAllScenarios(build, options = {}) {
  return SCENARIOS.map(scenario => simulateScenario(build, scenario, options));
}


