import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

function pickPrimaryRequest(rollRequests = []) {
  if (!Array.isArray(rollRequests) || rollRequests.length === 0) {
    return { purpose: 'roll', notation: '1d20', count: 1, sides: 20 }
  }
  const sorted = [...rollRequests].sort((a, b) => {
    const countDelta = (b.count || 0) - (a.count || 0)
    if (countDelta !== 0) return countDelta
    return (b.sides || 0) - (a.sides || 0)
  })
  return sorted[0]
}

function extractRollTotal(result) {
  if (!result) return null
  if (typeof result === 'number' && Number.isFinite(result)) return result
  if (typeof result?.total === 'number' && Number.isFinite(result.total)) return result.total

  const values = []

  const collect = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) values.push(value)
  }

  const scan = (node) => {
    if (!node) return
    if (Array.isArray(node)) {
      node.forEach(scan)
      return
    }
    if (typeof node !== 'object') return

    collect(node.value)
    collect(node.result)
    collect(node.face)
    collect(node.finalResult)

    scan(node.rolls)
    scan(node.results)
    scan(node.dice)
    scan(node.sets)
  }

  scan(result)
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0)
}

function parseNotation(notation = '1d20') {
  const raw = String(notation).trim().toLowerCase()
  const match = raw.match(/^(\d+)d(\d+)([+-]\d+)?$/)
  if (!match) {
    return { count: 1, sides: 20, modifier: 0 }
  }
  const count = Math.max(1, Number(match[1]) || 1)
  const sides = Math.max(2, Number(match[2]) || 20)
  const modifier = Number(match[3] || 0)
  return { count, sides, modifier }
}

/** Flatten pendingDice.dice [{type:'d6', count:2}] → [6, 6] */
function flattenDiceQueue(dice = []) {
  const queue = []
  for (const d of dice) {
    const sides = parseInt(String(d.type).replace(/^d/i, ''), 10) || 20
    const count = Math.max(1, d.count || 1)
    for (let i = 0; i < count; i++) queue.push(sides)
  }
  return queue
}

export default function DiceArena({
  // Shared
  visible,
  onCancel,
  disabled = false,
  // Legacy mode (single-throw-per-action)
  rollRequests = [],
  onSeedReady,
  // Stepped mode (per-die-click)
  pendingDice,        // { reason, dice: [{type,count}], modifier, owner, label }
  ownerIsAi = false,
  onDiceComplete,     // (seeds: string[]) => void
}) {
  const boxRef = useRef(null)
  const hostIdRef = useRef(`dice-arena-${Math.random().toString(36).slice(2)}`)
  const steppedMode = !!pendingDice

  // Legacy state
  const queuedThrowRef = useRef(false)
  const pendingSeedRef = useRef(null)
  const [isPressed, setIsPressed] = useState(false)
  const [isThrowing, setIsThrowing] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [displayTotal, setDisplayTotal] = useState(null)
  const [awaitingContinue, setAwaitingContinue] = useState(false)

  // Stepped state
  const [dieQueue, setDieQueue] = useState([])       // [20, 6, 6] — sides per individual die
  const [currentDieIdx, setCurrentDieIdx] = useState(0)
  const [dieResults, setDieResults] = useState([])    // [{value, seed}]
  const [steppedPhase, setSteppedPhase] = useState('idle') // idle | throwing | complete
  const autoRollRef = useRef(null)
  const rollingRef = useRef(false) // guard against double-clicks

  const primary = useMemo(() => pickPrimaryRequest(rollRequests), [rollRequests])

  // ── Reset stepped state when pendingDice changes ──
  useEffect(() => {
    if (!pendingDice) {
      setDieQueue([])
      setCurrentDieIdx(0)
      setDieResults([])
      setSteppedPhase('idle')
      return
    }
    const q = flattenDiceQueue(pendingDice.dice)
    setDieQueue(q)
    setCurrentDieIdx(0)
    setDieResults([])
    setSteppedPhase(q.length > 0 ? 'idle' : 'complete')
  }, [pendingDice])

  useEffect(() => {
    let disposed = false
    setIsReady(false)

    async function initDiceBox() {
      if (!visible || boxRef.current) return
      try {
        const mod = await import('@3d-dice/dice-box')
        if (disposed) return

        const DiceBox = mod.default || mod
        // Stepped mode always throws single dice; legacy uses primary notation
        const parsed = steppedMode ? { count: 1 } : parseNotation(primary?.notation || '1d20')
        const count = steppedMode ? 1 : Math.max(1, Number(primary?.count) || parsed.count)
        const scale = count >= 4 ? 4 : count === 3 ? 5 : count === 2 ? 6 : 7
        const throwForce = count >= 3 ? 16 : 13
        const spinForce = count >= 3 ? 22 : 18

        const box = new DiceBox({
          container: `#${hostIdRef.current}`,
          assetPath: '/assets/',
          scale,
          gravity: 5,
          throwForce,
          spinForce,
          theme: 'default',
        })

        // FIX: The library constructor (Jl()) appends a bare <canvas> with no CSS
        // dimensions. When init() fires, it reads canvas.clientWidth/clientHeight
        // synchronously to set the drawing buffer — no layout flush, no DPR support.
        // If those values are 0 (element not yet laid out) or CSS pixels (no DPR),
        // the buffer is undersized and the canvas is stretched → blurry dice.
        //
        // Solution: BEFORE calling init(), set the canvas CSS to exact physical-pixel
        // px dimensions. This forces clientWidth/clientHeight to return the physical
        // pixel count when the library reads them, creating a full-res drawing buffer.
        // After init(), we switch back to 100% for display layout.
        const dpr = window.devicePixelRatio || 1
        const physW = Math.round(window.innerWidth * dpr)
        const physH = Math.round(window.innerHeight * dpr)
        const hostEl = document.getElementById(hostIdRef.current)
        const preInitCanvas = hostEl?.querySelector('canvas')
        if (preInitCanvas) {
          preInitCanvas.style.position = 'absolute'
          preInitCanvas.style.inset = '0'
          preInitCanvas.style.width = physW + 'px'
          preInitCanvas.style.height = physH + 'px'
        }

        await box.init()
        if (disposed) return

        // Now the buffer is locked at physW × physH. Switch CSS to 100% so the
        // canvas fills the overlay container via display layout (not px dimensions).
        if (preInitCanvas) {
          preInitCanvas.style.width = '100%'
          preInitCanvas.style.height = '100%'
        }

        boxRef.current = box
        setIsReady(true)
      } catch (err) {
        console.error('[DiceArena] Failed to initialize dice-box:', err)
        // Signal ready so any queued throw fires on the software (no-3D) path
        if (!disposed) setIsReady(true)
      }
    }

    initDiceBox()

    return () => {
      disposed = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  useEffect(() => {
    if (!visible) {
      setIsPressed(false)
      setIsThrowing(false)
      setIsReady(false)
      setDisplayTotal(null)
      setAwaitingContinue(false)
      queuedThrowRef.current = false
      pendingSeedRef.current = null
      rollingRef.current = false
      clearTimeout(autoRollRef.current)
      boxRef.current = null
    }
  }, [visible])

  // ── STEPPED MODE: Roll one die with 3D animation ──
  const rollOneDie = useCallback(async (sides) => {
    if (!boxRef.current?.roll) return { value: 0, seed: String(Date.now()) }
    const seed = String(Date.now())
    try {
      if (boxRef.current.clear) await boxRef.current.clear()
      const result = await Promise.race([
        boxRef.current.roll(`1d${sides}`),
        new Promise((resolve) => setTimeout(() => resolve(null), 3500)),
      ])
      const value = extractRollTotal(result) ?? 0
      return { value, seed }
    } catch (err) {
      console.error('[DiceArena] single die roll failed:', err)
      return { value: 0, seed }
    }
  }, [])

  // ── STEPPED MODE: Handle one die click ──
  const handleSteppedRoll = useCallback(async () => {
    if (rollingRef.current || disabled || currentDieIdx >= dieQueue.length) return
    rollingRef.current = true
    setSteppedPhase('throwing')
    setDisplayTotal(null)

    const sides = dieQueue[currentDieIdx]
    const { value, seed } = await rollOneDie(sides)

    // Show individual die result briefly
    setDisplayTotal(value)
    await new Promise((r) => setTimeout(r, ownerIsAi ? 500 : 800))

    const newResults = [...dieResults, { value, seed }]
    const nextIdx = currentDieIdx + 1
    setDieResults(newResults)
    setCurrentDieIdx(nextIdx)

    if (nextIdx >= dieQueue.length) {
      // All dice rolled — show final total with modifier
      const total = newResults.reduce((s, r) => s + r.value, 0) + (pendingDice?.modifier || 0)
      setDisplayTotal(total)
      setSteppedPhase('complete')

      // AI auto-continues after brief display
      if (ownerIsAi) {
        await new Promise((r) => setTimeout(r, 900))
        onDiceComplete?.(newResults.map((r) => r.seed))
      }
    } else {
      setSteppedPhase('idle')
    }
    rollingRef.current = false
  }, [disabled, currentDieIdx, dieQueue, dieResults, rollOneDie, ownerIsAi, pendingDice, onDiceComplete])

  // ── STEPPED MODE: AI auto-roll ──
  useEffect(() => {
    if (!steppedMode || !ownerIsAi || !isReady || steppedPhase !== 'idle') return
    if (currentDieIdx >= dieQueue.length) return
    autoRollRef.current = setTimeout(handleSteppedRoll, 350)
    return () => clearTimeout(autoRollRef.current)
  }, [steppedMode, ownerIsAi, isReady, steppedPhase, currentDieIdx, dieQueue.length, handleSteppedRoll])

  // ── STEPPED MODE: Player confirms total ──
  const handleSteppedConfirm = useCallback(() => {
    if (steppedPhase !== 'complete') return
    onDiceComplete?.(dieResults.map((r) => r.seed))
  }, [steppedPhase, dieResults, onDiceComplete])

  // ── LEGACY MODE: Full throw (existing logic) ──
  const runThrow = async () => {
    if (disabled || isThrowing || awaitingContinue || !isReady) return
    setIsPressed(false)
    setIsThrowing(true)
    setDisplayTotal(null)

    const seed = String(Date.now())
    const notation = primary?.notation || '1d20'
    const parsed = parseNotation(notation)
    let showedResult = false

    try {
      if (boxRef.current?.roll) {
        let total = null
        if (parsed.count > 1) {
          let runningTotal = 0
          for (let dieIndex = 0; dieIndex < parsed.count; dieIndex += 1) {
            const singleResult = await Promise.race([
              boxRef.current.roll(`1d${parsed.sides}`),
              new Promise((resolve) => setTimeout(() => resolve(null), 2500)),
            ])
            const dieValue = extractRollTotal(singleResult)
            if (dieValue !== null) runningTotal += dieValue
            await new Promise((resolve) => setTimeout(resolve, 80))
          }
          runningTotal += parsed.modifier
          total = runningTotal
        } else {
          const rollResult = await Promise.race([
            boxRef.current.roll(notation),
            new Promise((resolve) => setTimeout(() => resolve(null), 4500)),
          ])
          total = extractRollTotal(rollResult)
        }
        if (total !== null) {
          setDisplayTotal(total)
          showedResult = true
          await new Promise((resolve) => setTimeout(resolve, 1200))
        }
      }
    } catch (err) {
      console.error('[DiceArena] roll() failed:', err)
    }

    if (!showedResult) {
      setDisplayTotal(0)
    }
    pendingSeedRef.current = seed
    setAwaitingContinue(true)
    setIsThrowing(false)
  }

  const handleRelease = async () => {
    if (disabled || isThrowing || awaitingContinue) return
    setIsPressed(false)
    if (!isReady) {
      // DiceBox still loading — queue the throw for when it's ready
      queuedThrowRef.current = true
      return
    }
    await runThrow()
  }

  useEffect(() => {
    if (!visible || disabled || isThrowing || awaitingContinue || !isReady || !queuedThrowRef.current) return
    queuedThrowRef.current = false
    runThrow() // eslint-disable-line react-hooks/exhaustive-deps
  }, [visible, disabled, isThrowing, awaitingContinue, isReady])

  const handleContinue = async () => {
    if (!awaitingContinue || !pendingSeedRef.current) return
    const seed = pendingSeedRef.current
    pendingSeedRef.current = null
    setAwaitingContinue(false)
    onSeedReady?.(seed)
  }

  if (!visible) return null

  return (
    <div style={S.overlay} data-testid="dice-arena">
      <div id={hostIdRef.current} style={S.canvasHost} data-testid="dice-throw-frame" />

      {steppedMode ? (
        /* ── STEPPED MODE ─────────────────────────────────── */
        <>
          {/* Header: label + progress */}
          <div style={S.steppedHeader}>
            <div style={S.steppedLabel}>
              {pendingDice?.label || pendingDice?.reason || 'Roll'}
            </div>
            <div style={S.steppedProgress}>
              {dieQueue.length > 1
                ? `Die ${Math.min(currentDieIdx + 1, dieQueue.length)} of ${dieQueue.length}`
                : `1d${dieQueue[0] || 20}`}
              {pendingDice?.modifier
                ? ` (${pendingDice.modifier >= 0 ? '+' : ''}${pendingDice.modifier})`
                : ''}
            </div>
          </div>

          {/* Dice tray showing all dice (only when >1 die) */}
          {dieQueue.length > 1 && (
            <div style={S.diceTray}>
              {dieQueue.map((sides, idx) => {
                const isRolled = idx < currentDieIdx
                const isCurrent = idx === currentDieIdx && steppedPhase !== 'complete'
                return (
                  <div
                    key={idx}
                    style={{
                      ...S.trayDie,
                      ...(isRolled ? S.trayDieRolled : {}),
                      ...(isCurrent ? S.trayDieCurrent : {}),
                    }}
                  >
                    <div style={S.trayDieLabel}>d{sides}</div>
                    {isRolled && (
                      <div style={S.trayDieResult}>{dieResults[idx]?.value}</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Clickable die button (player, idle phase) */}
          {!ownerIsAi && steppedPhase === 'idle' && currentDieIdx < dieQueue.length && (
            <div style={S.center}>
              <button
                type="button"
                disabled={disabled}
                onMouseDown={() => setIsPressed(true)}
                onMouseUp={() => setIsPressed(false)}
                onMouseLeave={() => setIsPressed(false)}
                onTouchStart={() => setIsPressed(true)}
                onTouchEnd={() => setIsPressed(false)}
                onClick={handleSteppedRoll}
                style={{
                  ...S.focusDie,
                  transform: isPressed ? 'scale(0.96)' : 'scale(1)',
                  boxShadow: isPressed
                    ? '0 0 0 3px rgba(255,255,255,0.18), 0 0 35px rgba(140, 100, 255, 0.65)'
                    : '0 0 0 2px rgba(255,255,255,0.15), 0 0 24px rgba(140, 100, 255, 0.35)',
                  opacity: disabled ? 0.5 : isReady ? 1 : 0.85,
                }}
                title={isReady ? 'Click to roll' : 'Loading 3D dice…'}
              >
                <div style={S.focusDieLabel}>d{dieQueue[currentDieIdx]}</div>
                <div style={S.focusDieSub}>{pendingDice?.reason || 'roll'}</div>
                <div style={S.focusDieSub}>
                  {isReady ? 'Click to roll' : 'Loading 3D dice…'}
                </div>
              </button>
            </div>
          )}

          {/* Throwing animation */}
          {steppedPhase === 'throwing' && (
            <div style={S.resultBadge} data-testid="dice-result-badge">
              <div style={S.resultLabel}>
                {ownerIsAi ? 'Enemy rolling…' : 'Rolling…'}
              </div>
              <div style={S.resultValue}>
                {displayTotal === null ? '…' : displayTotal}
              </div>
            </div>
          )}

          {/* AI idle indicator */}
          {ownerIsAi && steppedPhase === 'idle' && currentDieIdx < dieQueue.length && (
            <div style={S.resultBadge}>
              <div style={S.resultLabel}>Enemy rolling…</div>
              <div style={S.resultValue}>d{dieQueue[currentDieIdx]}</div>
            </div>
          )}

          {/* Complete — player confirms, AI auto-continues */}
          {steppedPhase === 'complete' && !ownerIsAi && (
            <button
              type="button"
              onClick={handleSteppedConfirm}
              style={S.resultConfirm}
              data-testid="dice-result-confirm"
            >
              <div style={S.resultLabel}>
                {pendingDice?.label || pendingDice?.reason || 'Total'}
              </div>
              <div style={S.resultValue}>{displayTotal ?? 0}</div>
              <div style={S.resultTap}>Click to continue</div>
            </button>
          )}
          {steppedPhase === 'complete' && ownerIsAi && (
            <div style={S.resultBadge} data-testid="dice-result-badge">
              <div style={S.resultLabel}>
                {pendingDice?.label || pendingDice?.reason || 'Total'}
              </div>
              <div style={S.resultValue}>{displayTotal ?? 0}</div>
            </div>
          )}
        </>
      ) : (
        /* ── LEGACY MODE ──────────────────────────────────── */
        <>
          {!isThrowing && !awaitingContinue && (
            <div style={S.center}>
              <button
                type="button"
                disabled={disabled}
                onMouseDown={() => setIsPressed(true)}
                onMouseUp={() => setIsPressed(false)}
                onMouseLeave={() => setIsPressed(false)}
                onTouchStart={() => setIsPressed(true)}
                onTouchEnd={() => setIsPressed(false)}
                onClick={handleRelease}
                style={{
                  ...S.focusDie,
                  transform: isPressed ? 'scale(0.96)' : 'scale(1)',
                  boxShadow: isPressed
                    ? '0 0 0 3px rgba(255,255,255,0.18), 0 0 35px rgba(140, 100, 255, 0.65)'
                    : '0 0 0 2px rgba(255,255,255,0.15), 0 0 24px rgba(140, 100, 255, 0.35)',
                  opacity: disabled ? 0.5 : isReady ? 1 : 0.85,
                }}
                title={isReady ? 'Click to throw' : 'Loading 3D dice…'}
              >
                <div style={S.focusDieLabel}>d{primary.sides || 20}</div>
                <div style={S.focusDieSub}>{primary.purpose || 'roll'}</div>
                <div style={S.focusDieSub}>
                  {isReady ? (primary.notation || '1d20') : 'Loading 3D dice…'}
                </div>
              </button>
            </div>
          )}

          {isThrowing && (
            <div style={S.resultBadge} data-testid="dice-result-badge">
              <div style={S.resultLabel}>
                {displayTotal === null ? 'Rolling…' : 'Result'}
              </div>
              <div style={S.resultValue}>
                {displayTotal === null ? '…' : displayTotal}
              </div>
            </div>
          )}

          {awaitingContinue && (
            <button
              type="button"
              onClick={handleContinue}
              style={S.resultConfirm}
              data-testid="dice-result-confirm"
            >
              <div style={S.resultLabel}>Result</div>
              <div style={S.resultValue}>{displayTotal ?? 0}</div>
              <div style={S.resultTap}>Click to continue</div>
            </button>
          )}
        </>
      )}

      {onCancel && !isThrowing && !awaitingContinue && steppedPhase !== 'throwing' && (
        <button type="button" onClick={onCancel} style={S.cancelBtn}>
          Cancel
        </button>
      )}
    </div>
  )
}

const S = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 2000,
    background: 'rgba(0, 0, 0, 0.82)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Canvas host fills the ENTIRE overlay so dice-box physics world = full viewport.
     The library sizes its physics world to this container's clientWidth/clientHeight.
     Making it full-screen means dice thrown from edges travel toward viewport center. */
  canvasHost: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    zIndex: 1,
  },

  center: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 10,
  },
  focusDie: {
    pointerEvents: 'auto',
    width: 132,
    height: 132,
    borderRadius: 20,
    border: '1px solid rgba(255,255,255,0.4)',
    background: 'rgba(18, 18, 25, 0.85)',
    color: '#f3f3ff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    cursor: 'pointer',
    transition: 'transform 0.12s ease, box-shadow 0.15s ease',
    userSelect: 'none',
  },
  focusDieLabel: {
    fontSize: 40,
    fontWeight: 700,
    lineHeight: 1,
  },
  focusDieSub: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 10,
    opacity: 0.85,
  },
  cancelBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    background: 'rgba(15, 15, 20, 0.9)',
    color: '#f3f3ff',
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: 8,
    padding: '8px 12px',
    cursor: 'pointer',
    zIndex: 10,
  },
  resultBadge: {
    position: 'absolute',
    bottom: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    minWidth: 220,
    background: 'rgba(10,10,16,0.88)',
    color: '#f8f8ff',
    border: '1px solid rgba(255,255,255,0.28)',
    borderRadius: 12,
    padding: '8px 16px 12px',
    boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
    zIndex: 10,
    textAlign: 'center',
  },
  resultLabel: {
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    opacity: 0.82,
    marginBottom: 4,
  },
  resultValue: {
    fontSize: 64,
    lineHeight: 1,
    fontWeight: 800,
  },
  resultConfirm: {
    position: 'absolute',
    bottom: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    minWidth: 260,
    background: 'rgba(10,10,16,0.95)',
    color: '#f8f8ff',
    border: '1px solid rgba(255,255,255,0.38)',
    borderRadius: 12,
    padding: '10px 18px 14px',
    boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
    zIndex: 10,
    textAlign: 'center',
    cursor: 'pointer',
  },
  resultTap: {
    marginTop: 8,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    opacity: 0.88,
  },

  /* ── Stepped mode styles ── */
  steppedHeader: {
    position: 'absolute',
    top: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    textAlign: 'center',
    color: '#f3f3ff',
    zIndex: 10,
  },
  steppedLabel: {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: 0.6,
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  steppedProgress: {
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    opacity: 0.7,
  },
  diceTray: {
    position: 'absolute',
    top: 80,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 10,
    zIndex: 10,
  },
  trayDie: {
    width: 52,
    height: 52,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(18, 18, 25, 0.7)',
    color: '#f3f3ff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    opacity: 0.5,
  },
  trayDieRolled: {
    opacity: 1,
    background: 'rgba(60, 180, 80, 0.25)',
    borderColor: 'rgba(60, 180, 80, 0.5)',
  },
  trayDieCurrent: {
    opacity: 1,
    background: 'rgba(140, 100, 255, 0.25)',
    borderColor: 'rgba(140, 100, 255, 0.6)',
    boxShadow: '0 0 12px rgba(140, 100, 255, 0.4)',
  },
  trayDieLabel: {
    fontSize: 14,
    fontWeight: 700,
  },
  trayDieResult: {
    fontSize: 11,
    fontWeight: 600,
    color: '#9eff9e',
    marginTop: 2,
  },
}
