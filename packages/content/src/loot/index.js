/**
 * Loot Tables — per-creature loot definitions.
 * Pure data + lookup helpers. No game logic (rolling happens in combat package).
 */

export const LOOT_TABLES = {
  // ── Undead ──────────────────────────────────────────────────────────────

  zombie: [
    { type: 'currency', currency: 'copper', chance: 0.3, amount: '1d6' },
    { type: 'item',     itemId: 'torch',              chance: 0.1, quantity: 1 },
  ],

  skeleton: [
    { type: 'item',     itemId: 'scimitar',            chance: 0.25, quantity: 1 },
    { type: 'currency', currency: 'copper', chance: 0.5, amount: '2d4' },
  ],

  ghoul: [
    { type: 'currency', currency: 'silver', chance: 0.4, amount: '1d6' },
    { type: 'currency', currency: 'gold',   chance: 0.15, amount: '1d4' },
  ],

  ghast: [
    { type: 'currency', currency: 'silver', chance: 0.5,  amount: '2d6' },
    { type: 'currency', currency: 'gold',   chance: 0.3,  amount: '1d6' },
    { type: 'item',     itemId: 'potion_healing',      chance: 0.1, quantity: 1 },
  ],

  // ── Humanoids ───────────────────────────────────────────────────────────

  bandit: [
    { type: 'item',     itemId: 'scimitar',             chance: 0.3,  quantity: 1 },
    { type: 'currency', currency: 'copper', chance: 0.8, amount: '2d6' },
    { type: 'currency', currency: 'silver', chance: 0.4, amount: '1d4' },
  ],

  bandit_captain: [
    { type: 'item',     itemId: 'scimitar',             chance: 0.5,  quantity: 1 },
    { type: 'item',     itemId: 'leather_armor',        chance: 0.3,  quantity: 1 },
    { type: 'item',     itemId: 'potion_healing',       chance: 0.25, quantity: 1 },
    { type: 'currency', currency: 'gold',   chance: 0.8, amount: '2d6' },
    { type: 'currency', currency: 'silver', chance: 0.6, amount: '3d6' },
  ],

  cult_fanatic: [
    { type: 'item',     itemId: 'potion_healing',       chance: 0.2,  quantity: 1 },
    { type: 'currency', currency: 'gold',   chance: 0.5, amount: '1d6' },
    { type: 'currency', currency: 'silver', chance: 0.7, amount: '2d6' },
  ],

  // ── Monsters ────────────────────────────────────────────────────────────

  werewolf: [
    { type: 'currency', currency: 'gold',   chance: 0.6, amount: '2d6' },
    { type: 'item',     itemId: 'potion_healing',       chance: 0.15, quantity: 1 },
  ],

  ogre: [
    { type: 'item',     itemId: 'greataxe',             chance: 0.2,  quantity: 1 },
    { type: 'currency', currency: 'gold',   chance: 0.5, amount: '1d6' },
    { type: 'currency', currency: 'copper', chance: 0.8, amount: '3d6' },
    { type: 'item',     itemId: 'rope_hempen',          chance: 0.1,  quantity: 1 },
  ],

  // ── Giants ──────────────────────────────────────────────────────────────

  hill_giant: [
    { type: 'currency', currency: 'gold',   chance: 0.7, amount: '3d6' },
    { type: 'item',     itemId: 'potion_healing_greater', chance: 0.15, quantity: 1 },
    { type: 'item',     itemId: 'chain_mail',           chance: 0.1,  quantity: 1 },
  ],

  frost_giant: [
    { type: 'currency', currency: 'gold',   chance: 0.8, amount: '4d6' },
    { type: 'currency', currency: 'silver', chance: 0.6, amount: '3d6' },
    { type: 'item',     itemId: 'greataxe',             chance: 0.3,  quantity: 1 },
    { type: 'item',     itemId: 'potion_healing_greater', chance: 0.2, quantity: 1 },
  ],

  // ── Casters ─────────────────────────────────────────────────────────────

  mage: [
    { type: 'item',     itemId: 'potion_healing',       chance: 0.3,  quantity: 1 },
    { type: 'currency', currency: 'gold',   chance: 0.7, amount: '3d6' },
  ],

  archmage: [
    { type: 'item',     itemId: 'potion_healing_greater', chance: 0.4, quantity: 1 },
    { type: 'currency', currency: 'gold',   chance: 0.9, amount: '6d6' },
  ],

  // ── Boss ────────────────────────────────────────────────────────────────

  young_red_dragon: [
    { type: 'currency', currency: 'gold',     chance: 1.0, amount: '10d10' },
    { type: 'currency', currency: 'silver',   chance: 0.8, amount: '6d10' },
    { type: 'item',     itemId: 'potion_healing_greater', chance: 0.5, quantity: '1d2' },
    { type: 'item',     itemId: 'chain_mail',             chance: 0.3, quantity: 1 },
  ],

  lich: [
    { type: 'currency', currency: 'gold',     chance: 1.0, amount: '12d10' },
    { type: 'item',     itemId: 'potion_healing_greater', chance: 0.6, quantity: '1d3' },
  ],
};

export function getLootTable(templateKey) {
  return LOOT_TABLES[templateKey] || [];
}

export function hasLootTable(templateKey) {
  return templateKey in LOOT_TABLES;
}

export function getAllLootTableKeys() {
  return Object.keys(LOOT_TABLES);
}
