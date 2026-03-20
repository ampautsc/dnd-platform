import { useCallback, useState } from 'react'
import {
  createBattleMap,
  createEntity,
  createHexData,
  setHex,
  upsertEntity,
  moveEntity as _moveEntity,
  removeEntity as _removeEntity,
} from './battleMapSchema.js'
import {
  saveBattleMap,
  loadBattleMap,
  listBattleMaps,
  deleteBattleMap,
} from './battleMapService.js'

/**
 * useBattleMap — all battlefield state and mutations.
 * The map object is always a plain serializable BattleMap.
 * The canvas receives map.hexes and map.entities as props.
 */
export function useBattleMap(initial = null) {
  const [map, setMap] = useState(() => initial ?? createBattleMap())

  // --- Hex mutations ---

  const setTerrain = useCallback((q, r, terrain) => {
    setMap(prev => setHex(prev, q, r, { terrain }))
  }, [])

  const setElevation = useCallback((q, r, elevation) => {
    setMap(prev => setHex(prev, q, r, { elevation }))
  }, [])

  const setHexData = useCallback((q, r, patch) => {
    setMap(prev => setHex(prev, q, r, patch))
  }, [])

  const resetHex = useCallback((q, r) => {
    setMap(prev => {
      const hexes = { ...prev.hexes }
      delete hexes[`${q},${r}`]
      return { ...prev, hexes }
    })
  }, [])

  // --- Entity mutations ---

  const placeEntity = useCallback((entityData) => {
    const entity = createEntity(entityData)
    setMap(prev => upsertEntity(prev, entity))
    return entity
  }, [])

  const updateEntity = useCallback((id, patch) => {
    setMap(prev => ({
      ...prev,
      entities: prev.entities.map(e => e.id === id ? { ...e, ...patch } : e),
    }))
  }, [])

  const moveEntity = useCallback((id, q, r) => {
    setMap(prev => _moveEntity(prev, id, q, r))
  }, [])

  const removeEntity = useCallback((id) => {
    setMap(prev => _removeEntity(prev, id))
  }, [])

  /** Clear all entities from the map — used when loading a new encounter. */
  const clearEntities = useCallback(() => {
    setMap(prev => ({ ...prev, entities: [] }))
  }, [])

  // --- Persistence ---

  const save = useCallback(() => {
    setMap(prev => {
      const saved = saveBattleMap(prev)
      return saved
    })
  }, [])

  const load = useCallback((id) => {
    const loaded = loadBattleMap(id)
    if (loaded) setMap(loaded)
    return loaded
  }, [])

  const newMap = useCallback((opts = {}) => {
    setMap(createBattleMap(opts))
  }, [])

  const del = useCallback((id) => {
    deleteBattleMap(id)
  }, [])

  return {
    map,
    // hex
    setTerrain,
    setElevation,
    setHexData,
    resetHex,
    // entity
    placeEntity,
    updateEntity,
    moveEntity,
    removeEntity,
    clearEntities,
    // persistence
    save,
    load,
    newMap,
    deleteBattleMap: del,
    listBattleMaps,
  }
}
