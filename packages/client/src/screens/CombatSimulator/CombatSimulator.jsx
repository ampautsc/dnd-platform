/**
 * CombatViewer � Main combat page.
 *
 * Thin UI orchestrator � delegates all combat logic to server via useCombatSession,
 * all dice animation to useDiceAnimation, and all rendering to child components.
 *
 * Interaction modes:
 *   'idle'     � default, no pending interaction
 *   'move'     � selecting a hex to move to (green overlay)
 *   'target'   � selecting a target creature for a single-target action
 *   'aoe'      � placing an AoE center on the map (highlighted radius)
 *   'editor'   � map editor mode
 */
import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import CombatHexCanvas from "./CombatHexCanvas"
import CombatHud from "./hud/CombatHud"
import EncounterModal from "./hud/EncounterModal"
import DiceRollBar from "./hud/DiceRollBar"
import DiceArena from "./DiceArena"
import { useBattleMap } from "./useBattleMap.js"
import { useCombatSession } from "./useCombatSession.js"
import { useDiceAnimation } from "./useDiceAnimation.js"
import { hexDistance, hexesInRange, hexesInCone, scatterPositions } from "./hexUtils.js"
import { TERRAIN_TYPES } from "./battleMapSchema.js"
import { MOCK_HUD_DATA } from "./hudMockData.js"
import { ENCOUNTERS, CREATURE_DISPLAY, getEncounterById } from "./encounters.js"

const MAP_RADIUS = 64   // must match RADIUS in CombatHexCanvas

export function CombatSimulator({ onLeave }) {
  const { map, setTerrain, placeEntity, moveEntity, clearEntities, save, load, listBattleMaps } = useBattleMap()

  // -- Server-driven combat session -----------------------------------------
  const combat = useCombatSession()
  const dice = useDiceAnimation()

  // -- Lock body scroll and reset margins when combat sim is active
  useEffect(() => {
    const origBodyMargin = document.body.style.margin
    const origBodyPadding = document.body.style.padding
    const origBodyOverflow = document.body.style.overflow
    const origBodyHeight = document.body.style.height
    const origHtmlOverflow = document.documentElement.style.overflow
    const origHtmlHeight = document.documentElement.style.height

    document.body.style.margin = '0'
    document.body.style.padding = '0'
    document.body.style.overflow = 'hidden'
    document.body.style.height = '100%'
    document.documentElement.style.overflow = 'hidden'
    document.documentElement.style.height = '100%'

    return () => {
      document.body.style.margin = origBodyMargin
      document.body.style.padding = origBodyPadding
      document.body.style.overflow = origBodyOverflow
      document.body.style.height = origBodyHeight
      document.documentElement.style.overflow = origHtmlOverflow
      document.documentElement.style.height = origHtmlHeight
    }
  }, [])

  // -- Local UI state -------------------------------------------------------
  const [brush, setBrush]         = useState("open")
  const [tool, setTool]           = useState("terrain")
  const [editorMode, setEditorMode] = useState(false)

  /**
   * Interaction mode state machine:
   *   'idle' | 'move' | 'target' | 'aoe' | 'beastForm' | 'editor'
   */
  const [interactionMode, setInteractionMode] = useState('idle')

  /**
   * Pending action � set when the player clicks an action that needs a target or AoE placement.
   * Contains the server menu option that was selected, waiting for map interaction to complete.
   * @type {{ optionId: string, label: string, needsTarget?: boolean, needsAoe?: boolean, aoeRadius?: number }|null}
   */
  const [pendingAction, setPendingAction] = useState(null)

  /**
   * Pending target ID � set when a beast-form selection is needed after target pick.
   * @type {string|null}
   */
  const [pendingTargetId, setPendingTargetId] = useState(null)

  /**
   * Available beast forms for the current Polymorph target.
   * @type {Array<{name: string, cr: number, maxHP: number, ac: number, weapons: Array}>|null}
   */
  const [availableBeastForms, setAvailableBeastForms] = useState(null)

  /**
   * AoE preview hexes � computed when in 'aoe' mode as the cursor hovers.
   * @type {Set<string>|null}
   */
  const [aoePreviewKeys, setAoePreviewKeys] = useState(null)

  /**
   * Target-eligible entity IDs � computed when entering 'target' mode.
   * @type {Set<string>|null}
   */
  const [validTargetIds, setValidTargetIds] = useState(null)

  /** Whether the encounter selection modal is open. */
  const [showEncounterModal, setShowEncounterModal] = useState(false)
  const [pendingDiceRoll, setPendingDiceRoll] = useState(null)
  const [pendingFreeRoll, setPendingFreeRoll] = useState(null) // { notation: '1d20' }
  const diceConfirmingRef = useRef(false)

  // -- Load Encounter � reusable for both init and user selection ----------

  /**
   * Load an encounter definition onto the map and create a server combat session.
   * Clears existing entities, places the player + all foes, builds the AI profile
   * map, and sends everything to the server.
   *
   * @param {import('./encounters.js').Encounter} encounter
   * @param {{ skipConfirm?: boolean }} opts
   */
  const doLoadEncounter = useCallback(async (encounter, opts = {}) => {
    // If a session is active, confirm replacement (unless skipped for initial load)
    if (!opts.skipConfirm && combat.sessionId) {
      const ok = window.confirm(
        `Replace current encounter with "${encounter.name}"?`
      )
      if (!ok) return
    }

    // Tear down existing session
    try { await combat.destroySession() } catch (_e) { /* ignore */ }

    // Reset UI state
    setInteractionMode('idle')
    setPendingAction(null)
    setAoePreviewKeys(null)
    setValidTargetIds(null)
    setPendingTargetId(null)
    setAvailableBeastForms(null)
    setShowEncounterModal(false)

    // Clear map and place the player at origin
    clearEntities()
    const ac = MOCK_HUD_DATA.activeCharacter
    placeEntity({
      id: ac.id, name: ac.name, q: 0, r: 0, side: 'player',
      hp: ac.hp, maxHp: ac.maxHp, ac: ac.ac, portraitUrl: ac.portraitUrl,
      data: { speed: ac.speed ?? 30 },
    })

    // Build foe entities + combatant list + AI profile map
    const combatants = [
      {
        templateKey: 'gem_dragonborn_lore_bard_8',
        id: ac.id, name: ac.name, side: 'player',
        position: { q: 0, r: 0 },
        speed: ac.speed ?? 30,
        overrides: { dexMod: 100 },
      },
    ]
    const profileMap = {}
    const occupied = new Set(['0,0']) // player position

    let foeIdx = 1
    for (const foeGroup of encounter.foes) {
      const display = CREATURE_DISPLAY[foeGroup.templateKey] || {
        name: foeGroup.templateKey, hp: 10, maxHp: 10, ac: 10, speed: 30, portraitUrl: null,
      }

      // Resolve positions: use pre-set if defined, scatter the rest
      const presetCount = foeGroup.positions?.length ?? 0
      const scatterCount = foeGroup.count - presetCount
      const scattered = scatterCount > 0
        ? scatterPositions(scatterCount, { q: 0, r: 0 }, 6, 10, MAP_RADIUS, 2, occupied)
        : []

      for (let i = 0; i < foeGroup.count; i++) {
        const foeId = `${foeGroup.templateKey}-${foeIdx}`
        foeIdx++

        // Position: prefer pre-set, fall back to scattered
        let pos
        if (i < presetCount) {
          pos = foeGroup.positions[i]
        } else {
          pos = scattered[i - presetCount] || { q: 5 + foeIdx, r: -foeIdx }
        }
        occupied.add(`${pos.q},${pos.r}`)

        // Place map entity
        placeEntity({
          id: foeId,
          name: display.name,
          q: pos.q, r: pos.r,
          side: 'enemy',
          hp: display.hp,
          maxHp: display.maxHp,
          ac: display.ac,
          portraitUrl: display.portraitUrl,
          data: { speed: display.speed },
        })

        // Server combatant
        combatants.push({
          templateKey: foeGroup.templateKey,
          id: foeId,
          name: display.name,
          side: 'enemy',
          position: { q: pos.q, r: pos.r },
          speed: display.speed,
        })

        profileMap[foeId] = foeGroup.aiProfile
      }
    }

    // Support deterministic test dice queues via URL param
    const _queueStr = new URLSearchParams(window.location.search).get('testDiceQueue')
    const _testConfig = _queueStr ? { diceQueue: _queueStr.split(',').map(Number) } : undefined

    const sessionConfig = {
      combatants,
      explorationMode: encounter.explorationMode ?? false,
      aiConfig: { profileMap },
      ...(_testConfig ? { testConfig: _testConfig } : {}),
    }

    try {
      await combat.createSession(sessionConfig)
    } catch (err) {
      // One retry for transient startup/proxy races (seen in E2E boot)
      console.error('[CombatViewer] Failed to create session (attempt 1):', err)
      await new Promise(resolve => setTimeout(resolve, 150))
      try {
        await combat.createSession(sessionConfig)
      } catch (retryErr) {
        console.error('[CombatViewer] Failed to create session (attempt 2):', retryErr)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combat, clearEntities, placeEntity])

  // -- Initialize with default encounter on mount --------------------------
  useEffect(() => {
    // Default: load the easy patrol encounter
    const defaultEncounter = getEncounterById('undead-duel') || ENCOUNTERS[0]
    doLoadEncounter(defaultEncounter, { skipConfirm: true })

    return () => { combat.destroySession() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // -- Cancel interaction mode when active combatant changes ---------------
  useEffect(() => {
    setInteractionMode('idle')
    setPendingAction(null)
    setAoePreviewKeys(null)
    setValidTargetIds(null)
    setPendingTargetId(null)
    setAvailableBeastForms(null)
    setPendingDiceRoll(null)
  }, [combat.activeId])

  // -- Sync server state changes back to map entities (HP + position + polymorph) --
  useEffect(() => {
    if (!combat.gameState?.combatants) return
    for (const c of combat.gameState.combatants) {
      const ent = map.entities.find(e => e.id === c.id)
      if (!ent) continue

      // Server serializes as currentHP/maxHP; map entities use hp/maxHp
      const serverHp = c.currentHP ?? c.hp
      const serverMaxHp = c.maxHP ?? c.maxHp
      const hpChanged = ent.hp !== serverHp || ent.maxHp !== serverMaxHp

      // Position: server state is authoritative after forced movement, dash, etc.
      const serverQ = c.position?.q
      const serverR = c.position?.r
      const posChanged = serverQ != null && (ent.q !== serverQ || ent.r !== serverR)

      // Polymorph: swap portrait to beast token when polymorphed, restore when reverted
      const beastName = c.polymorphedAs || null
      const beastPortrait = beastName
        ? `/portraits/v2/beasts/${beastName.replace(/\s+/g, '-').toLowerCase()}.png`
        : null
      const currentPolymorphPortrait = ent.polymorphPortrait || null
      const polymorphChanged = beastPortrait !== currentPolymorphPortrait

      if (hpChanged || posChanged || polymorphChanged) {
        placeEntity({
          ...ent,
          hp: serverHp,
          maxHp: serverMaxHp,
          ...(posChanged ? { q: serverQ, r: serverR } : {}),
          // Swap portrait: use beast portrait when polymorphed, restore original when reverted
          ...(polymorphChanged ? {
            portraitUrl: beastPortrait || ent.originalPortraitUrl || ent.portraitUrl,
            polymorphPortrait: beastPortrait,
            // Save original portrait on first polymorph so we can restore it
            ...(beastPortrait && !ent.originalPortraitUrl ? { originalPortraitUrl: ent.portraitUrl } : {}),
          } : {}),
        })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combat.gameState])

  // -- Reachable hex keys for movement overlay -----------------------------
  const reachableHexKeys = useMemo(() => {
    if (interactionMode !== 'move' || !combat.activeId) return null
    const mover = map.entities.find(e => e.id === combat.activeId)
    if (!mover) return null
    // Use server state for movement budget if available
    const serverCreature = combat.gameState?.combatants?.find(c => c.id === combat.activeId)
    const movementLeft = serverCreature?.movementRemaining ?? (mover.data?.speed ?? 30)
    if (movementLeft <= 0) return null
    const hexCount = Math.floor(movementLeft / 5)
    return hexesInRange({ q: mover.q, r: mover.r }, hexCount, MAP_RADIUS)
  }, [interactionMode, combat.activeId, combat.gameState, map.entities])

  // -- Movement toggle ----------------------------------------------------
  const handleMoveClick = useCallback(() => {
    if (interactionMode === 'move') {
      setInteractionMode('idle')
    } else {
      setInteractionMode('move')
      setPendingAction(null)
    }
  }, [interactionMode])

  // -- End Turn -----------------------------------------------------------
  const handleEndTurn = useCallback(async () => {
    setInteractionMode('idle')
    setPendingAction(null)
    try {
      await combat.endTurn()
    } catch (err) {
      console.error('[CombatViewer] End turn failed:', err)
    }
  }, [combat])

  // -- Action dispatch from HUD -------------------------------------------
  /**
   * Called when a toolbar button or flyout item is clicked.
   * For actions that need targeting, enters target/aoe mode.
   * For self-only actions (dash, dodge, etc.), submits immediately.
   */
  const handleAction = useCallback(async (actionType, data) => {
    if (!combat.activeId || combat.isResolving) return

    // Map the UI action type to a server menu optionId.
    const menuOption = findMenuOption(combat.menu, actionType, data)
    if (!menuOption) {
      console.warn(`[CombatViewer] No menu option for ${actionType}`, data)
      return
    }

    // Attack options from server already have targetId baked in � submit directly.
    if (menuOption.targetId) {
      await resolveAction(menuOption.optionId, { targetId: menuOption.targetId })
      return
    }

    // Explicit needsTarget flag (future server support)
    if (menuOption.needsTarget) {
      setInteractionMode('target')
      setPendingAction(menuOption)
      const targets = computeValidTargets(menuOption, combat.activeId, map.entities)
      setValidTargetIds(targets)
      return
    }

    // Spell/feature with known validTargets list � enter target selection mode.
    if ((menuOption.targetType === 'single' || menuOption.targetType === 'enemy') &&
        menuOption.validTargets?.length > 0) {
      const targetIds = new Set(menuOption.validTargets.map(t => t.id))
      setInteractionMode('target')
      setPendingAction(menuOption)
      setValidTargetIds(targetIds)
      return
    }

    // AoE placement � handles 'area' (TurnMenu) and legacy 'aoe' / needsAoe / requiresPosition flags
    if (menuOption.needsAoe || menuOption.requiresPosition ||
        menuOption.targetType === 'aoe' || menuOption.targetType === 'area') {
      setInteractionMode('aoe')
      setPendingAction(menuOption)
      return
    }

    // Dash: spend the action then immediately enter move mode for bonus movement
    if (actionType === 'dash') {
      await resolveAction(menuOption.optionId, {})
      setInteractionMode('move')
      return
    }

    // Self-only / no-target action � submit immediately
    await resolveAction(menuOption.optionId, {})
  }, [combat.activeId, combat.isResolving, combat.menu, map.entities])

  // -- Resolve: submit choice to server and animate dice ------------------
  const resolveAction = useCallback(async (optionId, extras) => {
    setInteractionMode('idle')
    setPendingAction(null)
    setAoePreviewKeys(null)
    setValidTargetIds(null)
    setPendingTargetId(null)
    setAvailableBeastForms(null)

    const choice = { optionId, ...extras }

    try {
      const rollRequest = await combat.requestRolls(choice)
      if (!rollRequest.rollRequests || rollRequest.rollRequests.length === 0) {
        dice.setAwaiting()
        const result = await combat.submitChoice(choice)
        if (result.rolls && result.rolls.length > 0) {
          dice.queueRolls(result.rolls)
        } else {
          dice.reset()
        }
        return
      }
      setPendingDiceRoll({
        choice,
        rollRequests: rollRequest.rollRequests || [],
        commitment: rollRequest.commitment,
      })
      dice.setAwaitingInput(rollRequest.rollRequests || [])
    } catch (err) {
      console.error('[CombatViewer] Action resolution failed:', err)
      dice.reset()
    }
  }, [combat, dice])

  const handleDiceSeedReady = useCallback(async (clientSeed) => {
    if (!pendingDiceRoll || diceConfirmingRef.current) return
    setPendingDiceRoll(null)
    diceConfirmingRef.current = true
    try {
      dice.setAwaiting()
      const result = await combat.confirmRolls(clientSeed)
      if (result.rolls && result.rolls.length > 0) {
        dice.queueRolls(result.rolls, () => {
          dice.clearRequestedRolls()
        })
      } else {
        dice.reset()
      }
    } catch (err) {
      console.error('[CombatViewer] confirmRolls failed:', err)
      dice.reset()
    } finally {
      diceConfirmingRef.current = false
    }
  }, [combat, dice, pendingDiceRoll])

  const handleDiceArenaCancel = useCallback(() => {
    setPendingDiceRoll(null)
    diceConfirmingRef.current = false
    dice.reset()
  }, [dice])

  // Fallback: This used to auto-confirm after 120ms, bypassing the whole 3D experience.
  // We removed the auto-timeout so the user MUST click the DiceArena to proceed.
  // If we want a keyboard fallback, it should listen for an 'Enter'/'Space' event instead.
  // useEffect(() => {
  //   if (!pendingDiceRoll) return undefined
  //   const timer = setTimeout(() => {
  //     handleDiceSeedReady(String(Date.now()))
  //   }, 120)
  //   return () => clearTimeout(timer)
  // }, [pendingDiceRoll, handleDiceSeedReady])

  // -- Beast form selection (Polymorph) -----------------------------------
  const handleBeastFormSelect = useCallback(async (beastFormName) => {
    if (!pendingAction || !pendingTargetId) return
    await resolveAction(pendingAction.optionId, {
      targetId: pendingTargetId,
      beastFormName,
    })
  }, [pendingAction, pendingTargetId, resolveAction])

  // -- Free dice roll � opens DiceArena for 3D physics ---------------------
  const handleFreeRoll = useCallback((notation) => {
    if (!combat.sessionId) return
    // Open DiceArena with this die type
    setPendingFreeRoll({ notation, purpose: 'free' })
  }, [combat.sessionId])

  // -- Free roll resolution � called after DiceArena physics finish -------
  const handleFreeRollSeedReady = useCallback(async (clientSeed) => {
    if (!pendingFreeRoll) return
    const notation = pendingFreeRoll.notation
    setPendingFreeRoll(null)
    try {
      const result = await combat.rollFree(notation)
      dice.rollFree({
        purpose: 'free',
        notation: result.notation,
        values: result.values,
        modifier: result.modifier,
        total: result.total,
      })
    } catch (err) {
      console.error('[CombatViewer] Free roll failed:', err)
    }
  }, [combat, dice, pendingFreeRoll])

  // -- Hex click handler � dispatches based on interaction mode ------------
  function handleHexClick(q, r) {
    switch (interactionMode) {
      // -- Move mode ----------------------------------------------
      case 'move': {
        if (!combat.activeId) return
        const key = `${q},${r}`
        if (reachableHexKeys && reachableHexKeys.has(key)) {
          const mover = map.entities.find(e => e.id === combat.activeId)
          if (mover) {
            // Use the server's actual move-to optionId from the menu
            const moveOpt = combat.menu?.movements?.find(o => o.type === 'move')
            const moveOptId = moveOpt?.optionId ?? 'move-to'
            moveEntity(combat.activeId, q, r)
            resolveAction(moveOptId, { position: { q, r } })
          }
        }
        return
      }

      // -- Target selection ---------------------------------------
      case 'target': {
        if (!pendingAction) return
        const entity = map.entities.find(e => e.q === q && e.r === r)
        if (entity && validTargetIds?.has(entity.id)) {
          // If this spell needs a beast form selection, enter beastForm mode
          if (pendingAction.needsBeastForm) {
            const targetEntry = (pendingAction.validTargets || []).find(t => t.id === entity.id)
            const forms = targetEntry?.beastForms || []
            if (forms.length > 0) {
              setPendingTargetId(entity.id)
              setAvailableBeastForms(forms)
              setInteractionMode('beastForm')
              setValidTargetIds(null)
              return
            }
          }
          resolveAction(pendingAction.optionId, { targetId: entity.id })
        }
        // Click on empty hex or invalid target � stay in target mode
        return
      }

      // -- AoE placement -----------------------------------------
      case 'aoe': {
        if (!pendingAction) return
        // Place AoE centered on clicked hex
        resolveAction(pendingAction.optionId, { aoeCenter: { q, r } })
        return
      }

      // -- Editor mode -------------------------------------------
      default: {
        if (!editorMode) return
        if (tool === "terrain") {
          setTerrain(q, r, brush)
        } else if (tool === "entity") {
          placeEntity({ id: crypto.randomUUID(), name: "Hero", q, r, side: "player", hp: 20, maxHp: 20 })
        } else if (tool === "inspect") {
          const key = q + "," + r
          const hexData = map.hexes[key]
          const entity = map.entities.find(e => e.q === q && e.r === r)
          console.log("Hex (" + q + "," + r + ")", hexData, entity || "(no entity)")
        }
      }
    }
  }

  // -- Hex hover for AoE preview ------------------------------------------
  function handleHexHover(q, r) {
    if (interactionMode !== 'aoe' || !pendingAction) return
    if (pendingAction.aoeShape === 'cone') {
      // Cone: fan outward from caster toward the hovered hex
      const caster = map.entities.find(e => e.id === combat.activeId)
      if (!caster) return
      const lengthFeet = pendingAction.aoeSize ?? 15
      setAoePreviewKeys(hexesInCone({ q: caster.q, r: caster.r }, { q, r }, lengthFeet, MAP_RADIUS))
    } else {
      const radiusHexes = Math.floor((pendingAction.aoeRadius ?? pendingAction.aoeSize ?? 20) / 5)
      setAoePreviewKeys(hexesInRange({ q, r }, radiusHexes, MAP_RADIUS))
    }
  }

  // -- Escape to cancel interaction ---------------------------------------
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && interactionMode !== 'idle') {
        setInteractionMode('idle')
        setPendingAction(null)
        setAoePreviewKeys(null)
        setValidTargetIds(null)
        setPendingTargetId(null)
        setAvailableBeastForms(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [interactionMode])

  // -- Interaction mode banner text ---------------------------------------
  const modeBanner = interactionMode === 'target'
    ? `Select a target for ${pendingAction?.label ?? 'action'} (Esc to cancel)`
    : interactionMode === 'aoe'
    ? `Place AoE for ${pendingAction?.label ?? 'spell'} (Esc to cancel)`
    : interactionMode === 'move'
    ? 'Select a hex to move to (Esc to cancel)'
    : interactionMode === 'beastForm'
    ? `Choose a beast form for ${pendingAction?.label ?? 'Polymorph'} (Esc to cancel)`
    : null

  return (
    <div data-testid="combat-viewer" data-session-id={combat.sessionId || ''} style={{ position: 'fixed', inset: 0, overflow: 'hidden', margin: 0, padding: 0 }}>
      <button 
        onClick={onLeave} 
        style={{ position: 'fixed', top: 10, left: 10, zIndex: 1000, padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
      >
        Exit Combat Simulator
      </button>
      {/* Entity position markers for E2E test verification */}
      {map.entities.map(ent => (
        <span
          key={ent.id}
          data-testid={`entity-pos-${ent.id}`}
          data-q={ent.q}
          data-r={ent.r}
          style={{ display: 'none' }}
        />
      ))}
      <CombatHexCanvas
        hexes={map.hexes}
        entities={map.entities}
        corpses={combat.gameState?.corpses ?? []}
        activeId={combat.activeId}
        onHexClick={handleHexClick}
        onHexHover={interactionMode === 'aoe' ? handleHexHover : undefined}
        reachableHexKeys={reachableHexKeys}
        aoePreviewKeys={aoePreviewKeys}
        validTargetIds={validTargetIds}
        interactionMode={interactionMode}
      />
      <CombatHud
        activeCharacter={MOCK_HUD_DATA.activeCharacter}
        character={MOCK_HUD_DATA.activeCharacter}
        editorMode={editorMode}
        onToggleEditor={() => setEditorMode(m => !m)}
        editorTool={tool}
        onToolChange={setTool}
        editorBrush={brush}
        onBrushChange={setBrush}
        terrainTypes={TERRAIN_TYPES}
        onSave={() => save()}
        onLoad={() => { const maps = listBattleMaps(); if (maps.length > 0) load(maps[0].id) }}
        onAction={handleAction}
        onInteractionReset={() => { setInteractionMode('idle'); setPendingAction(null); setValidTargetIds(null); setAoePreviewKeys(null); setPendingTargetId(null); setAvailableBeastForms(null) }}
        serverMenu={combat.menu}
        round={combat.round}
        activeName={combat.activeName}
        movePending={interactionMode === 'move'}
        onMoveClick={handleMoveClick}
        onEndTurn={handleEndTurn}
        isResolving={combat.isResolving}
        combatLog={combat.combatLog}
        victory={combat.victory}
        error={combat.error}
        combatantState={combat.gameState?.combatants?.find(c => c.id === combat.activeId) ?? null}
        beastFormMode={interactionMode === 'beastForm'}
        availableBeastForms={availableBeastForms}
        onBeastFormSelect={handleBeastFormSelect}
        onToggleEncounterModal={() => setShowEncounterModal(prev => !prev)}
      />

      {showEncounterModal && (
        <EncounterModal
          onLoadEncounter={doLoadEncounter}
          onClose={() => setShowEncounterModal(false)}
        />
      )}

      {/* Mode banner */}
      {modeBanner && (
        <div data-testid="mode-banner" style={{
          position: 'fixed', top: 52, left: '50%', transform: 'translateX(-50%)',
          zIndex: 250, background: 'rgba(0,0,0,0.85)', color: '#f0d060',
          padding: '6px 20px', borderRadius: 8, fontSize: 13,
          fontFamily: 'Georgia, serif', border: '1px solid #5a4830',
          pointerEvents: 'none',
        }}>
          {modeBanner}
        </div>
      )}

      {/* -- Combat Log Panel � scrollable log above the RollBar -- */}
      <CombatLogPanel logs={combat.combatLog} />

      {/* -- Inventory Panel � collapsible, above the log on the left -- */}
      <InventoryPanel inventory={combat.inventory} />

      {/* -- 3D Dice Roll Bar � always visible at bottom -- */}
      <DiceRollBar
        onDieClick={handleFreeRoll}
        rollHistory={dice.rollHistory}
        activeRoll={pendingFreeRoll || (pendingDiceRoll ? { notation: pendingDiceRoll.rollRequests?.[0]?.notation || '1d20' } : null)}
        disabled={!combat.sessionId}
      />

      {/* -- DiceArena � 3D physics overlay for BOTH action rolls and free rolls -- */}
      <DiceArena
        visible={!!pendingDiceRoll || !!pendingFreeRoll}
        rollRequests={
          pendingDiceRoll
            ? (pendingDiceRoll.rollRequests || [])
            : pendingFreeRoll
            ? [{ purpose: 'free', notation: pendingFreeRoll.notation, count: 1, sides: parseInt(pendingFreeRoll.notation.replace(/\d+d/, '')) }]
            : []
        }
        onSeedReady={pendingFreeRoll ? handleFreeRollSeedReady : handleDiceSeedReady}
        onCancel={() => {
          if (pendingFreeRoll) {
            setPendingFreeRoll(null)
          } else {
            handleDiceArenaCancel()
          }
        }}
        disabled={combat.isResolving}
      />



      {/* Error toast */}
      {combat.error && (
        <div data-testid="error-toast" style={{
          position: 'fixed', bottom: 44, left: '50%', transform: 'translateX(-50%)',
          zIndex: 300, background: '#401010', color: '#f88', padding: '6px 16px',
          borderRadius: 6, fontSize: 12, border: '1px solid #800',
          fontFamily: 'sans-serif',
        }}>
          {combat.error}
        </div>
      )}
    </div>
  )
}

// -- Combat Log Panel ----------------------------------------------------------

/**
 * CombatLogPanel � thin, scrollable log overlay on the right side, above the
 * RollBar. Auto-scrolls to the latest entry. Each log line gets its own row.
 * Uses data-testid="combat-log" for E2E assertions.
 *
 * Renders each entry with data-testid="log-entry" so E2E tests can assert
 * that specific log text appeared after casting a spell.
 */
function CombatLogPanel({ logs }) {
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length])

  return (
    <div
      data-testid="combat-log"
      style={{
        position: 'fixed',
        bottom: 42,
        right: 8,
        width: 380,
        maxHeight: 220,
        overflowY: 'auto',
        background: 'rgba(10, 8, 6, 0.92)',
        border: '1px solid #3a3020',
        borderRadius: 6,
        padding: '6px 10px',
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: 11,
        lineHeight: '16px',
        color: '#c8b888',
        zIndex: 200,
        pointerEvents: 'auto',
        scrollbarWidth: 'thin',
      }}
    >
      {logs.length === 0 && (
        <div style={{ color: '#665', fontStyle: 'italic' }}>Waiting for combat�</div>
      )}
      {logs.map((entry, i) => {
        // Highlight damage lines in red, success in green, fail in gold
        let color = '#c8b888'
        if (typeof entry === 'string') {
          if (entry.includes('damage')) color = '#e87060'
          else if (entry.includes('FAIL')) color = '#f0d060'
          else if (entry.includes('SUCCESS')) color = '#60c060'
          else if (entry.includes('loots') || entry.includes('Loot:')) color = '#f0c040'
          else if (entry.includes('died') || entry.includes('falls')) color = '#c06060'
          else if (entry.includes('gains:') || entry.includes('?')) color = '#90b0d0'
          else if (entry.includes('casts ')) color = '#d0c0a0'
        }
        return (
          <div key={i} data-testid="log-entry" style={{ color, whiteSpace: 'pre-wrap' }}>
            {typeof entry === 'string' ? entry : JSON.stringify(entry)}
          </div>
        )
      })}
      <div ref={endRef} />
    </div>
  )
}

// -- Helpers -----------------------------------------------------------------

// -- Inventory Panel ----------------------------------------------------------

/**
 * InventoryPanel � collapsible panel on the left side showing looted items
 * and currency. Only visible when inventory has contents.
 */
function InventoryPanel({ inventory }) {
  const [collapsed, setCollapsed] = useState(true)

  if (!inventory) return null
  const hasItems = inventory.items?.length > 0
  const hasCurrency = inventory.currency && Object.keys(inventory.currency).some(k => inventory.currency[k] > 0)
  if (!hasItems && !hasCurrency) return null

  const currencyIcons = { gold: '\u{1FA99}', silver: '\u{1FA99}', copper: '\u{1FA99}', electrum: '\u{1FA99}', platinum: '\u{1FA99}' }
  const currencyColors = { gold: '#ffd700', silver: '#c0c0c0', copper: '#b87333', electrum: '#a8d8ea', platinum: '#e5e4e2' }

  return (
    <div
      data-testid="inventory-panel"
      style={{
        position: 'fixed',
        bottom: 42,
        left: 8,
        width: collapsed ? 'auto' : 240,
        background: 'rgba(10, 8, 6, 0.92)',
        border: '1px solid #3a3020',
        borderRadius: 6,
        padding: collapsed ? '4px 10px' : '6px 10px',
        fontFamily: 'Georgia, serif',
        fontSize: 12,
        color: '#c8b888',
        zIndex: 200,
        pointerEvents: 'auto',
        cursor: 'pointer',
      }}
      onClick={() => setCollapsed(c => !c)}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}>
        <span style={{ fontSize: 14 }}>{'\uD83C\uDF92'}</span>
        <span style={{ fontWeight: 600, color: '#e8d8a8', fontSize: 12 }}>Inventory</span>
        <span style={{ fontSize: 9, color: '#665', marginLeft: 'auto' }}>
          {collapsed ? '\u25B6' : '\u25BC'}
        </span>
      </div>

      {/* Expanded contents */}
      {!collapsed && (
        <div style={{ marginTop: 6 }} onClick={e => e.stopPropagation()}>
          {/* Currency */}
          {hasCurrency && (
            <div style={{ marginBottom: 6, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(inventory.currency).filter(([, v]) => v > 0).map(([type, amount]) => (
                <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <span style={{ color: currencyColors[type] || '#ccc', fontSize: 10 }}>{currencyIcons[type] || '\u25CF'}</span>
                  <span style={{ color: currencyColors[type] || '#ccc', fontSize: 11 }}>{amount}</span>
                  <span style={{ color: '#665', fontSize: 9 }}>{type}</span>
                </span>
              ))}
            </div>
          )}

          {/* Items */}
          {hasItems && (
            <div>
              {inventory.items.map((item, i) => (
                <div key={i} style={{ padding: '2px 0', borderTop: i > 0 ? '1px solid #2a2010' : 'none', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#d4cbb8', fontSize: 11 }}>
                    {item.itemId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                  {item.quantity > 1 && (
                    <span style={{ color: '#887', fontSize: 10 }}>{'\u00D7'}{item.quantity}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Find a matching server menu option for a UI action dispatch.
 * The server menu contains nested categories: actions[], bonusActions[], movement[], reactions[].
 * Each option has { optionId, label, needsTarget, needsAoe, aoeRadius, ... }
 */
function findMenuOption(menu, actionType, data) {
  if (!menu) return null

  // Flatten all menu options into one list
  const all = [
    ...(menu.actions || []),
    ...(menu.bonusActions || []),
    ...(menu.movements || []),
    ...(menu.reactions || []),
    ...(menu.freeActions || []),
  ]

  // Try exact optionId match first (for server-rendered menus)
  if (data?.optionId) {
    return all.find(o => o.optionId === data.optionId) || null
  }

  // Legacy mapping from UI actionTypes to optionId patterns
  switch (actionType) {
    case 'attack':
      return all.find(o => o.optionId === `attack:${data?.id}` || o.label?.includes(data?.name))
    case 'spell':
    case 'bonusSpell':
    case 'reactionSpell':
      return all.find(o => o.optionId === `spell:${data?.id}` || o.label?.includes(data?.name))
    case 'dash':       return all.find(o => o.type === 'dash')
    case 'dodge':      return all.find(o => o.type === 'dodge')
    case 'disengage':  return all.find(o => o.type === 'disengage')
    case 'hide':       return all.find(o => o.type === 'hide')
    case 'help':       return all.find(o => o.type === 'help')
    case 'ready':      return all.find(o => o.type === 'ready')
    case 'loot_corpse': return all.find(o => o.type === 'loot_corpse' && o.corpseId === data?.corpseId)
    case 'feature':
    case 'bonusFeature':
    case 'reactionFeature':
      return all.find(o => o.optionId === `feature:${data?.id}` || o.label?.includes(data?.name))
    default:
      return all.find(o => o.optionId === actionType) || null
  }
}

/**
 * Determine valid target entity IDs based on the action type.
 * Attacks ? enemies. Healing ? allies. General ? all.
 */
function computeValidTargets(menuOption, activeId, entities) {
  const active = entities.find(e => e.id === activeId)
  if (!active) return new Set()

  const targetFilter = menuOption.targetFilter ?? 'enemy'
  const ids = new Set()

  for (const e of entities) {
    if (e.id === activeId) continue // Can't target self for most actions
    if (e.hp <= 0) continue         // Can't target dead entities

    if (targetFilter === 'enemy' && e.side !== active.side) ids.add(e.id)
    else if (targetFilter === 'ally' && e.side === active.side) ids.add(e.id)
    else if (targetFilter === 'any') ids.add(e.id)
  }

  return ids
}
