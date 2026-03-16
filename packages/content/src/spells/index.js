/**
 * Spell Registry — data-driven spell definitions
 * 
 * Each spell is a plain data object describing what it does.
 * The spell resolver reads these definitions and executes the mechanics.
 * No logic lives here — only declarations + lookup helpers.
 * 
 * Schema per spell:
 *   name:          string — spell name
 *   level:         number — 0 for cantrips
 *   school:        string — evocation, enchantment, etc.
 *   castingTime:   'action' | 'bonus_action' | 'reaction'
 *   range:         number — in feet (0 = self, 5 = touch)
 *   duration:      number — rounds (0 = instantaneous, 10 = 1 minute)
 *   concentration: boolean
 *   targeting:     { type: 'single'|'self'|'area', shape?: 'cube'|'sphere'|'cone'|'cylinder'|'wall', size?: number, radius?: number, length?: number }
 *   save:          { ability: 'wis'|'dex'|'str'|'con', negatesAll?: boolean } | null
 *   attack:        { type: 'melee_spell'|'ranged_spell' } | null
 *   damage:        { dice: string, type: string, bonus?: number } | null
 *   effects:       string[] — conditions/effects applied on failure
 *   selfEffects:   string[] — conditions/effects applied to caster
 *   onConcentrationEnd: string[] — effects to remove when concentration drops
 *   counterSpellable: boolean — can be counterspelled (default true for non-self)
 *   tags:          string[] — categorization for AI decision-making
 *   notes:         string — human-readable description for logging
 */

export const SPELLS = {

  // ═══════════════════════════════════════════════
  // CANTRIPS (Level 0)
  // ═══════════════════════════════════════════════

  'Vicious Mockery': {
    name: 'Vicious Mockery',
    level: 0,
    school: 'enchantment',
    castingTime: 'action',
    range: 60,
    duration: 0,
    concentration: false,
    targeting: { type: 'single' },
    save: { ability: 'wis', negatesAll: true },
    attack: null,
    damage: { dice: '2d4', type: 'psychic' },
    effects: ['vm_disadvantage'],
    selfEffects: [],
    onConcentrationEnd: [],
    counterSpellable: false,
    tags: ['debuff', 'cantrip', 'damage'],
    notes: 'WIS save or 2d4 psychic + disadvantage on next attack roll.',
  },

  'Sacred Flame': {
    name: 'Sacred Flame',
    level: 0,
    school: 'evocation',
    castingTime: 'action',
    range: 60,
    duration: 0,
    concentration: false,
    targeting: { type: 'single' },
    save: { ability: 'dex', negatesAll: true },
    attack: null,
    damage: { dice: '1d8', type: 'radiant' },
    effects: [],
    selfEffects: [],
    onConcentrationEnd: [],
    counterSpellable: false,
    tags: ['cantrip', 'damage'],
    notes: 'DEX save or 1d8 radiant. Ignores cover. Auto-fail DEX if paralyzed.',
    special: ['ignores_cover', 'autofail_dex_if_paralyzed'],
  },

  // ═══════════════════════════════════════════════
  // 1ST LEVEL
  // ═══════════════════════════════════════════════

  'Command': {
    name: 'Command',
    level: 1,
    school: 'enchantment',
    castingTime: 'action',
    range: 60,
    duration: 1,
    concentration: false,
    targeting: { type: 'single' },
    save: { ability: 'wis', negatesAll: true },
    attack: null,
    damage: null,
    effects: ['prone'],
    selfEffects: [],
    onConcentrationEnd: [],
    counterSpellable: true,
    tags: ['control', 'debuff'],
    notes: 'WIS save or falls prone and ends turn (Grovel option).',
  },

  'Healing Word': {
    name: 'Healing Word',
    level: 1,
    school: 'evocation',
    castingTime: 'bonus_action',
    range: 60,
    duration: 0,
    concentration: false,
    targeting: { type: 'single' },
    save: null,
    attack: null,
    damage: null,
    healing: { dice: '1d4', bonus: 'casting_mod' },
    effects: [],
    selfEffects: [],
    onConcentrationEnd: [],
    counterSpellable: true,
    tags: ['healing'],
    notes: 'Heals 1d4 + casting mod. Bonus action. 60ft range.',
  },

  'Inflict Wounds': {
    name: 'Inflict Wounds',
    level: 1,
    school: 'necromancy',
    castingTime: 'action',
    range: 5,
    duration: 0,
    concentration: false,
    targeting: { type: 'single' },
    save: null,
    attack: { type: 'melee_spell' },
    damage: { dice: '3d10', type: 'necrotic' },
    effects: [],
    selfEffects: [],
    onConcentrationEnd: [],
    counterSpellable: true,
    tags: ['damage', 'melee'],
    notes: 'Melee spell attack. 3d10 necrotic on hit.',
  },

  'Shield of Faith': {
    name: 'Shield of Faith',
    level: 1,
    school: 'abjuration',
    castingTime: 'bonus_action',
    range: 60,
    duration: 100,
    concentration: true,
    targeting: { type: 'single' },
    save: null,
    attack: null,
    damage: null,
    effects: [],
    selfEffects: ['ac_bonus_2'],
    onConcentrationEnd: ['remove_ac_bonus_2'],
    counterSpellable: true,
    tags: ['buff', 'defense'],
    notes: '+2 AC. Concentration, up to 10 minutes.',
  },

  'Dissonant Whispers': {
    name: 'Dissonant Whispers',
    level: 1,
    school: 'enchantment',
    castingTime: 'action',
    range: 60,
    duration: 0,
    concentration: false,
    targeting: { type: 'single' },
    save: { ability: 'wis', negatesAll: false },
    attack: null,
    damage: { dice: '3d6', type: 'psychic' },
    effects: ['must_use_reaction_to_move_away'],
    selfEffects: [],
    onConcentrationEnd: [],
    counterSpellable: true,
    tags: ['damage', 'control'],
    notes: 'WIS save. 3d6 psychic (half on save). Must use reaction to move away on fail.',
  },

  'Thunderwave': {
    name: 'Thunderwave',
    level: 1,
    school: 'evocation',
    castingTime: 'action',
    range: 0,
    duration: 0,
    concentration: false,
    targeting: { type: 'area', shape: 'cube', size: 15 },
    save: { ability: 'con', negatesAll: false },
    attack: null,
    damage: { dice: '2d8', type: 'thunder' },
    effects: ['pushed_10ft'],
    selfEffects: [],
    onConcentrationEnd: [],
    counterSpellable: true,
    tags: ['damage', 'aoe', 'control'],
    notes: 'CON save. 2d8 thunder (half on success). Pushed 10ft on fail.',
  },

  'Sleep': {
    name: 'Sleep',
    level: 1,
    school: 'enchantment',
    castingTime: 'action',
    range: 90,
    duration: 10,
    concentration: false,
    targeting: { type: 'area', shape: 'sphere', radius: 20 },
    save: null,
    attack: null,
    damage: null,
    effects: ['unconscious'],
    selfEffects: [],
    onConcentrationEnd: [],
    counterSpellable: true,
    tags: ['control', 'aoe', 'disable'],
    notes: 'Roll 5d8 HP pool (7d8 at 3rd). Creatures with lowest HP first fall unconscious. No save. Undead/elves immune.',
    special: ['hp_pool', 'lowest_hp_first', 'immune_undead', 'immune_elf'],
    hpPool: { base: '5d8', perLevel: '2d8' },
  },

  'Faerie Fire': {
    name: 'Faerie Fire',
    level: 1,
    school: 'evocation',
    castingTime: 'action',
    range: 60,
    duration: 10,
    concentration: true,
    targeting: { type: 'area', shape: 'cube', size: 20 },
    save: { ability: 'dex', negatesAll: true },
    attack: null,
    damage: null,
    effects: ['faerie_fire'],
    selfEffects: [],
    onConcentrationEnd: ['remove_faerie_fire'],
    counterSpellable: true,
    tags: ['control', 'aoe', 'debuff'],
    notes: 'DEX save or outlined in light. Attacks against affected have advantage. Invisible creatures become visible.',
    special: ['reveals_invisible'],
  },

  'Silvery Barbs': {
    name: 'Silvery Barbs',
    level: 1,
    school: 'enchantment',
    castingTime: 'reaction',
    range: 60,
    duration: 0,
    concentration: false,
    targeting: { type: 'single' },
    save: null,
    attack: null,
    damage: null,
    effects: [],
    selfEffects: [],
    onConcentrationEnd: [],
    counterSpellable: false,
    tags: ['reaction', 'debuff'],
    notes: 'Force a creature to reroll a d20. Grant advantage to an ally on next roll.',
    special: ['reaction_spell', 'force_reroll'],
  },

  'Shield': {
    name: 'Shield',
    level: 1,
    school: 'abjuration',
    castingTime: 'reaction',
    range: 0,
    duration: 1,
    concentration: false,
    targeting: { type: 'self' },
    save: null,
    attack: null,
    damage: null,
    effects: [],
    selfEffects: ['ac_bonus_5'],
    onConcentrationEnd: [],
    counterSpellable: false,
    tags: ['reaction', 'defense'],
    notes: '+5 AC until start of next turn, including vs triggering attack.',
  },

  'Magic Missile': {
    name: 'Magic Missile',
    level: 1,
    school: 'evocation',
    castingTime: 'action',
    range: 120,
    duration: 0,
    concentration: false,
    targeting: { type: 'single' },
    save: null,
    attack: null,
    damage: { dice: '1d4', type: 'force', bonus: 1 },
    effects: [],
    selfEffects: [],
    onConcentrationEnd: [],
    counterSpellable: true,
    tags: ['damage', 'auto_hit'],
    notes: '3 darts, 1d4+1 force each. Auto-hit. +1 dart per slot level above 1st.',
    special: ['auto_hit', 'multi_dart'],
    dartsAtLevel: { 1: 3, 2: 4, 3: 5, 4: 6, 5: 7 },
  },

  'Mage Armor': {
    name: 'Mage Armor',
    level: 1,
    school: 'abjuration',
    castingTime: 'action',
    range: 0,
    duration: 80,
    concentration: false,
    targeting: { type: 'single' },
    save: null,
    attack: null,
    damage: null,
    effects: [],
    selfEffects: ['ac_set_13_plus_dex'],
    onConcentrationEnd: [],
    counterSpellable: true,
    tags: ['buff', 'defense', 'pre_cast'],
    notes: 'Base AC becomes 13 + DEX mod. No armor. Pre-cast before combat.',
  },

  // ═══════════════════════════════════════════════
  // 2ND LEVEL
  // ═══════════════════════════════════════════════

  'Hold Person': {
    name: 'Hold Person',
    level: 2,
    school: 'enchantment',
    castingTime: 'action',
    range: 60,
    duration: 10,
    concentration: true,
    targeting: { type: 'single' },
    save: { ability: 'wis', negatesAll: true },
    attack: null,
    damage: null,
    effects: ['paralyzed'],
    selfEffects: [],
    onConcentrationEnd: ['remove_paralyzed'],
    counterSpellable: true,
    tags: ['control', 'single_target', 'save_or_suck'],
    notes: 'WIS save or paralyzed. End-of-turn repeat save. Concentration.',
    endOfTurnSave: { ability: 'wis' },
  },

  'Spiritual Weapon': {
    name: 'Spiritual Weapon',
    level: 2,
    school: 'evocation',
    castingTime: 'bonus_action',
    range: 60,
    duration: 10,
    concentration: false,
    targeting: { type: 'single' },
    save: null,
    attack: { type: 'melee_spell' },
    damage: { dice: '1d8', type: 'force', bonus: 'casting_mod' },
    effects: [],
    selfEffects: [],
    onConcentrationEnd: [],
    counterSpellable: true,
    tags: ['damage', 'bonus_action', 'sustained'],
    notes: 'Bonus action melee spell attack each turn. 1d8 + casting mod force.',
    sustainedEffect: true,
  },

  'Shatter': {
    name: 'Shatter',
    level: 2,
    school: 'evocation',
    castingTime: 'action',
    range: 60,
    duration: 0,
    concentration: false,
    targeting: { type: 'area', shape: 'sphere', radius: 10 },
    save: { ability: 'con', negatesAll: false },
    attack: null,
    damage: { dice: '3d8', type: 'thunder' },
    effects: [],
    selfEffects: [],
    onConcentrationEnd: [],
    counterSpellable: true,
    tags: ['damage', 'aoe'],
    notes: 'CON save. 3d8 thunder (half on success). 10ft radius sphere.',
  },

  'Misty Step': {
    name: 'Misty Step',
    level: 2,
    school: 'conjuration',
    castingTime: 'bonus_action',
    range: 0,
    duration: 0,
    concentration: false,
    targeting: { type: 'self' },
    save: null,
    attack: null,
    damage: null,
    effects: [],
    selfEffects: ['teleport_30ft'],
    onConcentrationEnd: [],
    counterSpellable: true,
    tags: ['movement', 'escape', 'utility'],
    notes: 'Bonus action. Teleport up to 30ft to a visible unoccupied space.',
  },

  // ═══════════════════════════════════════════════
  // 3RD LEVEL
  // ═══════════════════════════════════════════════

  'Hypnotic Pattern': {
    name: 'Hypnotic Pattern',
    level: 3,
    school: 'illusion',
    castingTime: 'action',
    range: 120,
    duration: 10,
    concentration: true,
    targeting: { type: 'area', shape: 'cube', size: 30 },
    save: { ability: 'wis', negatesAll: true },
    attack: null,
    damage: null,
    effects: ['charmed_hp', 'incapacitated'],
    selfEffects: [],
    onConcentrationEnd: ['remove_charmed_hp', 'remove_incapacitated'],
    counterSpellable: true,
    tags: ['control', 'aoe', 'save_or_suck'],
    notes: 'WIS save or charmed + incapacitated + speed 0. Shake awake as action.',
    special: ['can_shake_awake'],
  },

  'Counterspell': {
    name: 'Counterspell',
    level: 3,
    school: 'abjuration',
    castingTime: 'reaction',
    range: 60,
    duration: 0,
    concentration: false,
    targeting: { type: 'single' },
    save: null,
    attack: null,
    damage: null,
    effects: ['counter'],
    selfEffects: [],
    onConcentrationEnd: [],
    counterSpellable: false,
    tags: ['reaction', 'counter'],
    notes: 'Auto-counters spells ≤ slot level. Higher: DC 10 + spell level ability check.',
    special: ['auto_counter_if_slot_gte_spell_level'],
  },

  'Fireball': {
    name: 'Fireball',
    level: 3,
    school: 'evocation',
    castingTime: 'action',
    range: 150,
    duration: 0,
    concentration: false,
    targeting: { type: 'area', shape: 'sphere', radius: 20 },
    save: { ability: 'dex', negatesAll: false },
    attack: null,
    damage: { dice: '8d6', type: 'fire' },
    effects: [],
    selfEffects: [],
    onConcentrationEnd: [],
    counterSpellable: true,
    tags: ['damage', 'aoe'],
    notes: 'DEX save. 8d6 fire (half on success). 20ft radius sphere.',
  },

  // ═══════════════════════════════════════════════
  // 4TH LEVEL
  // ═══════════════════════════════════════════════

  'Greater Invisibility': {
    name: 'Greater Invisibility',
    level: 4,
    school: 'illusion',
    castingTime: 'action',
    range: 0,
    duration: 10,
    concentration: true,
    targeting: { type: 'self' },
    save: null,
    attack: null,
    damage: null,
    effects: [],
    selfEffects: ['invisible'],
    onConcentrationEnd: ['remove_invisible'],
    counterSpellable: true,
    tags: ['buff', 'stealth', 'defensive'],
    notes: 'Target becomes invisible. Doesn\'t end on attack/spell. Concentration.',
  },

  'Dimension Door': {
    name: 'Dimension Door',
    level: 4,
    school: 'conjuration',
    castingTime: 'action',
    range: 500,
    duration: 0,
    concentration: false,
    targeting: { type: 'self' },
    save: null,
    attack: null,
    damage: null,
    effects: [],
    selfEffects: ['teleport'],
    onConcentrationEnd: [],
    counterSpellable: true,
    tags: ['movement', 'escape', 'utility'],
    notes: 'Teleport self up to 500ft to a place you can see or describe.',
  },

  'Blight': {
    name: 'Blight',
    level: 4,
    school: 'necromancy',
    castingTime: 'action',
    range: 30,
    duration: 0,
    concentration: false,
    targeting: { type: 'single' },
    save: { ability: 'con', negatesAll: false },
    attack: null,
    damage: { dice: '8d8', type: 'necrotic' },
    effects: [],
    selfEffects: [],
    onConcentrationEnd: [],
    counterSpellable: true,
    tags: ['damage', 'single_target'],
    notes: 'CON save. 8d8 necrotic (half on success). 30ft range.',
  },

  'Ice Storm': {
    name: 'Ice Storm',
    level: 4,
    school: 'evocation',
    castingTime: 'action',
    range: 300,
    duration: 0,
    concentration: false,
    targeting: { type: 'area', shape: 'cylinder', radius: 20, height: 40 },
    save: { ability: 'dex', negatesAll: false },
    attack: null,
    damage: { dice: '2d8', type: 'bludgeoning', bonusDice: '4d6', bonusType: 'cold' },
    effects: ['difficult_terrain'],
    selfEffects: [],
    onConcentrationEnd: [],
    counterSpellable: true,
    tags: ['damage', 'aoe', 'control'],
    notes: 'DEX save. 2d8 bludgeoning + 4d6 cold (half on success). Creates difficult terrain.',
  },

  'Polymorph': {
    name: 'Polymorph',
    level: 4,
    school: 'transmutation',
    castingTime: 'action',
    range: 60,
    duration: 600,
    concentration: true,
    targeting: { type: 'single' },
    save: { ability: 'wis', negatesAll: true },
    attack: null,
    damage: null,
    effects: ['polymorphed'],
    selfEffects: [],
    onConcentrationEnd: ['remove_polymorph'],
    counterSpellable: true,
    tags: ['control', 'buff', 'transmutation'],
    notes: 'Transform a creature into a beast. On enemy: WIS save or become a sheep (1 HP). On self: no save, become T-Rex/Giant Ape/Giant Eagle.',
    special: ['enemy_nerf', 'self_buff', 'temp_hp_beast'],
    beastForms: {
      enemy: { name: 'Sheep', cr: 0, maxHP: 1, ac: 10, speed: 20, str: 2, dex: 10, con: 6, weapons: [] },
      self: [
        { name: 'T-Rex', cr: 8, maxHP: 136, ac: 13, speed: 50, str: 25, dex: 10, con: 19, multiattack: 2, multiattackWeapons: ['Bite', 'Tail'], weapons: [
          { name: 'Bite', attackBonus: 10, damageDice: '4d12', damageBonus: 7, type: 'melee', range: 10 },
          { name: 'Tail', attackBonus: 10, damageDice: '3d8', damageBonus: 7, type: 'melee', range: 10 },
        ] },
        { name: 'Giant Ape', cr: 7, maxHP: 157, ac: 12, speed: 40, str: 23, dex: 14, con: 18, multiattack: 2, multiattackWeapons: ['Fist', 'Fist'], weapons: [
          { name: 'Fist', attackBonus: 9, damageDice: '3d10', damageBonus: 6, type: 'melee', range: 10 },
          { name: 'Rock', attackBonus: 9, damageDice: '7d6', damageBonus: 6, type: 'ranged', range: 50 },
        ] },
        { name: 'Mammoth', cr: 6, maxHP: 126, ac: 13, speed: 40, str: 24, dex: 9, con: 21, weapons: [
          { name: 'Gore', attackBonus: 10, damageDice: '4d8', damageBonus: 7, type: 'melee', range: 10 },
          { name: 'Stomp', attackBonus: 10, damageDice: '4d10', damageBonus: 7, type: 'melee', range: 5 },
        ] },
        { name: 'Giant Crocodile', cr: 5, maxHP: 85, ac: 14, speed: 30, str: 21, dex: 9, con: 17, multiattack: 2, weapons: [
          { name: 'Bite', attackBonus: 8, damageDice: '3d10', damageBonus: 5, type: 'melee', range: 5 },
          { name: 'Tail', attackBonus: 8, damageDice: '2d8', damageBonus: 5, type: 'melee', range: 10 },
        ] },
        { name: 'Triceratops', cr: 5, maxHP: 95, ac: 13, speed: 50, str: 22, dex: 9, con: 17, weapons: [
          { name: 'Gore', attackBonus: 9, damageDice: '4d8', damageBonus: 6, type: 'melee', range: 5 },
          { name: 'Stomp', attackBonus: 9, damageDice: '3d10', damageBonus: 6, type: 'melee', range: 5 },
        ] },
        { name: 'Giant Shark', cr: 5, maxHP: 126, ac: 13, speed: 0, str: 23, dex: 11, con: 21, weapons: [
          { name: 'Bite', attackBonus: 9, damageDice: '3d10', damageBonus: 6, type: 'melee', range: 5 },
        ] },
        { name: 'Elephant', cr: 4, maxHP: 76, ac: 12, speed: 40, str: 22, dex: 9, con: 17, weapons: [
          { name: 'Gore', attackBonus: 8, damageDice: '3d8', damageBonus: 6, type: 'melee', range: 5 },
          { name: 'Stomp', attackBonus: 8, damageDice: '3d10', damageBonus: 6, type: 'melee', range: 5 },
        ] },
        { name: 'Giant Scorpion', cr: 3, maxHP: 52, ac: 15, speed: 40, str: 15, dex: 13, con: 15, multiattack: 3, weapons: [
          { name: 'Claw', attackBonus: 4, damageDice: '1d8', damageBonus: 2, type: 'melee', range: 5 },
          { name: 'Sting', attackBonus: 4, damageDice: '1d10', damageBonus: 2, type: 'melee', range: 5 },
        ] },
        { name: 'Killer Whale', cr: 3, maxHP: 90, ac: 12, speed: 0, str: 19, dex: 10, con: 13, weapons: [
          { name: 'Bite', attackBonus: 6, damageDice: '5d6', damageBonus: 4, type: 'melee', range: 5 },
        ] },
        { name: 'Ankylosaurus', cr: 3, maxHP: 68, ac: 15, speed: 30, str: 19, dex: 11, con: 15, weapons: [
          { name: 'Tail', attackBonus: 7, damageDice: '4d6', damageBonus: 4, type: 'melee', range: 10 },
        ] },
        { name: 'Giant Constrictor Snake', cr: 2, maxHP: 60, ac: 12, speed: 30, str: 19, dex: 14, con: 12, weapons: [
          { name: 'Bite', attackBonus: 6, damageDice: '2d6', damageBonus: 4, type: 'melee', range: 10 },
          { name: 'Constrict', attackBonus: 6, damageDice: '2d8', damageBonus: 4, type: 'melee', range: 5 },
        ] },
        { name: 'Rhinoceros', cr: 2, maxHP: 45, ac: 11, speed: 40, str: 21, dex: 8, con: 15, weapons: [
          { name: 'Gore', attackBonus: 7, damageDice: '2d8', damageBonus: 5, type: 'melee', range: 5 },
        ] },
        { name: 'Polar Bear', cr: 2, maxHP: 42, ac: 12, speed: 40, str: 20, dex: 10, con: 16, multiattack: 2, weapons: [
          { name: 'Bite', attackBonus: 7, damageDice: '1d8', damageBonus: 5, type: 'melee', range: 5 },
          { name: 'Claws', attackBonus: 7, damageDice: '2d6', damageBonus: 5, type: 'melee', range: 5 },
        ] },
        { name: 'Allosaurus', cr: 2, maxHP: 51, ac: 13, speed: 60, str: 19, dex: 13, con: 17, weapons: [
          { name: 'Bite', attackBonus: 6, damageDice: '2d10', damageBonus: 4, type: 'melee', range: 5 },
          { name: 'Claw', attackBonus: 6, damageDice: '1d8', damageBonus: 4, type: 'melee', range: 5 },
        ] },
        { name: 'Saber-Toothed Tiger', cr: 2, maxHP: 52, ac: 12, speed: 40, str: 18, dex: 14, con: 15, weapons: [
          { name: 'Bite', attackBonus: 6, damageDice: '1d10', damageBonus: 5, type: 'melee', range: 5 },
          { name: 'Claw', attackBonus: 6, damageDice: '2d6', damageBonus: 5, type: 'melee', range: 5 },
        ] },
        { name: 'Plesiosaurus', cr: 2, maxHP: 68, ac: 13, speed: 20, str: 18, dex: 15, con: 16, weapons: [
          { name: 'Bite', attackBonus: 6, damageDice: '3d6', damageBonus: 4, type: 'melee', range: 10 },
        ] },
        { name: 'Giant Elk', cr: 2, maxHP: 42, ac: 14, speed: 60, str: 19, dex: 16, con: 14, weapons: [
          { name: 'Ram', attackBonus: 6, damageDice: '2d6', damageBonus: 4, type: 'melee', range: 10 },
          { name: 'Hooves', attackBonus: 6, damageDice: '4d8', damageBonus: 4, type: 'melee', range: 5 },
        ] },
        { name: 'Giant Boar', cr: 2, maxHP: 42, ac: 12, speed: 40, str: 17, dex: 10, con: 16, weapons: [
          { name: 'Tusk', attackBonus: 5, damageDice: '2d6', damageBonus: 3, type: 'melee', range: 5 },
        ] },
        { name: 'Hunter Shark', cr: 2, maxHP: 45, ac: 12, speed: 0, str: 18, dex: 13, con: 15, weapons: [
          { name: 'Bite', attackBonus: 6, damageDice: '2d8', damageBonus: 4, type: 'melee', range: 5 },
        ] },
        { name: 'Brown Bear', cr: 1, maxHP: 34, ac: 11, speed: 40, str: 19, dex: 10, con: 16, multiattack: 2, weapons: [
          { name: 'Bite', attackBonus: 6, damageDice: '1d8', damageBonus: 4, type: 'melee', range: 5 },
          { name: 'Claws', attackBonus: 6, damageDice: '2d6', damageBonus: 4, type: 'melee', range: 5 },
        ] },
        { name: 'Dire Wolf', cr: 1, maxHP: 37, ac: 14, speed: 50, str: 17, dex: 15, con: 15, weapons: [
          { name: 'Bite', attackBonus: 5, damageDice: '2d6', damageBonus: 3, type: 'melee', range: 5 },
        ] },
        { name: 'Giant Hyena', cr: 1, maxHP: 45, ac: 12, speed: 50, str: 16, dex: 14, con: 14, weapons: [
          { name: 'Bite', attackBonus: 5, damageDice: '2d6', damageBonus: 3, type: 'melee', range: 5 },
        ] },
        { name: 'Lion', cr: 1, maxHP: 26, ac: 12, speed: 50, str: 17, dex: 15, con: 13, weapons: [
          { name: 'Bite', attackBonus: 5, damageDice: '1d8', damageBonus: 3, type: 'melee', range: 5 },
          { name: 'Claw', attackBonus: 5, damageDice: '1d6', damageBonus: 3, type: 'melee', range: 5 },
        ] },
        { name: 'Tiger', cr: 1, maxHP: 37, ac: 12, speed: 40, str: 17, dex: 15, con: 14, weapons: [
          { name: 'Bite', attackBonus: 5, damageDice: '1d10', damageBonus: 3, type: 'melee', range: 5 },
          { name: 'Claw', attackBonus: 5, damageDice: '1d8', damageBonus: 3, type: 'melee', range: 5 },
        ] },
        { name: 'Giant Spider', cr: 1, maxHP: 26, ac: 14, speed: 30, str: 14, dex: 16, con: 12, weapons: [
          { name: 'Bite', attackBonus: 5, damageDice: '1d8', damageBonus: 3, type: 'melee', range: 5 },
        ] },
        { name: 'Giant Toad', cr: 1, maxHP: 39, ac: 11, speed: 20, str: 15, dex: 13, con: 13, weapons: [
          { name: 'Bite', attackBonus: 4, damageDice: '1d10', damageBonus: 2, type: 'melee', range: 5 },
        ] },
        { name: 'Giant Vulture', cr: 1, maxHP: 22, ac: 10, speed: 10, str: 15, dex: 10, con: 15, multiattack: 2, flying: true, weapons: [
          { name: 'Beak', attackBonus: 4, damageDice: '2d4', damageBonus: 2, type: 'melee', range: 5 },
          { name: 'Talons', attackBonus: 4, damageDice: '2d6', damageBonus: 2, type: 'melee', range: 5 },
        ] },
        { name: 'Giant Eagle', cr: 1, maxHP: 26, ac: 13, speed: 80, str: 16, dex: 17, con: 13, multiattack: 2, flying: true, weapons: [
          { name: 'Beak', attackBonus: 5, damageDice: '1d6', damageBonus: 3, type: 'melee', range: 5 },
          { name: 'Talons', attackBonus: 5, damageDice: '2d6', damageBonus: 3, type: 'melee', range: 5 },
        ] },
        { name: 'Deinonychus', cr: 1, maxHP: 26, ac: 13, speed: 40, str: 15, dex: 15, con: 14, multiattack: 3, weapons: [
          { name: 'Bite', attackBonus: 4, damageDice: '1d8', damageBonus: 2, type: 'melee', range: 5 },
          { name: 'Claw', attackBonus: 4, damageDice: '1d8', damageBonus: 2, type: 'melee', range: 5 },
        ] },
      ],
    },
  },

  // ═══════════════════════════════════════════════
  // 5TH LEVEL
  // ═══════════════════════════════════════════════

  'Cone of Cold': {
    name: 'Cone of Cold',
    level: 5,
    school: 'evocation',
    castingTime: 'action',
    range: 0,
    duration: 0,
    concentration: false,
    targeting: { type: 'area', shape: 'cone', length: 60 },
    save: { ability: 'con', negatesAll: false },
    attack: null,
    damage: { dice: '8d8', type: 'cold' },
    effects: [],
    selfEffects: [],
    onConcentrationEnd: [],
    counterSpellable: true,
    tags: ['damage', 'aoe'],
    notes: 'CON save. 8d8 cold (half on success). 60ft cone.',
  },

  'Cloudkill': {
    name: 'Cloudkill',
    level: 5,
    school: 'conjuration',
    castingTime: 'action',
    range: 120,
    duration: 10,
    concentration: true,
    targeting: { type: 'area', shape: 'sphere', radius: 20 },
    save: { ability: 'con', negatesAll: false },
    attack: null,
    damage: { dice: '5d8', type: 'poison' },
    effects: [],
    selfEffects: [],
    onConcentrationEnd: [],
    counterSpellable: true,
    tags: ['damage', 'aoe', 'control', 'sustained'],
    notes: 'CON save. 5d8 poison (half on success). Moves 10ft/round. Concentration.',
  },

  'Wall of Force': {
    name: 'Wall of Force',
    level: 5,
    school: 'evocation',
    castingTime: 'action',
    range: 120,
    duration: 10,
    concentration: true,
    targeting: { type: 'area', shape: 'wall' },
    save: null,
    attack: null,
    damage: null,
    effects: ['wall_of_force'],
    selfEffects: [],
    onConcentrationEnd: ['remove_wall_of_force'],
    counterSpellable: true,
    tags: ['control', 'wall', 'defensive'],
    notes: 'Creates impenetrable wall or dome. Concentration. Nothing passes through.',
  },

  // ═══════════════════════════════════════════════
  // 6TH LEVEL
  // ═══════════════════════════════════════════════

  'Globe of Invulnerability': {
    name: 'Globe of Invulnerability',
    level: 6,
    school: 'abjuration',
    castingTime: 'action',
    range: 0,
    duration: 10,
    concentration: true,
    targeting: { type: 'self' },
    save: null,
    attack: null,
    damage: null,
    effects: [],
    selfEffects: ['globe_of_invulnerability'],
    onConcentrationEnd: ['remove_globe_of_invulnerability'],
    counterSpellable: false,
    tags: ['defensive', 'buff'],
    notes: 'Spells of 5th level or lower can\'t affect anything within the barrier. Concentration.',
  },

  // ═══════════════════════════════════════════════
  // 7TH LEVEL
  // ═══════════════════════════════════════════════

  'Finger of Death': {
    name: 'Finger of Death',
    level: 7,
    school: 'necromancy',
    castingTime: 'action',
    range: 60,
    duration: 0,
    concentration: false,
    targeting: { type: 'single' },
    save: { ability: 'con', negatesAll: false },
    attack: null,
    damage: { dice: '7d8', type: 'necrotic', bonus: 30 },
    effects: [],
    selfEffects: [],
    onConcentrationEnd: [],
    counterSpellable: true,
    tags: ['damage', 'single_target'],
    notes: 'CON save. 7d8+30 necrotic (half on success). Kills humanoids → zombie.',
  },

  // ═══════════════════════════════════════════════
  // 8TH LEVEL
  // ═══════════════════════════════════════════════

  'Power Word Stun': {
    name: 'Power Word Stun',
    level: 8,
    school: 'enchantment',
    castingTime: 'action',
    range: 60,
    duration: 0,
    concentration: false,
    targeting: { type: 'single' },
    save: null,
    attack: null,
    damage: null,
    effects: ['stunned'],
    selfEffects: [],
    onConcentrationEnd: [],
    counterSpellable: true,
    tags: ['control', 'single_target', 'no_save'],
    notes: 'Auto-stun if target has ≤150 HP. End-of-turn CON save DC 15 to end.',
    special: ['hp_threshold_150', 'end_of_turn_con_save_15'],
    endOfTurnSave: { ability: 'con', dc: 15 },
  },

  // ═══════════════════════════════════════════════
  // CANTRIPS — MONSTER
  // ═══════════════════════════════════════════════

  'Fire Bolt': {
    name: 'Fire Bolt',
    level: 0,
    school: 'evocation',
    castingTime: 'action',
    range: 120,
    duration: 0,
    concentration: false,
    targeting: { type: 'single' },
    save: null,
    attack: { type: 'ranged_spell' },
    damage: { dice: '2d10', type: 'fire' },
    effects: [],
    selfEffects: [],
    onConcentrationEnd: [],
    counterSpellable: false,
    tags: ['cantrip', 'damage', 'ranged'],
    notes: 'Ranged spell attack. 2d10 fire. Ignites flammable objects.',
  },

  'Chill Touch': {
    name: 'Chill Touch',
    level: 0,
    school: 'necromancy',
    castingTime: 'action',
    range: 120,
    duration: 0,
    concentration: false,
    targeting: { type: 'single' },
    save: null,
    attack: { type: 'ranged_spell' },
    damage: { dice: '2d8', type: 'necrotic' },
    effects: ['no_healing'],
    selfEffects: [],
    onConcentrationEnd: [],
    counterSpellable: false,
    tags: ['cantrip', 'damage', 'ranged'],
    notes: 'Ranged spell attack. 2d8 necrotic. Target can\'t regain HP until start of your next turn.',
  },

  'Ray of Frost': {
    name: 'Ray of Frost',
    level: 0,
    school: 'evocation',
    castingTime: 'action',
    range: 60,
    duration: 0,
    concentration: false,
    targeting: { type: 'single' },
    save: null,
    attack: { type: 'ranged_spell' },
    damage: { dice: '2d8', type: 'cold' },
    effects: ['speed_reduced_10'],
    selfEffects: [],
    onConcentrationEnd: [],
    counterSpellable: false,
    tags: ['cantrip', 'damage', 'ranged', 'debuff'],
    notes: 'Ranged spell attack. 2d8 cold. Target speed reduced by 10ft until start of your next turn.',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Beast form portrait URL helper
// ═══════════════════════════════════════════════════════════════════════════

function beastPortraitUrl(name) {
  const slug = name.replace(/\s+/g, '-').toLowerCase();
  return `/portraits/beasts/${slug}.svg`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Registry API
// ═══════════════════════════════════════════════════════════════════════════

export function getSpell(name) {
  const spell = SPELLS[name];
  if (!spell) throw new Error(`Unknown spell: ${name}`);

  // Inject portraitUrl into beast forms on access
  if (spell.beastForms) {
    const withPortrait = (f) => ({ ...f, portraitUrl: beastPortraitUrl(f.name) });
    return {
      ...spell,
      beastForms: {
        enemy: spell.beastForms.enemy ? withPortrait(spell.beastForms.enemy) : undefined,
        self: spell.beastForms.self ? spell.beastForms.self.map(withPortrait) : undefined,
      },
    };
  }

  return spell;
}

export function hasSpell(name) {
  return name in SPELLS;
}

export function getSpellsByLevel(level) {
  return Object.values(SPELLS).filter(s => s.level === level);
}

export function getSpellsByTag(tag) {
  return Object.values(SPELLS).filter(s => s.tags.includes(tag));
}

export function getConcentrationSpells() {
  return Object.values(SPELLS).filter(s => s.concentration);
}

export function isConcentrationSpell(name) {
  return hasSpell(name) && SPELLS[name].concentration;
}

export function getAllSpellNames() {
  return Object.keys(SPELLS);
}

/**
 * Get the effective radius (in feet) of a spell's AoE for target resolution.
 */
export function getAoERadius(targeting) {
  if (!targeting || targeting.type !== 'area') return 0;
  switch (targeting.shape) {
    case 'cube':     return Math.floor(targeting.size / 2);
    case 'sphere':   return targeting.radius || 0;
    case 'cone':     return targeting.length || 0;
    case 'cylinder': return targeting.radius || 0;
    case 'wall':     return 0;
    default:         return 0;
  }
}
