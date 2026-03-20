/**
 * HUD Mock Data — placeholder data for the combat HUD overlay.
 * All data is hardcoded for visual prototyping.
 * When wiring to real game state, replace these exports with live data sources.
 */

// ── Party Members (left panel) ──────────────────────────────────────────────

export const MOCK_PARTY = [
  {
    id: 'party-1',
    name: 'Thalindra',
    portraitUrl: null, // placeholder — will render initials
    hp: 45,
    maxHp: 52,
    ac: 16,
    side: 'player',
    conditions: [],
    shortDesc: 'Half-Elf Lore Bard 8',
  },
  {
    id: 'party-2',
    name: 'Kael Stonefist',
    portraitUrl: null,
    hp: 72,
    maxHp: 76,
    ac: 20,
    side: 'player',
    conditions: ['blessed'],
    shortDesc: 'Dwarf Champion Fighter 8',
  },
  {
    id: 'party-3',
    name: 'Mira Dawnwhisper',
    portraitUrl: null,
    hp: 38,
    maxHp: 40,
    ac: 12,
    side: 'player',
    conditions: [],
    shortDesc: 'Human Evocation Wizard 8',
  },
  {
    id: 'party-4',
    name: 'Shade',
    portraitUrl: null,
    hp: 55,
    maxHp: 55,
    ac: 15,
    side: 'player',
    conditions: ['invisible'],
    shortDesc: 'Tiefling Gloom Stalker 8',
  },
]

// ── Enemies / Entities of Interest (right panel) ────────────────────────────

export const MOCK_ENTITIES = [
  {
    id: 'enemy-1',
    name: 'Bandit Captain',
    portraitUrl: null,
    hp: 65,
    maxHp: 65,
    ac: 15,
    side: 'enemy',
    type: 'enemy',
    conditions: [],
    shortDesc: 'Leader of the ambush',
  },
  {
    id: 'enemy-2',
    name: 'War Mage',
    portraitUrl: null,
    hp: 40,
    maxHp: 40,
    ac: 12,
    side: 'enemy',
    type: 'enemy',
    conditions: [],
    shortDesc: 'Mercenary spellcaster',
  },
  {
    id: 'enemy-3',
    name: 'Ogre',
    portraitUrl: null,
    hp: 59,
    maxHp: 59,
    ac: 11,
    side: 'enemy',
    type: 'enemy',
    conditions: ['frightened'],
    shortDesc: 'Hired muscle',
  },
  {
    id: 'item-1',
    name: 'Healing Potion',
    portraitUrl: null,
    hp: 0,
    maxHp: 0,
    ac: 0,
    side: 'neutral',
    type: 'item',
    conditions: [],
    shortDesc: 'Restores 2d4+2 HP',
  },
  {
    id: 'env-1',
    name: 'Exploding Barrel',
    portraitUrl: null,
    hp: 10,
    maxHp: 10,
    ac: 8,
    side: 'neutral',
    type: 'object',
    conditions: [],
    shortDesc: '3d6 fire damage (10 ft)',
  },
]

// ── Hotkey Action Bar (top panel) ───────────────────────────────────────────

export const MOCK_HOTKEYS = [
  {
    id: 'hk-1',
    label: 'Attack',
    icon: '⚔️',
    category: 'action',
    subOptions: [
      { id: 'hk-1a', label: 'Longbow (+7, 1d8+4)', icon: '🏹' },
      { id: 'hk-1b', label: 'Rapier (+7, 1d8+4)', icon: '🗡️' },
      { id: 'hk-1c', label: 'Dagger (+7, 1d4+4)', icon: '🔪' },
    ],
  },
  {
    id: 'hk-2',
    label: 'Cast Spell',
    icon: '✨',
    category: 'spell',
    subOptions: [
      { id: 'hk-2a', label: 'Polymorph (4th)', icon: '🦎' },
      { id: 'hk-2b', label: 'Hypnotic Pattern (3rd)', icon: '🌀' },
      { id: 'hk-2c', label: 'Healing Word (1st)', icon: '💚' },
      { id: 'hk-2d', label: 'Vicious Mockery (cantrip)', icon: '🗣️' },
      { id: 'hk-2e', label: 'Silvery Barbs (1st)', icon: '🪩' },
    ],
  },
  {
    id: 'hk-3',
    label: 'Dash',
    icon: '💨',
    category: 'action',
    subOptions: [],
  },
  {
    id: 'hk-4',
    label: 'Dodge',
    icon: '🛡️',
    category: 'action',
    subOptions: [],
  },
  {
    id: 'hk-5',
    label: 'Disengage',
    icon: '↩️',
    category: 'action',
    subOptions: [],
  },
  {
    id: 'hk-6',
    label: 'Roll Dice',
    icon: '🎲',
    category: 'roll',
    subOptions: [
      { id: 'hk-6a', label: 'd20', icon: '🎲' },
      { id: 'hk-6b', label: 'd12', icon: '🎲' },
      { id: 'hk-6c', label: 'd10', icon: '🎲' },
      { id: 'hk-6d', label: 'd8', icon: '🎲' },
      { id: 'hk-6e', label: 'd6', icon: '🎲' },
      { id: 'hk-6f', label: 'd4', icon: '🎲' },
    ],
  },
  {
    id: 'hk-7',
    label: 'Bardic Insp.',
    icon: '🎵',
    category: 'action',
    subOptions: [],
  },
  {
    id: 'hk-8',
    label: 'Hide',
    icon: '👁️',
    category: 'action',
    subOptions: [],
  },
]

// ── Narration entries (bottom panel) ────────────────────────────────────────

export const MOCK_NARRATION = [
  {
    id: 'nar-1',
    timestamp: '00:01',
    text: 'The forest path narrows as twisted oaks close in overhead. A twig snaps in the underbrush—then silence.',
  },
  {
    id: 'nar-2',
    timestamp: '00:02',
    text: 'Three figures step from the shadows, weapons drawn. Their leader, a scarred woman in studded leather, points her blade at the party. "Your gold or your lives. Choose quickly."',
  },
  {
    id: 'nar-3',
    timestamp: '00:03',
    text: 'Initiative is rolled! Thalindra\'s fingers dance across her lute strings as arcane energy gathers. Kael raises his shield and steps forward, iron boots crunching on dead leaves.',
  },
  {
    id: 'nar-4',
    timestamp: '00:04',
    text: 'The War Mage hurls a bolt of fire that streaks past Mira\'s ear, singeing the air. She smirks—amateurs. Her counter-spell unravels the next incantation before it leaves his lips.',
  },
  {
    id: 'nar-5',
    timestamp: '00:05',
    text: 'Shade melts into the darkness between two trees, completely vanishing from sight. The Ogre swings wildly at where she stood a moment ago, his club splintering a sapling.',
  },
  {
    id: 'nar-6',
    timestamp: '00:06',
    text: 'Thalindra\'s voice rings out in a cutting insult: "Is that the best your mother taught you?" The Bandit Captain falters, visibly shaken by the magical barb.',
  },
]

// ── Active character info (portrait area) ───────────────────────────────────

export const MOCK_ACTIVE_CHARACTER = {
  id: 'party-1',
  name: 'Steven',
  portraitUrl: '/portraits/v2/player-dragonborn-bard.png',
  hp: 45,
  maxHp: 52,
  ac: 16,
  level: 8,
  className: 'Lore Bard',
  initiative: 18,
  speed: 30,
  // Combat resources for action bar
  spellSlots: { 1: 4, 2: 3, 3: 3, 4: 2 },
  spellcasting: { saveDC: 15, attackBonus: 7 },
  cantrips: [
    { id: 'sp-vm', name: 'Vicious Mockery', level: 0, icon: '🗣️', school: 'enchantment', actionType: 'action', range: 60, description: 'WIS save or 2d4 psychic + disadvantage' },
    { id: 'sp-mi', name: 'Minor Illusion', level: 0, icon: '👻', school: 'illusion', actionType: 'action', range: 30, description: 'Create a sound or image' },
  ],
  spells: [
    { id: 'sp-hw', name: 'Healing Word', level: 1, icon: '💚', school: 'evocation', actionType: 'bonus', range: 60, description: '1d4+CHA healing (bonus action)' },
    { id: 'sp-dw', name: 'Dissonant Whispers', level: 1, icon: '🔊', school: 'enchantment', actionType: 'action', range: 60, description: '3d6 psychic + flee on WIS fail' },
    { id: 'sp-ff', name: 'Faerie Fire', level: 1, icon: '✨', school: 'evocation', actionType: 'action', range: 60, concentration: true, description: 'DEX save or outlined, attacks have advantage' },
    { id: 'sp-sb', name: 'Silvery Barbs', level: 1, icon: '🪩', school: 'enchantment', actionType: 'reaction', range: 60, description: 'Force reroll + grant advantage to ally' },
    { id: 'sp-ms', name: 'Misty Step', level: 2, icon: '🌫️', school: 'conjuration', actionType: 'bonus', range: 0, description: 'Teleport up to 30ft to unoccupied space you can see (Fey Touched)' },
    { id: 'sp-cl', name: 'Comprehend Languages', level: 1, icon: '📖', school: 'divination', actionType: 'action', range: 0, ritual: true, description: '1hr: understand all spoken/written language (Fey Touched)' },
    { id: 'sp-inv', name: 'Invisibility', level: 2, icon: '👤', school: 'illusion', actionType: 'action', range: 0, concentration: true, description: 'Creature becomes invisible' },
    { id: 'sp-sil', name: 'Silence', level: 2, icon: '🤫', school: 'illusion', actionType: 'action', range: 120, concentration: true, description: '20ft sphere: deafened, no verbal spells' },
    { id: 'sp-sht', name: 'Shatter', level: 2, icon: '💥', school: 'evocation', actionType: 'action', range: 60, description: '3d8 thunder in 10ft sphere, CON save half' },
    { id: 'sp-hp2', name: 'Hold Person', level: 2, icon: '🫴', school: 'enchantment', actionType: 'action', range: 60, concentration: true, description: 'WIS save or paralyzed' },
    { id: 'sp-hyp', name: 'Hypnotic Pattern', level: 3, icon: '🌀', school: 'illusion', actionType: 'action', range: 120, concentration: true, description: 'WIS save or charmed+incapacitated' },
    { id: 'sp-cs', name: 'Counterspell', level: 3, icon: '🚫', school: 'abjuration', actionType: 'reaction', range: 60, description: 'Counter spell level 3 or lower; check for higher' },
    { id: 'sp-gi', name: 'Greater Invisibility', level: 4, icon: '🫥', school: 'illusion', actionType: 'action', range: 0, concentration: true, description: 'Invisible even when attacking/casting' },
    { id: 'sp-pm', name: 'Polymorph', level: 4, icon: '🦎', school: 'transmutation', actionType: 'action', range: 60, concentration: true, description: 'Transform into beast of CR ≤ target level' },
  ],
  weapons: [
    { id: 'wp-xbow', name: 'Light Crossbow', attackBonus: 7, damage: '1d8+4', range: 80, type: 'ranged', icon: '🏹' },
    { id: 'wp-rapier', name: 'Rapier', attackBonus: 7, damage: '1d8+4', range: 5, type: 'melee', icon: '🗡️' },
    { id: 'wp-dagger', name: 'Dagger', attackBonus: 7, damage: '1d4+4', range: 20, type: 'melee', icon: '🔪' },
  ],
  classFeatures: [
    { id: 'cf-bi', name: 'Bardic Inspiration', icon: '🎵', actionType: 'bonus', uses: 4, maxUses: 4, die: 'd8', description: 'Grant d8 inspiration to ally within 60ft' },
    { id: 'cf-cw', name: 'Cutting Words', icon: '✂️', actionType: 'reaction', uses: 0, maxUses: 0, description: 'Subtract d8 from enemy roll (uses Bardic Inspiration)', sharePool: 'cf-bi' },
    { id: 'cf-bw', name: 'Breath Weapon', icon: '🐉', actionType: 'action', uses: 3, maxUses: 3, description: '2d10 radiant, 15ft cone, DEX save DC 14 — replace one attack', isAttack: true },
    { id: 'cf-df', name: 'Dragon Fear', icon: '😱', actionType: 'action', sharePool: 'cf-bw', description: 'Roar: WIS DC 15 or frightened 1 min, 30ft — spends a Breath Weapon use' },
    { id: 'cf-gf', name: 'Gem Flight', icon: '🦋', actionType: 'bonus', uses: 3, maxUses: 3, description: 'Spectral wings, fly speed 30ft, 10 rounds' },
  ],
}

// ── Combined export ─────────────────────────────────────────────────────────

export const MOCK_HUD_DATA = {
  party: MOCK_PARTY,
  entities: MOCK_ENTITIES,
  hotkeys: MOCK_HOTKEYS,
  narration: MOCK_NARRATION,
  activeCharacter: MOCK_ACTIVE_CHARACTER,
}
