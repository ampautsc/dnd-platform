/**
 * NPC Personalities — registry of all NPC personality/consciousness data.
 *
 * Each NPC is a JSON file in ./data/ with rich personality, knowledge,
 * relationships, consciousness context, and conversation persona data.
 *
 * Usage:
 *   import { getNpc, getAllNpcKeys } from '@dnd-platform/content/npcs'
 *   const bree = getNpc('bree_millhaven')
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, 'data')

/** Load a single NPC JSON from the data directory. */
function loadNpc(filename) {
  const raw = readFileSync(join(dataDir, `${filename}.json`), 'utf-8')
  return JSON.parse(raw)
}

// ─── NPC Files ──────────────────────────────────────────────────────────────

const NPC_FILES = [
  'aldovar_crennick',
  'archmage',
  'bandit',
  'bree_millhaven',
  'brennan_holt',
  'brother_aldwin',
  'captain_edric_vane',
  'cult_fanatic',
  'davan_merchant',
  'dolly_thurn',
  'fen_colby',
  'floris_embrich',
  'goblin',
  'hodge_fence',
  'knight',
  'lell_sparrow',
  'lich',
  'mira_barrelbottom',
  'old_mattock',
  'oma_steadwick',
  'orc',
  'pip_apprentice',
  'sera_dunwick',
  'skeleton',
  'torval_grimm',
  'tuck_millhaven',
  'vesna_calloway',
  'widow_marsh',
  'wolf',
  'wren_stable',
  'young_red_dragon',
  'zombie',
  'heinz_mad_artificer',
  'perry_the_platypus_agent',
  'vanessa_the_reluctant',
  'phineas_the_builder',
  'ferb_the_silent',
  'garnet_the_fused',
  'steven_the_shield',
  'pearl_the_perfectionist',
  'amethyst_the_wildcard',
  'sherlock_the_inquisitor',
  'watson_the_medic',
  'moriarty_the_spider',
  'adler_the_enigma',
  'aang_the_wind_monk',
  'zuko_the_exiled',
  'iroh_the_dragon',
  'toph_the_blind_bandit',
  'azula_the_prodigy',
  'sokka_the_tactician',
  'katara_the_healer',
  'bruce_the_dark_knight',
  'joker_the_clown',
  'harley_the_acrobat',
  'gordon_the_commissioner',
  'riddler_the_enigmator',
  'bob_the_porous',
  'squid_the_cynic',
  'krabs_the_miser',
  'plankton_the_micro',
  'pat_the_star',
  'michael_the_manager',
  'dwight_the_assistant',
  'jim_the_prankster',
  'frodo_the_bearer',
  'sam_the_loyal',
  'gollum_the_corrupted',
  'sauron_the_dark_lord',
  'gandalf_the_grey',
  'aragorn_the_strider',
  'walt_the_alchemist',
  'jesse_the_apprentice',
  'gus_the_chicken_man',
  'saul_the_barrister',
  'mike_the_cleaner',
  'shaggy_the_coward',
  'velma_the_sage',
  'scooby_the_hound',
  'fred_the_trapper',
  'vader_the_black_knight',
  'palpatine_the_emperor',
  'han_the_smuggler',
  'luke_the_farm_boy',
  'yoda_the_ancient',
  'tony_the_iron_artificer',
  'steve_the_captain',
  'thor_the_thunderer',
  'loki_the_trickster',
  'thanos_the_mad_titan',
  'harry_the_survivor',
  'voldemort_the_dark_lord',
  'snape_the_potions_master',
  'hermione_the_bookworm',
  'bowser_the_turtle_king',
  'mario_the_plumber',
  'luigi_the_cowardly_brother',
  'jack_the_sparrow',
  'barbossa_the_mutineer',
  'davy_the_cursed',
  'logan_the_wolverine',
  'charles_the_telepath',
  'erik_the_magnet',
  'neo_the_one',
  'morpheus_the_guide',
  'smith_the_agent',
  'tyrion_the_imp',
  'cersei_the_queen',
  'jon_the_bastard',
  'daenerys_the_dragon_queen',
  'maleficent_the_fey',
  'hades_the_god',
  'ursula_the_sea_witch',
  'scar_the_usurper',
  'leslie_the_optimist',
  'ron_the_libertarian',
  'tom_the_entrepreneur',
  'eleven_the_experiment',
  'hopper_the_chief',
  'finn_the_hero',
  'jake_the_dog',
  'ice_king_the_tragic',
  'marceline_the_vampire',
  'the_doctor_the_timelord',
  'the_master_the_rival',
  'fry_the_delivery_boy',
  'leela_the_captain',
  'bender_the_robot',
  'leo_the_leader',
  'raph_the_rebel',
  'mikey_the_party',
  'donnie_the_brain',
  'splinter_the_master',
  'shredder_the_foe',
  'link_the_silent',
  'zelda_the_princess',
  'ganon_the_calamity',
  'homer_the_glutton',
  'marge_the_enabler',
  'bart_the_menace',
  'burns_the_ancient',
  'smithers_the_sycophant',
  'gomez_the_passionate',
  'morticia_the_goth',
  'wednesday_the_morbid',
  'jerry_the_observer',
  'george_the_neurotic',
  'kramer_the_chaos',
  'elaine_the_vengeful',
  'kermit_the_stressed',
  'piggy_the_diva',
  'gonzo_the_weirdo',
  'animal_the_wild',
  'pooh_the_hungry',
  'piglet_the_anxious',
  'eeyore_the_depressed',
  'tigger_the_bouncy',
  'hammond_the_dreamer',
  'malcolm_the_chaos',
  'grant_the_skeptic',
  'sam_malone',
  'woody_boyd',
  'norm_peterson',
  'cliff_clavin',
  'carla_tortelli',
  'frasier_crane',
  'harry_the_hat',
  'rebecca_howe',
]

// ─── Registry ───────────────────────────────────────────────────────────────

/** All NPC personalities keyed by templateKey. */
export const NPC_PERSONALITIES = {}

for (const file of NPC_FILES) {
  const npc = loadNpc(file)
  NPC_PERSONALITIES[npc.templateKey] = npc
}

// ─── Lookup Helpers ─────────────────────────────────────────────────────────

/** Get an NPC personality by templateKey. */
export function getNpc(key) {
  return NPC_PERSONALITIES[key]
}

/** Check if an NPC exists in the registry. */
export function hasNpc(key) {
  return key in NPC_PERSONALITIES
}

/** Return all registered NPC templateKeys. */
export function getAllNpcKeys() {
  return Object.keys(NPC_PERSONALITIES)
}

/** Return all NPCs matching a given npcType (e.g. 'friendly', 'monster'). */
export function getNpcsByType(type) {
  return Object.values(NPC_PERSONALITIES).filter(n => n.npcType === type)
}
