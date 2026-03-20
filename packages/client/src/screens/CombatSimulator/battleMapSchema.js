/**
 * BattleMap — serializable battlefield data.
 * Everything the renderer needs lives here. Storage-agnostic.
 *
 * HexData key format: "q,r"
 *
 * Terrain types:
 *   open | difficult | sand | mud | rubble
 *   wall | pillar | tree
 *   water_shallow | water_deep | lava
 *   pit | void | hazard
 *
 * Entity sides:  player | ally | enemy | neutral
 * Entity sizes:  tiny | small | medium | large | huge | gargantuan
 */

export const TERRAIN_TYPES = [
  'open', 'difficult', 'sand', 'mud', 'rubble',
  'wall', 'pillar', 'tree',
  'water_shallow', 'water_deep', 'lava',
  'pit', 'void', 'hazard',
]

/** Visual fill colors for each terrain type */
export const TERRAIN_COLOR = {
  open:          '#2a2010',
  difficult:     '#3a2e18',
  sand:          '#4a3c1e',
  mud:           '#2e2416',
  rubble:        '#302820',
  wall:          '#1e1c1a',
  pillar:        '#252220',
  tree:          '#1a2e14',
  water_shallow: '#12263a',
  water_deep:    '#0a1828',
  lava:          '#3a1408',
  pit:           '#0a0808',
  void:          '#060606',
  hazard:        '#3a2208',
}

/** Stroke colors */
export const TERRAIN_STROKE = {
  open:          '#4a3a20',
  difficult:     '#5a4a28',
  sand:          '#6a5a30',
  mud:           '#3e3020',
  rubble:        '#504030',
  wall:          '#3a3835',
  pillar:        '#3a3835',
  tree:          '#2a4820',
  water_shallow: '#1a4060',
  water_deep:    '#0e2840',
  lava:          '#a03010',
  pit:           '#1a1010',
  void:          '#000000',
  hazard:        '#804010',
}

/**
 * A single hex cell's non-default data.
 * Only stored in the map when different from defaults.
 */
export function createHexData({
  terrain = 'open',
  elevation = 0,
  effects = [],   // ['fire', 'darkness', 'difficult_terrain', ...]
  objects = [],   // ['barrel', 'crate', 'altar', ...]
} = {}) {
  return { terrain, elevation, effects, objects }
}

/**
 * An entity (creature, player, object) on the battlefield.
 */
export function createEntity({
  id,
  name = 'Unknown',
  q = 0,
  r = 0,
  side = 'neutral',   // player | ally | enemy | neutral
  type = 'creature',  // creature | object | hazard
  size = 'medium',    // tiny | small | medium | large | huge | gargantuan
  hp = 10,
  maxHp = 10,
  ac = 10,
  portraitUrl = null,
  conditions = [],    // ['prone', 'poisoned', 'stunned', ...]
  elevation = 0,
  data = {},          // arbitrary extra data (class, stats, etc.)
} = {}) {
  if (!id) throw new Error('createEntity requires id')
  return { id, name, q, r, side, type, size, hp, maxHp, ac, portraitUrl, conditions, elevation, data }
}

/**
 * The root BattleMap document.
 */
export function createBattleMap({
  id = crypto.randomUUID(),
  name = 'New Battlefield',
  radius = 64,
  hexes = {},     // sparse: "q,r" -> HexData (only non-default hexes stored)
  entities = [],  // Entity[]
  meta = {},      // arbitrary extra info: lighting, weather, notes, etc.
} = {}) {
  return {
    id,
    name,
    radius,
    hexes,
    entities,
    meta,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
  }
}

/** Helper to get hex key */
export const hexKey = (q, r) => `${q},${r}`

/** Helper to get hex data with defaults */
export function getHex(map, q, r) {
  return map.hexes[hexKey(q, r)] ?? createHexData()
}

/** Return a new map with one hex mutated (immutable update) */
export function setHex(map, q, r, patch) {
  const existing = getHex(map, q, r)
  const updated = { ...existing, ...patch }
  return {
    ...map,
    modified: new Date().toISOString(),
    hexes: { ...map.hexes, [hexKey(q, r)]: updated },
  }
}

/** Return a new map with one entity upserted by id */
export function upsertEntity(map, entity) {
  const others = map.entities.filter(e => e.id !== entity.id)
  return {
    ...map,
    modified: new Date().toISOString(),
    entities: [...others, entity],
  }
}

/** Return a new map with entity moved */
export function moveEntity(map, id, q, r) {
  return {
    ...map,
    modified: new Date().toISOString(),
    entities: map.entities.map(e => e.id === id ? { ...e, q, r } : e),
  }
}

/** Return a new map with entity removed */
export function removeEntity(map, id) {
  return {
    ...map,
    modified: new Date().toISOString(),
    entities: map.entities.filter(e => e.id !== id),
  }
}
