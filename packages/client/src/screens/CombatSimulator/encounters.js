/**
 * encounters.js — Pre-built encounter definitions for the combat viewer.
 *
 * Each encounter defines the enemy composition, difficulty, and optional
 * pre-set positions. The CombatViewer uses these to populate the hex map
 * and create a server session with the correct combatants and AI profiles.
 *
 * Design note: encounters can set `explorationMode: true` to indicate
 * the fight doesn't need to be to the death — the player can disengage,
 * negotiate, or flee. The server won't auto-end when enemies survive.
 */

// ── Difficulty badge colors ─────────────────────────────────────────────────
export const DIFFICULTY_COLORS = {
  easy:   '#4a8',
  medium: '#c8a040',
  hard:   '#c06040',
  deadly: '#c03030',
}

// ── AI profile mapping (mirrors server MONSTER_PROFILES) ────────────────────
// These must match the keys in server/combat/ai/tactics.js PROFILES
const AI_PROFILES = {
  zombie:   'undead_melee',
  skeleton: 'generic_ranged',
  ghoul:    'undead_melee',
  ghast:    'undead_melee',
}

// ── Client-side creature display data ───────────────────────────────────────
// Lightweight lookup for placeEntity(). The server creates the real creature
// from its template; these are just enough to render map tokens before the
// server state syncs back. Must mirror server/combat/data/creatures.js values.
export const CREATURE_DISPLAY = {
  zombie:   { name: 'Zombie',   hp: 22, maxHp: 22, ac:  8, speed: 20, portraitUrl: '/portraits/v2/zombie.png' },
  skeleton: { name: 'Skeleton', hp: 13, maxHp: 13, ac: 13, speed: 30, portraitUrl: '/portraits/v2/skeleton.png' },
  ghoul:    { name: 'Ghoul',    hp: 22, maxHp: 22, ac: 12, speed: 30, portraitUrl: '/portraits/v2/ghoul.png' },
  ghast:    { name: 'Ghast',    hp: 36, maxHp: 36, ac: 13, speed: 30, portraitUrl: '/portraits/v2/ghast.png' },
}

// ── Encounter definitions ───────────────────────────────────────────────────

/**
 * @typedef {Object} EncounterFoe
 * @property {string}  templateKey  — creature template key from server creatures.js
 * @property {number}  count        — how many of this creature
 * @property {string}  aiProfile    — AI profile key from tactics.js PROFILES
 * @property {Array<{q:number,r:number}>} [positions] — optional pre-set hex positions
 */

/**
 * @typedef {Object} Encounter
 * @property {string}   id              — unique encounter identifier
 * @property {string}   name            — display name
 * @property {string}   description     — flavor text / tactical notes
 * @property {string}   theme           — encounter theme for grouping (e.g. 'undead')
 * @property {'easy'|'medium'|'hard'|'deadly'} difficulty
 * @property {number}   totalCR         — sum of all foe CRs
 * @property {EncounterFoe[]} foes      — enemy composition
 * @property {boolean}  [explorationMode] — if true, combat doesn't auto-end on last enemy death
 */

/** @type {Encounter[]} */
export const ENCOUNTERS = [
  // ── Undead: Easy ──────────────────────────────────────────────────────────
  {
    id: 'undead-duel',
    name: 'Lone Corpse',
    description: 'A single zombie blocks the path. A straightforward opening skirmish.',
    theme: 'undead',
    difficulty: 'easy',
    totalCR: 0.25,
    explorationMode: true,
    foes: [
      {
        templateKey: 'zombie',
        count: 1,
        aiProfile: AI_PROFILES.zombie,
        positions: [{ q: 3, r: -1 }],
      },
    ],
  },

  {
    id:          'undead-patrol',
    name:        'Shambling Patrol',
    description: 'A pair of zombies shamble aimlessly through the mist. They haven\'t noticed you yet.',
    theme:       'undead',
    difficulty:  'easy',
    totalCR:     0.5,
    explorationMode: true,
    foes: [
      {
        templateKey: 'zombie',
        count: 2,
        aiProfile: AI_PROFILES.zombie,
        positions: [{ q: 5, r: -2 }, { q: 6, r: -1 }],
      },
    ],
  },

  // ── Undead: Medium (zombies) ──────────────────────────────────────────────
  {
    id:          'undead-pack',
    name:        'Restless Dead',
    description: 'Five zombies claw their way out of shallow graves, drawn to the scent of the living.',
    theme:       'undead',
    difficulty:  'medium',
    totalCR:     1.25,
    foes: [
      {
        templateKey: 'zombie',
        count: 5,
        aiProfile: AI_PROFILES.zombie,
      },
    ],
  },

  // ── Undead: Medium (mixed) ────────────────────────────────────────────────
  {
    id:          'undead-mixed',
    name:        'Bones & Rot',
    description: 'A ragged group of zombies stumbles forward while skeletons loose arrows from behind crumbling tombstones.',
    theme:       'undead',
    difficulty:  'medium',
    totalCR:     1.25,
    foes: [
      {
        templateKey: 'zombie',
        count: 3,
        aiProfile: AI_PROFILES.zombie,
      },
      {
        templateKey: 'skeleton',
        count: 2,
        aiProfile: AI_PROFILES.skeleton,
        positions: [{ q: 8, r: -3 }, { q: 9, r: -4 }],
      },
    ],
  },

  // ── Undead: Hard (ghouls + skeletons) ─────────────────────────────────────
  {
    id:          'undead-ambush',
    name:        'Ghoul Ambush',
    description: 'Ravenous ghouls burst from behind a collapsed wall. Skeletons clatter into position behind them, bows drawn.',
    theme:       'undead',
    difficulty:  'hard',
    totalCR:     2.75,
    foes: [
      {
        templateKey: 'ghoul',
        count: 2,
        aiProfile: AI_PROFILES.ghoul,
        positions: [{ q: 4, r: -1 }, { q: 4, r: 1 }],
      },
      {
        templateKey: 'skeleton',
        count: 3,
        aiProfile: AI_PROFILES.skeleton,
      },
    ],
  },

  // ── Undead: Hard (horde) ──────────────────────────────────────────────────
  {
    id:          'undead-horde',
    name:        'Undead Horde',
    description: 'The graveyard erupts. Zombies, skeletons, and ghouls pour from every direction in a tide of death.',
    theme:       'undead',
    difficulty:  'hard',
    totalCR:     4.5,
    foes: [
      {
        templateKey: 'zombie',
        count: 4,
        aiProfile: AI_PROFILES.zombie,
      },
      {
        templateKey: 'skeleton',
        count: 4,
        aiProfile: AI_PROFILES.skeleton,
      },
      {
        templateKey: 'ghoul',
        count: 2,
        aiProfile: AI_PROFILES.ghoul,
      },
    ],
  },

  // ── Undead: Deadly ────────────────────────────────────────────────────────
  {
    id:          'undead-elite',
    name:        'The Ghast\'s Retinue',
    description: 'A ghast commands its hunting pack — ghouls that obey its every snarl, backed by skeleton archers. The stench alone could fell a lesser warrior.',
    theme:       'undead',
    difficulty:  'deadly',
    totalCR:     5.5,
    foes: [
      {
        templateKey: 'ghast',
        count: 1,
        aiProfile: AI_PROFILES.ghast,
        positions: [{ q: 7, r: 0 }],
      },
      {
        templateKey: 'ghoul',
        count: 2,
        aiProfile: AI_PROFILES.ghoul,
      },
      {
        templateKey: 'skeleton',
        count: 4,
        aiProfile: AI_PROFILES.skeleton,
      },
    ],
  },
]

// ── Query helpers ───────────────────────────────────────────────────────────

/**
 * Get encounters filtered by theme.
 * @param {string} theme
 * @returns {Encounter[]}
 */
export function getEncountersByTheme(theme) {
  return ENCOUNTERS.filter(e => e.theme === theme)
}

/**
 * Get a single encounter by ID.
 * @param {string} id
 * @returns {Encounter|undefined}
 */
export function getEncounterById(id) {
  return ENCOUNTERS.find(e => e.id === id)
}

/**
 * Get all unique themes in the encounter library.
 * @returns {string[]}
 */
export function getThemes() {
  return [...new Set(ENCOUNTERS.map(e => e.theme))]
}

/**
 * Count total enemies in an encounter.
 * @param {Encounter} encounter
 * @returns {number}
 */
export function countFoes(encounter) {
  return encounter.foes.reduce((sum, f) => sum + f.count, 0)
}

/**
 * Build a human-readable foe summary string.
 * e.g. "3 Zombies, 2 Skeletons"
 * @param {Encounter} encounter
 * @returns {string}
 */
export function foeSummary(encounter) {
  // Capitalize template key and pluralize
  return encounter.foes.map(f => {
    const name = f.templateKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    const plural = f.count > 1 ? name + 's' : name
    return `${f.count} ${plural}`
  }).join(', ')
}
