/**
 * Build-to-Creature Converter
 * 
 * Transforms a populated MongoDB build document into a combat-ready creature
 * object matching the shape produced by createCreature().
 * 
 * All builds are Lore Bard level 8. What varies:
 *   - Species (breath weapon, gem flight, magic resistance, natural armor, flight)
 *   - Feats  (War Caster, Resilient CON, Moderately Armored, Fey Touched, etc.)
 *   - Items  (Bracers of Defense, Cloak of Protection, Instruments of the Bards, etc.)
 * 
 * Uses computeBuildStats() for AC, spell DC, ability scores so we stay in sync
 * with the build calculator.
 */

import { computeBuildStats, mod, proficiencyBonus } from './buildCalculator.js';


// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// LORE BARD 8 CONSTANTS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const LORE_BARD_CANTRIPS = ['Vicious Mockery', 'Minor Illusion'];
const LORE_BARD_KNOWN = [
  'Hypnotic Pattern', 'Hold Person', 'Counterspell',
  'Healing Word', 'Faerie Fire', 'Dissonant Whispers',
  'Shatter', 'Invisibility', 'Silence',
  'Greater Invisibility', 'Dimension Door',
  'Sleep', 'Silvery Barbs', 'Polymorph',
];
const LORE_BARD_SLOTS = { 1: 4, 2: 3, 3: 3, 4: 2 };
const BARD_HIT_DIE = 8;
const BARD_AVG_ROLL = 5; // average of d8


// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// CONVERTER
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Convert a populated build document to a combat-ready creature object.
 * 
 * @param {Object} build â€” populated Mongoose lean document (species, feats, items)
 * @param {Object} [overrides] â€” optional overrides { id, name, position }
 * @returns {Object} creature ready for encounter runner
 */
export function buildToCreature(build, overrides = {}) {
  const stats = computeBuildStats(build);
  const species = build.species || {};
  const items = build.items || [];
  const level = build.level || 8;
  const profBonus = proficiencyBonus(level);

  // Extract feats from levelChoices
  const feats = (build.levelChoices || [])
    .filter(c => c.type === 'feat' && c.feat)
    .map(c => c.feat);

  // â”€â”€ Ability Scores â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const finalStats = { ...stats.finalStats };
  const mods = {};
  for (const [ability, score] of Object.entries(finalStats)) {
    mods[ability] = mod(score);
  }

  // â”€â”€ Hit Points â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Bard d8: Level 1 = max die + CON, levels 2-N = avg(5) + CON each
  const conMod = mods.con;
  const maxHP = BARD_HIT_DIE + conMod + (level - 1) * (BARD_AVG_ROLL + conMod);

  // â”€â”€ Features â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const hasWarCaster = feats.some(f => f.grantsAdvConSaves);
  const hasResilientCon = feats.some(f => f.grantsProfConSaves);
  const hasDragonFear = feats.some(f => f.name === 'Dragon Fear' || f.grantsDragonFear);
  const magicResistance = (species.traitList || []).some(t =>
    t.name?.toLowerCase().includes('magic resistance')
  );

  // â”€â”€ Saves â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Bards are proficient in DEX and CHA saves
  const itemSaveBonus = items.reduce((sum, i) => sum + (i.saveBonus || 0), 0);
  const saves = {
    str: mods.str + itemSaveBonus,
    dex: mods.dex + profBonus + itemSaveBonus,
    con: mods.con + (hasResilientCon ? profBonus : 0) + itemSaveBonus,
    int: mods.int + itemSaveBonus,
    wis: mods.wis + itemSaveBonus,
    cha: mods.cha + profBonus + itemSaveBonus,
  };

  // â”€â”€ Spells â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const spellsKnown = [...LORE_BARD_KNOWN];
  for (const feat of feats) {
    for (const spell of (feat.bonusSpells || [])) {
      if (!spellsKnown.includes(spell)) spellsKnown.push(spell);
    }
  }

  const itemSpellAttackBonus = items.reduce((sum, i) => sum + (i.spellAttackBonus || 0), 0);

  // â”€â”€ Species Resources â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const isGemDragonborn = species.name?.toLowerCase() === 'gem dragonborn';
  const isDragonborn = species.name?.toLowerCase().includes('dragonborn');
  const hasBreathWeapon = (species.traitList || []).some(t =>
    t.name?.toLowerCase().includes('breath weapon')
  );
  const hasGemFlight = (species.traitList || []).some(t =>
    t.name?.toLowerCase().includes('gem flight')
  );

  // Determine breath weapon damage type for dragonborn variants
  const breathDamageType = isGemDragonborn ? 'force' :
    (species.traitList || []).some(t => t.description?.toLowerCase().includes('fire')) ? 'fire' :
    (species.traitList || []).some(t => t.description?.toLowerCase().includes('cold')) ? 'cold' :
    (species.traitList || []).some(t => t.description?.toLowerCase().includes('lightning')) ? 'lightning' :
    (species.traitList || []).some(t => t.description?.toLowerCase().includes('acid')) ? 'acid' :
    (species.traitList || []).some(t => t.description?.toLowerCase().includes('poison')) ? 'poison' :
    'fire';

  // Flight
  const speciesFlySpeed = species.speed?.fly || 0;
  const hasWingedBoots = items.some(i => i.name?.toLowerCase().includes('winged boots'));
  const instrumentCharmDisadvantage = items.some(i => i.imposesCharmDisadvantage);

  // â”€â”€ Weapons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const xbowAttack = mods.dex + profBonus;
  const weapons = [
    {
      name: 'Light Crossbow',
      attackBonus: xbowAttack,
      damageDice: '1d8',
      damageBonus: mods.dex,
      range: 80,
      longRange: 320,
      type: 'ranged',
    },
  ];

  // â”€â”€ Build creature â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const creature = {
    // Identity
    id: overrides.id ?? (build._id?.toString?.() || build._id || build.name),
    name: overrides.name ?? build.name,
    side: overrides.side ?? 'party',
    class: 'Lore Bard',
    level,
    race: species.name || 'Unknown',
    type: species.creatureType || 'humanoid',
    cr: null,

    // Abilities (flat fields for compat with encounter runner)
    ...finalStats,
    strMod: mods.str, dexMod: mods.dex, conMod: mods.con,
    intMod: mods.int, wisMod: mods.wis, chaMod: mods.cha,
    profBonus,

    // Combat stats
    maxHP,
    currentHP: maxHP,
    tempHP: 0,
    ac: stats.finalAc,
    speed: species.speed?.walk || 30,
    ...(speciesFlySpeed ? { flySpeed: speciesFlySpeed } : {}),

    // Saves
    saves,

    // Features
    hasWarCaster,
    hasResilientCon,
    darkDevotion: false,
    magicResistance,
    immuneCharmed: false,
    instrumentCharmDisadvantage,

    // Damage resistances/immunities from species
    damageResistances: [...(species.resistances || [])],
    damageImmunities: [...(species.damageImmunities || [])],

    // Spellcasting
    spellSaveDC: stats.spellDc,
    spellAttackBonus: profBonus + mods.cha + itemSpellAttackBonus,
    cantrips: [...LORE_BARD_CANTRIPS],
    spellsKnown,
    spellSlots: { ...LORE_BARD_SLOTS },
    maxSlots: { ...LORE_BARD_SLOTS },

    // Multiattack
    multiattack: 0,

    // Weapons
    weapons,
    weapon: weapons[0],

    // Runtime state
    conditions: [],
    position: overrides.position ? { ...overrides.position } : { x: 0, y: 0 },
    flying: false,
    concentrating: null,
    concentrationRoundsRemaining: 0,
    reactedThisRound: false,
    usedBonusAction: false,
    usedAction: false,
    usedFreeInteraction: false,
    movementRemaining: species.speed?.walk || 30,

    // Analytics
    totalDamageDealt: 0,
    totalDamageTaken: 0,
    totalHealing: 0,
    attacksMade: 0,
    attacksHit: 0,
    spellsCast: 0,
    concentrationSavesMade: 0,
    concentrationSavesFailed: 0,
    conditionsInflicted: 0,
    reactionsUsed: 0,

    // Tags
    tags: ['caster', 'controller', 'bard', 'lore_bard'],

    // Item features
    hasWingedBoots,
  };

  // â”€â”€ Bardic Inspiration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  creature.bardicInspiration = {
    die: 'd8',
    uses: Math.max(1, mods.cha),
    max: Math.max(1, mods.cha),
    cuttingWords: true,
  };

  // â”€â”€ Dragonborn Breath Weapon â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (isDragonborn && hasBreathWeapon) {
    creature.breathWeapon = {
      uses: profBonus,
      max: profBonus,
      damage: '2d8',
      damageType: breathDamageType,
      save: 'dex',
      dc: 8 + profBonus + mods.con,
      range: 15,
      targeting: { type: 'area', shape: 'cone', length: 15 },
    };
  }

  // â”€â”€ Gem Flight â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (hasGemFlight) {
    creature.gemFlight = {
      uses: profBonus,
      max: profBonus,
      maxRounds: 10,
      active: false,
      roundsRemaining: 0,
    };
  }

  // â”€â”€ Dragon Fear â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Dragon Fear feat: replace breath weapon with a terrifying roar.
  // Shares the same PB-per-long-rest pool as Breath Weapon (Fizban's rules).
  // DC = 8 + profBonus + CHA mod. 30ft cone WIS save or frightened for 1 minute.
  if (hasDragonFear && isDragonborn) {
    creature.dragonFear = {
      uses: profBonus,
      max: profBonus,
      dc: 8 + profBonus + mods.cha,
      save: 'wis',
      range: 30,
      targeting: { type: 'area', shape: 'cone', length: 30 },
    };
  }

  // â”€â”€ Flight Mechanics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Species fly speed (e.g. Aarakocra) or Winged Boots: creature starts airborne.
  // This is distinct from Gem Flight which requires activation via bonus action.
  //
  // Flight restriction: Some species (e.g. Aven, Aarakocra) cannot fly in
  // medium or heavy armor. If the species has a flightRestriction and the
  // build took Moderately Armored (the only path to medium armor for bards),
  // species flight is suppressed. Winged Boots are unaffected by armor.
  const wearsMediumArmor = feats.some(f => f.grantsArmorProficiency);
  const speciesFlightBlocked = speciesFlySpeed
    && species.flightRestriction
    && wearsMediumArmor;

  if ((speciesFlySpeed && !speciesFlightBlocked) || hasWingedBoots) {
    creature.flying = true;
    if (!creature.tags.includes('flying')) {
      creature.tags.push('flying');
    }
  }

  return creature;
}


