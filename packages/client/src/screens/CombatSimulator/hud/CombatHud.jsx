/**
 * CombatHud — Single-SVG hex frame + portrait + integrated icon toolbar.
 *
 * The dark frame wraps EVERYTHING. The hex viewport and the portrait circle
 * are CUTOUTS (evenodd). The icon toolbar sits ON the frame material in the
 * 64 px margin strip above the hex top edge (V2→V1).
 *
 * No business logic here — all rules live in useCombatTurn.
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import './CombatHud.css'

// ─── Layout constants ────────────────────────────────────────────────────────
const FRAME_MARGIN = 80
const BORDER_WIDTH = 4
const DOCK_GAP     = 8   // portrait ↔ hex gap
const TB_H     = 42      // toolbar height
const TB_R     = 8       // toolbar corner radius
const TB_INSET = 8       // horizontal inset from hex top-edge endpoints

// ─── Geometry helpers ────────────────────────────────────────────────────────

/** Regular pointy-top hex — 6 vertices.
 *  V0=right  V1=top-right  V2=top-left  V3=left  V4=bot-left  V5=bot-right */
function computeHex(viewW, viewH) {
  const availW = viewW - FRAME_MARGIN * 2
  const availH = viewH - FRAME_MARGIN * 2
  const cx = viewW / 2, cy = viewH / 2
  const s  = Math.min(availW / 2, availH / Math.sqrt(3))
  const hh = s * Math.sqrt(3) / 2
  return [
    [cx + s,   cy      ],
    [cx + s/2, cy - hh ],
    [cx - s/2, cy - hh ],
    [cx - s,   cy      ],
    [cx - s/2, cy + hh ],
    [cx + s/2, cy + hh ],
  ]
}

function hexToSvgPath(pts) {
  return 'M ' + pts.map(p => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' L ') + ' Z'
}

function insetHex(pts, factor) {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length
  return pts.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor])
}

/** Toolbar rect — centred in the 64 px strip above V2→V1. */
function computeToolbar(hexPts) {
  const [V1x, V1y] = hexPts[1]
  const [V2x]      = hexPts[2]
    const w = Math.max(0, V1x - V2x - TB_INSET * 2)
    const x = V2x + TB_INSET
    const y = Math.max(4, (V1y - TB_H) / 2)
    return { x, y, w, h: TB_H, r: TB_R }
  }

function computePortrait(hexPts) {
  const [V2x, V2y] = hexPts[2]
  const [V3x, V3y] = hexPts[3]
  const Mx = (V2x + V3x) / 2, My = (V2y + V3y) / 2
  const r  = Math.max(32, Math.round((2 * My - 3 * DOCK_GAP) / 3))
  const t  = r + DOCK_GAP
  const cx = Math.round(Mx - t * Math.sqrt(3) / 2)
  const cy = DOCK_GAP + r
  return { r, cx, cy }
}

/** 8 px metallic connector along V2→V3 outward normal. */
function computeConnector(hexPts) {
  const [V2x, V2y] = hexPts[2]
  const [V3x, V3y] = hexPts[3]
  const mx = (V2x + V3x) / 2, my = (V2y + V3y) / 2
  const nx = -Math.sqrt(3) / 2, ny = -0.5
  return { x1: mx, y1: my, x2: mx + nx * DOCK_GAP, y2: my + ny * DOCK_GAP }
}

/** Triangular "Load Encounter" button — yield-sign shape.
 *  Sits in the wedge between the portrait circle and hex vertex V2.
 *  The triangle points downward (inverted yield sign). */
function computeEncounterButton(hexPts, port) {
  const [V2x, V2y] = hexPts[2]
  // Place the triangle between the portrait top-right and V2 vertex
  // Center is roughly between portrait right edge and V2
  const cx = (port.cx + port.r + V2x) / 2
  const cy = (port.cy + V2y) / 2
  const size = Math.max(14, Math.min(20, port.r * 0.35))
  // Inverted triangle (yield sign / pointing down)
  const pts = [
    [cx,           cy + size],       // bottom vertex
    [cx - size,    cy - size * 0.6], // top-left
    [cx + size,    cy - size * 0.6], // top-right
  ]
  return { pts, cx, cy: cy + size * 0.13, size }
}

// ─── Toolbar helpers ─────────────────────────────────────────────────────────

const LVL_COLORS = {1:'#4a8',2:'#48a',3:'#84a',4:'#a84',5:'#a48',6:'#8a4',7:'#a4a',8:'#aa4',9:'#c44'}

function canCast(spell, budget) {
  if (!budget) return false
  if (spell.level === 0) return true
  const left = (budget.spellSlots ?? {})[spell.level] ?? 0
  if (left <= 0) return false
  if (spell.actionType === 'action'   && budget.actionUsed)      return false
  if (spell.actionType === 'bonus'    && budget.bonusActionUsed)  return false
  if (spell.actionType === 'reaction' && budget.reactionUsed)     return false
  return true
}

function usesLeft(f, allFeats, budget) {
  if (!budget) return 0
  if (f.sharePool) {
    const p = allFeats.find(x => x.id === f.sharePool)
    if (p) return (budget.featureUses ?? {})[p.id] ?? 0
  }
  return (budget.featureUses ?? {})[f.id] ?? 0
}

const TB_BTNS = [
  { key: 'move',   icon: '\u{1F9B6}', label: 'Move' },
  { key: 'attack', icon: '\u2694\uFE0F', label: 'Attack',      flyout: true },
  { key: 'spell',  icon: '\u2728',       label: 'Cast Spell',   flyout: true },
  { key: 'loot',   icon: '\u{1F4B0}',    label: 'Loot',         flyout: true },
  { key: 'dash',   icon: '\u{1F4A8}',    label: 'Dash' },
  { key: 'dodge',  icon: '\u{1F6E1}\uFE0F', label: 'Dodge' },
  { key: 'bonus',  icon: '\u26A1',       label: 'Bonus Action', flyout: true },
  { key: 'react',  icon: '\u{1F504}',    label: 'Reaction',     flyout: true },
  { key: 'end',    icon: '\u23F9\uFE0F', label: 'End Turn' },
]

// ─── Component ───────────────────────────────────────────────────────────────

export default function CombatHud({
  activeCharacter = null,
  editorMode      = false,
  onToggleEditor,
  editorTool,
  onToolChange,
  editorBrush,
  onBrushChange,
  terrainTypes,
  onSave,
  onLoad,
  // ── action-toolbar props
  onAction     = null,
  onInteractionReset = null, // Called when any flyout opens — lets parent cancel move/target/aoe mode
  serverMenu   = null,       // Server-provided TurnMenu (replaces activeBudget for enable/disable)
  activeBudget = null,       // DEPRECATED — kept for backward compat during transition
  character    = null,
  round        = 1,
  activeName   = '',
  movePending  = false,
  onMoveClick  = null,
  onEndTurn    = null,
  isResolving  = false,      // When true, all buttons disabled (waiting for server/dice)
  combatLog    = [],
  victory      = null,
  error        = null,
  // ── Beast form selection (Polymorph)
  beastFormMode      = false,
  availableBeastForms = null,
  onBeastFormSelect  = null,
  // ── Server combatant state (conditions, concentration, etc.)
  combatantState     = null,
  // ── Encounter loader
  onToggleEncounterModal = null,
}) {
  const [dims, setDims]       = useState({ w: window.innerWidth, h: window.innerHeight })
  const [openMenu, setOpenMenu] = useState(null)
  const flyoutRef = useRef(null)
  const svgRef    = useRef(null)   // used to exclude toolbar SVG from outside-click handler

  useEffect(() => {
    const handleResize = () => {
      setDims({ w: window.innerWidth, h: window.innerHeight })
    }
    window.addEventListener('resize', handleResize)
    handleResize() // init
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Close flyout on outside click.
  // Exclude clicks on the SVG toolbar so the toolbar button’s own onClick can handle toggle logic.
  useEffect(() => {
    if (!openMenu) return
    const handler = (e) => {
      if (svgRef.current && svgRef.current.contains(e.target)) return // let SVG onClick handle it
      if (flyoutRef.current && !flyoutRef.current.contains(e.target)) setOpenMenu(null)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [openMenu])

  // ── geometry ──────────────────────────────────────────────────────────────
  const hexPts    = computeHex(dims.w, dims.h)
  const hexPath   = hexToSvgPath(hexPts)
  const innerPath = hexToSvgPath(insetHex(hexPts, 0.97))
  const outerRect = `M 0,0 L ${dims.w},0 L ${dims.w},${dims.h} L 0,${dims.h} Z`
  const port = computePortrait(hexPts)
  const conn = computeConnector(hexPts)
  const tb   = computeToolbar(hexPts)
  const encBtn = computeEncounterButton(hexPts, port)

  const circlePath =
    `M ${port.cx},${port.cy - port.r} ` +
    `A ${port.r},${port.r} 0 1,1 ${port.cx},${port.cy + port.r} ` +
    `A ${port.r},${port.r} 0 1,1 ${port.cx},${port.cy - port.r} Z`

  // Frame = outer rect with hex + circle punched out.  Toolbar is ON the frame.
  const framePath = outerRect + ' ' + hexPath + ' ' + circlePath

  const portraitUrl = activeCharacter?.portraitUrl ?? null

  // ── toolbar derived data ──────────────────────────────────────────────────
  const budget   = activeBudget
  const char     = character
  const weapons  = char?.weapons ?? []
  const spells   = char?.spells ?? []
  const cantrxs  = char?.cantrips ?? []
  const features = char?.classFeatures ?? []
  const maxSlots = char?.spellSlots ?? {}

  const actionSpells   = spells.filter(s => s.actionType === 'action')
  const bonusSpells    = spells.filter(s => s.actionType === 'bonus')
  const reactionSpells = spells.filter(s => s.actionType === 'reaction')
  const bonusFeats     = features.filter(f => f.actionType === 'bonus')
  const reactionFeats  = features.filter(f => f.actionType === 'reaction')

  const actUsed = budget?.actionUsed      ?? false
  const bonUsed = budget?.bonusActionUsed  ?? false
  const reaUsed = budget?.reactionUsed     ?? false
  const moveFt  = budget?.movementRemaining ?? 0

  const attackFeatures = features.filter(f => f.isAttack && f.actionType === 'action')

  function isBtnOff(key) {
    if (isResolving) return true  // All buttons disabled during resolution
    if (!budget && !serverMenu) return false // ENABLE BUTTONS FOR MOCK/PREVIEW MODE!

    // If server menu is available, use it to determine enabled state
    if (serverMenu) {
      switch (key) {
        case 'move':   return !(serverMenu.movements?.length > 0) && !movePending
        case 'attack': return !(serverMenu.actions?.some(a => a.type === 'attack'))
        case 'spell':  return !(serverMenu.actions?.some(a => a.type === 'spell'))
        case 'loot':   return !(serverMenu.actions?.some(a => a.type === 'loot_corpse'))
        case 'dash':   return !(serverMenu.actions?.some(a => a.type === 'dash'))
        case 'dodge':  return !(serverMenu.actions?.some(a => a.type === 'dodge'))
        case 'bonus':  return !(serverMenu.bonusActions?.length > 0)
        case 'react':  return !(serverMenu.reactions?.length > 0)
        case 'end':    return false
        default:       return false
      }
    }

    // Fallback to budget-based enable/disable
    switch (key) {
      case 'move':   return moveFt <= 0 && !movePending
      case 'attack': case 'spell': case 'dash': case 'dodge': return actUsed
      case 'loot':   return true  // No server menu means no loot info
      case 'bonus':  return bonUsed
      case 'react':  return reaUsed
      case 'end':    return false
      default:       return false
    }
  }

  function onIcon(def) {
    if (def.flyout) {
      if (openMenu !== def.key) onInteractionReset?.()
      setOpenMenu(openMenu === def.key ? null : def.key)
      return
    }
    setOpenMenu(null)
    switch (def.key) {
      case 'move':  onMoveClick?.();        break
      case 'dash':  onAction?.('dash', {}); break
      case 'dodge': onAction?.('dodge',{}); break
      case 'end':   onEndTurn?.();          break
    }
  }

  function fire(type, data) { setOpenMenu(null); onAction?.(type, data) }

  // button geometry
  const btnGap = 3, btnPad = 4
  const btnW = Math.max(0, (tb.w - btnPad * 2 - btnGap * (TB_BTNS.length - 1)) / TB_BTNS.length)
  const btnH  = tb.h - 8
  const btnY0 = tb.y + 4
  const bx    = i => tb.x + btnPad + i * (btnW + btnGap)

  // flyout anchor
  const flyIdx = TB_BTNS.findIndex(b => b.key === openMenu)
  const flyX   = flyIdx >= 0 ? bx(flyIdx) : 0
  const flyY   = tb.y + tb.h + 4

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="hud" data-server-menu={serverMenu ? 'ready' : 'loading'}>
      <svg
        ref={svgRef}
        className="hud__svg"
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="frameGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#2a2622" />
            <stop offset="40%"  stopColor="#1e1a16" />
            <stop offset="100%" stopColor="#161210" />
          </linearGradient>
          <linearGradient id="hexStroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor="#6a5838" />
            <stop offset="50%"  stopColor="#4a3c28" />
            <stop offset="100%" stopColor="#6a5838" />
          </linearGradient>
          <linearGradient id="bannerGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#2e2418" />
            <stop offset="50%"  stopColor="#1a1208" />
            <stop offset="100%" stopColor="#0e0c08" />
          </linearGradient>
          <filter id="hexGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix in="blur" type="matrix"
              values="1 0 0 0 0.15  0 0.8 0 0 0.1  0 0 0.4 0 0  0 0 0 0.6 0"
              result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id="portraitClip" clipPathUnits="userSpaceOnUse">
            <circle cx={port.cx} cy={port.cy} r={port.r} />
          </clipPath>
        </defs>

        {/* ── 1. Portrait image — rendered BEHIND the frame ── */}
        {portraitUrl && (
          <image
            href={portraitUrl}
            x={port.cx - port.r} y={port.cy - port.r}
            width={port.r * 2}   height={port.r * 2}
            clipPath="url(#portraitClip)"
            preserveAspectRatio="xMidYMin slice"
          />
        )}
        {!portraitUrl && activeCharacter && (
          <text
            x={port.cx} y={port.cy}
            textAnchor="middle" dominantBaseline="central"
            fill="#d4cbb8" fontSize={port.r * 0.5} fontWeight="800"
          >
            {activeCharacter.name?.[0] ?? '?'}
          </text>
        )}

        {/* ── 2. Frame — dark material with hex + circle cutouts ── */}
        <path d={framePath} fill="url(#frameGrad)" fillRule="evenodd" />

        {/* ── 3. Hex border ── */}
        <path d={hexPath}   fill="none" stroke="url(#hexStroke)" strokeWidth={BORDER_WIDTH} />
        <path d={innerPath} fill="none" stroke="#6a5838" strokeWidth={2}
              filter="url(#hexGlow)" opacity={0.7} />
        {hexPts.map((pt, i) => (
          <circle key={i} cx={pt[0]} cy={pt[1]} r={3.5} fill="#6a5838" opacity={0.5} />
        ))}

        {/* ── 4. Portrait circle border ── */}
        <circle cx={port.cx} cy={port.cy} r={port.r}
          fill="none" stroke="url(#hexStroke)" strokeWidth={BORDER_WIDTH}
        />

        {/* ── 5. Toolbar — ON the frame in the top-margin strip ── */}
        <rect
          x={tb.x} y={tb.y} width={tb.w} height={tb.h} rx={tb.r}
          fill="#1a1612" fillOpacity={0.6}
          stroke="url(#hexStroke)" strokeWidth={2}
        />

        {/* ── 5b. Toolbar icon buttons ── */}
        {TB_BTNS.map((def, i) => {
          const x   = bx(i)
          const dis = isBtnOff(def.key)
          const act = openMenu === def.key || (def.key === 'move' && movePending)
          return (
            <g key={def.key}
               data-testid={`toolbar-btn-${def.key}`}
               style={{ cursor: dis ? 'default' : 'pointer', pointerEvents: 'auto' }}
               onClick={() => !dis && onIcon(def)}
            >
              <rect x={x} y={btnY0} width={btnW} height={btnH} rx={6}
                fill={dis ? '#24201a' : act ? '#3a3020' : '#252018'}
                stroke={dis ? '#3a3020' : act ? '#c8a040' : '#5a4830'}
                strokeWidth={act ? 2 : 1}
              />
              <text
                x={x + btnW / 2} y={btnY0 + btnH * 0.38}
                textAnchor="middle" dominantBaseline="central"
                fontSize={16} style={{ pointerEvents: 'none' }}
                opacity={dis ? 0.55 : 1}
              >
                {def.icon}
              </text>
              {btnW > 24 && (
                <text
                  x={x + btnW / 2} y={btnY0 + btnH - 4}
                  textAnchor="middle" dominantBaseline="auto"
                  fontSize={7} fill={dis ? '#6a6050' : '#b0a080'}
                  style={{ pointerEvents: 'none' }}
                >
                  {def.label.length > 6 ? def.label.slice(0, 5) + '…' : def.label}
                </text>
              )}
              <title>{def.label}{def.key === 'move' ? ` (${moveFt}ft)` : ''}</title>
            </g>
          )
        })}

        {/* ── 6. Decorative ribbon banner ── */}
        {activeCharacter?.name && (() => {
          const bH    = Math.round(port.r * 0.3)
          const bTopY = port.cy + port.r * 0.75
          const midY  = bTopY + bH / 2

          const dyMid    = midY - port.cy
          const halfMid  = Math.sqrt(Math.max(0, port.r ** 2 - dyMid ** 2))
          const chordH   = halfMid * 0.95
          const tipLen   = 24
          const tipX     = chordH + tipLen

          const bp = [
            `M ${port.cx - chordH},${bTopY}`,
            `L ${port.cx + chordH},${bTopY}`,
            `L ${port.cx + tipX},${midY}`,
            `L ${port.cx + chordH},${bTopY + bH}`,
            `L ${port.cx - chordH},${bTopY + bH}`,
            `L ${port.cx - tipX},${midY}`,
            'Z',
          ].join(' ')

          return (
            <g>
              <path d={bp} fill="url(#bannerGrad)" />
              <path d={bp} fill="none" stroke="url(#hexStroke)" strokeWidth={1.5} />
              <line x1={port.cx - chordH + 5} y1={bTopY + 4}
                    x2={port.cx + chordH - 5} y2={bTopY + 4}
                    stroke="#9a7a40" strokeWidth={1} opacity={0.7} />
              <line x1={port.cx - chordH + 5} y1={bTopY + bH - 4}
                    x2={port.cx + chordH - 5} y2={bTopY + bH - 4}
                    stroke="#3a2c14" strokeWidth={1} opacity={0.5} />
              <line x1={port.cx + chordH} y1={bTopY + 4}
                    x2={port.cx + chordH} y2={bTopY + bH - 4}
                    stroke="#6a5028" strokeWidth={1} opacity={0.65} />
              <line x1={port.cx - chordH} y1={bTopY + 4}
                    x2={port.cx - chordH} y2={bTopY + bH - 4}
                    stroke="#6a5028" strokeWidth={1} opacity={0.65} />
              <circle cx={port.cx + tipX - 5} cy={midY} r={2.5} fill="#9a7a40" />
              <circle cx={port.cx - tipX + 5} cy={midY} r={2.5} fill="#9a7a40" />
              <text
                x={port.cx} y={midY}
                textAnchor="middle" dominantBaseline="central"
                fill="#e8d8a8" fontSize={Math.round(bH * 0.52)}
                fontWeight="600" fontFamily="Georgia, 'Times New Roman', serif"
                letterSpacing="0.08em"
              >
                {activeCharacter.name}
              </text>
            </g>
          )
        })()}

        {/* ── 7. Connector accent ── */}
        <line
          x1={conn.x1} y1={conn.y1} x2={conn.x2} y2={conn.y2}
          stroke="url(#hexStroke)" strokeWidth={2} strokeLinecap="round"
        />

        {/* ── 7c. Encounter Load button — triangular yield sign ── */}
        <g
          data-testid="load-encounter-btn"
          style={{ cursor: 'pointer', pointerEvents: 'auto' }}
          onClick={() => onToggleEncounterModal?.()}
        >
          <polygon
            points={encBtn.pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}
            fill="#1e1a16" stroke="url(#hexStroke)" strokeWidth={2}
            strokeLinejoin="round"
          />
          {/* Inner highlight triangle */}
          <polygon
            points={encBtn.pts.map(([px, py]) => {
              const dx = px - encBtn.cx, dy = py - encBtn.cy
              return (encBtn.cx + dx * 0.7).toFixed(1) + ',' + (encBtn.cy + dy * 0.7).toFixed(1)
            }).join(' ')}
            fill="none" stroke="#4a3c28" strokeWidth={1} opacity={0.6}
          />
          {/* Crossed swords icon */}
          <text
            x={encBtn.cx} y={encBtn.cy}
            textAnchor="middle" dominantBaseline="central"
            fontSize={encBtn.size * 0.7} style={{ pointerEvents: 'none' }}
          >
            {'\u2694\uFE0F'}
          </text>
          <title>Load Encounter</title>
        </g>

        {/* ── 7b. Active effects display — below portrait ── */}
        {combatantState && <ActiveEffectsDisplay port={port} combatantState={combatantState} />}

        {/* ── 8. Flyout menus (foreignObject) ── */}
        {openMenu && flyIdx >= 0 && (
          <foreignObject
            x={Math.max(0, Math.min(flyX, dims.w - 248))}
            y={flyY}
            width={248}
            height={Math.min(420, dims.h - flyY - 8)}
            style={{ overflow: 'visible' }}
          >
            <div
              ref={flyoutRef}
              xmlns="http://www.w3.org/1999/xhtml"
              style={{
                background: 'linear-gradient(180deg, #2a2622, #1a1816)',
                border: '1px solid #5a4830',
                borderRadius: 8,
                padding: '6px 0',
                maxHeight: 400,
                overflowY: 'auto',
                pointerEvents: 'auto',
                boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
                fontFamily: "'Segoe UI', system-ui, sans-serif",
                fontSize: 12,
                color: '#d4cbb8',
              }}
            >

              {/* ── Attack flyout ── */}
              {openMenu === 'attack' && (serverMenu
                ? (serverMenu.actions || []).filter(a => a.type === 'attack' || a.type === 'breath_weapon').map(a => (
                    <FlyItem key={a.optionId} icon={a.type === 'breath_weapon' ? '🐉' : '⚔️'} disabled={isResolving}
                      testId={`flyout-attack-${a.optionId}`}
                      onClick={() => fire(a.type, { optionId: a.optionId, ...a })}>
                      {a.label}
                    </FlyItem>
                  ))
                : (
                  <>
                    {weapons.map(w => (
                      <FlyItem key={w.id} icon={w.icon} disabled={actUsed}
                        onClick={() => fire('attack', w)}>
                        {w.name}{' '}
                        <span style={{ color: '#665', fontSize: 10 }}>
                          (+{w.attackBonus}, {w.damage})
                        </span>
                      </FlyItem>
                    ))}
                    {attackFeatures.map(f => (
                      <FlyItem key={f.id} icon={f.icon} disabled={actUsed || (f.uses !== undefined && f.uses <= 0)}
                        onClick={() => fire('attack', { ...f, featureAttack: true })}>
                        {f.name}{' '}
                        <span style={{ color: '#665', fontSize: 10 }}>
                          ({f.description})
                        </span>
                        {f.uses !== undefined && (
                          <span style={{ color: '#886', fontSize: 10, marginLeft: 4 }}>
                            [{f.uses}/{f.maxUses}]
                          </span>
                        )}
                      </FlyItem>
                    ))}
                  </>
                )
              )}

              {/* ── Loot flyout ── */}
              {openMenu === 'loot' && serverMenu && (
                (serverMenu.actions || []).filter(a => a.type === 'loot_corpse').map(a => (
                  <FlyItem key={a.optionId} icon={'\uD83D\uDC80'} disabled={isResolving}
                    testId={`flyout-loot-${a.optionId}`}
                    onClick={() => fire('loot_corpse', { optionId: a.optionId, ...a })}>
                    {a.label || `Loot ${a.corpseName || 'corpse'}`}
                  </FlyItem>
                ))
              )}

              {/* ── Spell flyout ── */}
              {openMenu === 'spell' && (serverMenu
                ? (serverMenu.actions || []).filter(a => a.type === 'spell').map(a => (
                    <FlyItem key={a.optionId} icon="✨" disabled={isResolving}
                      testId={`flyout-spell-${a.optionId}`}
                      onClick={() => fire('spell', { optionId: a.optionId, ...a })}>
                      {a.label}
                    </FlyItem>
                  ))
                : (
                  <>
                    {cantrxs.map(s => (
                      <FlyItem key={s.id} icon={s.icon} disabled={actUsed}
                        onClick={() => fire('spell', s)}>
                        {s.name}{' '}
                        <span style={{ color: '#665', fontSize: 10 }}>(cantrip)</span>
                      </FlyItem>
                    ))}
                    {cantrxs.length > 0 && actionSpells.length > 0 && (
                      <div style={{ borderTop: '1px solid #333', margin: '4px 8px' }} />
                    )}
                    {actionSpells.map(s => {
                      const off = !canCast(s, budget)
                      return (
                        <FlyItem key={s.id} icon={s.icon} disabled={off}
                          onClick={() => fire('spell', s)}>
                          {s.name}
                          <span style={{ color: '#665', fontSize: 10 }}>
                            {' '}(L{s.level}{s.concentration ? ' C' : ''})
                          </span>
                        </FlyItem>
                      )
                    })}
                    <div style={{ borderTop: '1px solid #333', margin: '4px 8px' }} />
                    <div style={{ padding: '2px 12px' }}>
                      {Object.keys(maxSlots).sort().map(lvl => {
                        const max = maxSlots[lvl] ?? 0
                        const cur = (budget?.spellSlots ?? {})[Number(lvl)] ?? 0
                        return (
                          <div key={lvl} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                            <span style={{ color: '#665', fontSize: 9, minWidth: 12 }}>{lvl}</span>
                            {Array.from({ length: max }, (_, i) => (
                              <span key={i} style={{
                                display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                                background: i < cur ? (LVL_COLORS[Number(lvl)] ?? '#a88') : '#222',
                                border: `1px solid ${i < cur ? 'rgba(255,255,255,0.2)' : '#333'}`,
                                marginRight: 2,
                              }} />
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )
              )}

              {/* ── Bonus flyout ── */}
              {openMenu === 'bonus' && (serverMenu
                ? (serverMenu.bonusActions || []).map(a => (
                    <FlyItem key={a.optionId} icon="⚡" disabled={isResolving}
                      testId={`flyout-bonus-${a.optionId}`}
                      onClick={() => fire(a.optionId?.startsWith('spell:') ? 'bonusSpell' : 'bonusFeature', { optionId: a.optionId, ...a })}>
                      {a.label}
                    </FlyItem>
                  ))
                : (
                  <>
                    {bonusSpells.map(s => (
                      <FlyItem key={s.id} icon={s.icon}
                        disabled={bonUsed || !canCast(s, budget)}
                        onClick={() => fire('bonusSpell', s)}>
                        {s.name}
                        <span style={{ color: '#665', fontSize: 10 }}>
                          {' '}(L{s.level}{s.concentration ? ' C' : ''})
                        </span>
                      </FlyItem>
                    ))}
                    {bonusFeats.map(f => {
                      const left = usesLeft(f, features, budget)
                      return (
                        <FlyItem key={f.id} icon={f.icon}
                          disabled={bonUsed || left <= 0}
                          onClick={() => fire('bonusFeature', f)}>
                          {f.name}
                          <span style={{ color: '#665', fontSize: 10 }}> ({left})</span>
                        </FlyItem>
                      )
                    })}
                  </>
                )
              )}

              {/* ── Reaction flyout ── */}
              {openMenu === 'react' && (serverMenu
                ? (serverMenu.reactions || []).map(a => (
                    <FlyItem key={a.optionId} icon="🔄" disabled={isResolving}
                      testId={`flyout-${a.optionId}`}
                      onClick={() => fire(a.optionId?.startsWith('spell:') ? 'reactionSpell' : 'reactionFeature', { optionId: a.optionId, ...a })}>
                      {a.label}
                    </FlyItem>
                  ))
                : (
                  <>
                    {reactionSpells.map(s => (
                      <FlyItem key={s.id} icon={s.icon}
                        disabled={reaUsed || !canCast(s, budget)}
                        onClick={() => fire('reactionSpell', s)}>
                        {s.name}
                        <span style={{ color: '#665', fontSize: 10 }}>
                          {' '}(L{s.level})
                        </span>
                      </FlyItem>
                    ))}
                    {reactionFeats.map(f => {
                      const left = usesLeft(f, features, budget)
                      return (
                        <FlyItem key={f.id} icon={f.icon}
                          disabled={reaUsed || left <= 0}
                          onClick={() => fire('reactionFeature', f)}>
                          {f.name}
                          <span style={{ color: '#665', fontSize: 10 }}> ({left})</span>
                        </FlyItem>
                      )
                    })}
                  </>
                )
              )}

            </div>
          </foreignObject>
        )}
      </svg>

      {/* ── Beast Form Picker (Polymorph) ── */}
      {beastFormMode && availableBeastForms && availableBeastForms.length > 0 && (
        <BeastFormPicker
          forms={availableBeastForms}
          onSelect={onBeastFormSelect}
        />
      )}

      {/* ── Editor toggle — outside SVG for normal pointer-events ── */}
      <button
        className={`editor-toggle${editorMode ? ' editor-toggle--active' : ''}`}
        onClick={onToggleEditor}
        title="Toggle Map Editor"
      >
        &#9881;
      </button>

      {editorMode && (
        <div className="editor-overlay">
          <div className="editor-overlay__title">Map Editor</div>
          <div className="editor-overlay__row">
            <span className="editor-overlay__label">Tool</span>
            {['terrain', 'entity', 'inspect'].map(t => (
              <button
                key={t}
                className={`editor-overlay__btn${editorTool === t ? ' editor-overlay__btn--active' : ''}`}
                onClick={() => onToolChange?.(t)}
              >
                {t}
              </button>
            ))}
          </div>
          {editorTool === 'terrain' && terrainTypes && (
            <div className="editor-overlay__row">
              <span className="editor-overlay__label">Brush</span>
              <select
                className="editor-overlay__select"
                value={editorBrush}
                onChange={e => onBrushChange?.(e.target.value)}
              >
                {terrainTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}
          <div className="editor-overlay__row">
            <button className="editor-overlay__btn" onClick={onSave}>Save</button>
            <button className="editor-overlay__btn" onClick={onLoad}>Load</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Flyout menu item ────────────────────────────────────────────────────────

function FlyItem({ icon, disabled, onClick, children, testId }) {
  return (
    <div
      data-testid={testId}
      style={{
        padding: '5px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        background: 'transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = '#3a3020' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      onClick={() => { if (!disabled) onClick?.() }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span>{children}</span>
    </div>
  )
}

// ── Beast Form Picker ─────────────────────────────────────────────────────────

/**
 * BeastFormPicker — Polymorph beast selection overlay.
 *
 * Grouped by CR (highest first), scrollable, with a text search filter.
 * Maintains all existing data-testid attributes for E2E compatibility.
 */
function BeastFormPicker({ forms, onSelect }) {
  const [search, setSearch] = useState('')
  const [collapsedCRs, setCollapsedCRs] = useState(new Set())
  const searchRef = useRef(null)

  // Auto-focus the search input when the picker mounts
  useEffect(() => { searchRef.current?.focus() }, [])

  // Filter forms by search text (name or weapon names)
  const filtered = useMemo(() => {
    if (!search.trim()) return forms
    const q = search.toLowerCase().trim()
    return forms.filter(f => {
      if (f.name.toLowerCase().includes(q)) return true
      if (f.weapons?.some(w => w.name.toLowerCase().includes(q))) return true
      return false
    })
  }, [forms, search])

  // Group filtered forms by CR, sorted descending
  const grouped = useMemo(() => {
    const map = new Map()
    for (const f of filtered) {
      const cr = f.cr ?? 0
      if (!map.has(cr)) map.set(cr, [])
      map.get(cr).push(f)
    }
    // Sort within each CR by name
    for (const arr of map.values()) arr.sort((a, b) => a.name.localeCompare(b.name))
    // Return entries sorted by CR descending
    return [...map.entries()].sort((a, b) => b[0] - a[0])
  }, [filtered])

  const toggleCR = (cr) => {
    setCollapsedCRs(prev => {
      const next = new Set(prev)
      next.has(cr) ? next.delete(cr) : next.add(cr)
      return next
    })
  }

  const crLabel = (cr) => cr === 0 ? 'CR 0' : `CR ${cr}`

  return (
    <div data-testid="beast-form-picker" style={{
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      zIndex: 400, pointerEvents: 'auto',
      background: 'rgba(20, 16, 12, 0.97)', border: '2px solid #8a6a30',
      borderRadius: 12, padding: 0,
      width: 420, maxHeight: '80vh',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Georgia, serif', color: '#e8d8a8',
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    }}>
      {/* Header + search — fixed at top */}
      <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid #3a3020', flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, textAlign: 'center', color: '#f0d060' }}>
          🦎 Choose Beast Form
        </div>
        <input
          ref={searchRef}
          data-testid="beast-form-search"
          type="text"
          placeholder="Search beasts..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '7px 10px', borderRadius: 6,
            background: '#1a1410', border: '1px solid #4a3a20',
            color: '#e8d8a8', fontSize: 13, fontFamily: 'Georgia, serif',
            outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = '#8a6a30' }}
          onBlur={e => { e.target.style.borderColor = '#4a3a20' }}
        />
        <div style={{ fontSize: 10, color: '#706050', marginTop: 4, textAlign: 'right' }}>
          {filtered.length} beast{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{
        overflowY: 'auto', flex: 1, padding: '6px 12px 12px',
        scrollbarWidth: 'thin',
      }}>
        {grouped.length === 0 && (
          <div style={{ textAlign: 'center', color: '#665', fontStyle: 'italic', padding: 16 }}>
            No beasts match "{search}"
          </div>
        )}

        {grouped.map(([cr, crForms]) => {
          const collapsed = collapsedCRs.has(cr)
          return (
            <div key={cr} style={{ marginBottom: 6 }}>
              {/* CR group header — clickable to collapse */}
              <div
                data-testid={`beast-cr-group-${cr}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 6px', cursor: 'pointer', userSelect: 'none',
                  borderBottom: '1px solid #2a2218',
                }}
                onClick={() => toggleCR(cr)}
              >
                <span style={{ fontSize: 10, color: '#a09070', width: 14, textAlign: 'center' }}>
                  {collapsed ? '▶' : '▼'}
                </span>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#d0b870' }}>
                  {crLabel(cr)}
                </span>
                <span style={{ fontSize: 10, color: '#706050' }}>
                  ({crForms.length})
                </span>
              </div>

              {/* Beast cards within CR group */}
              {!collapsed && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0 2px 20px' }}>
                  {crForms.map(form => (
                    <BeastFormCard key={form.name} form={form} onSelect={onSelect} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * BeastFormCard — Single beast option in the picker.
 * Shows portrait token, name, stats, and attacks. Preserves data-testid for E2E.
 */
function BeastFormCard({ form, onSelect }) {
  const weaponDesc = (form.weapons || []).map(w => w.name).join(', ') || 'No attacks'
  const portraitUrl = form.portraitUrl || `/portraits/beasts/${form.name.replace(/\s+/g, '-').toLowerCase()}.svg`
  const crText = `CR ${form.cr ?? 0}`
  return (
    <div
      data-testid={`beast-form-${form.name.replace(/\s+/g, '-').toLowerCase()}`}
      style={{
        padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
        background: '#2a2218', border: '1px solid #3a2e1a',
        transition: 'background 0.15s, border-color 0.15s',
        display: 'flex', alignItems: 'center', gap: 10,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#3a3020'; e.currentTarget.style.borderColor = '#8a6a30' }}
      onMouseLeave={e => { e.currentTarget.style.background = '#2a2218'; e.currentTarget.style.borderColor = '#3a2e1a' }}
      onClick={() => onSelect?.(form.name)}
    >
      {/* Beast portrait token */}
      <img
        src={portraitUrl}
        alt={form.name}
        style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          border: '1px solid #4a3a20', objectFit: 'cover',
          background: '#1a2020',
        }}
        onError={e => { e.target.style.display = 'none' }}
      />
      {/* Stats */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>{form.name}</span>
          <span style={{ fontSize: 10, color: '#a09070', whiteSpace: 'nowrap' }}>
            {crText} · HP {form.maxHP} · AC {form.ac || 10} · Spd {form.speed || 30}
            {form.flying ? ' · 🪽' : ''}
          </span>
        </div>
        <div style={{ fontSize: 10, color: '#908060', marginTop: 2 }}>
          {form.multiattack > 0 && <span style={{ marginRight: 8 }}>Multi×{form.multiattack}</span>}
          {weaponDesc}
        </div>
      </div>
    </div>
  )
}

// ─── Condition/Effect icon + label mapping ───────────────────────────────────

const CONDITION_INFO = {
  polymorphed:    { icon: '\uD83D\uDC3B', label: 'Polymorphed', color: '#6ac' },
  charmed_hp:     { icon: '\uD83D\uDC9C', label: 'Charmed',     color: '#c6a' },
  charmed:        { icon: '\uD83D\uDC9C', label: 'Charmed',     color: '#c6a' },
  incapacitated:  { icon: '\uD83D\uDCA4', label: 'Incapacitated', color: '#a88' },
  paralyzed:      { icon: '\u26D3\uFE0F', label: 'Paralyzed',   color: '#a66' },
  stunned:        { icon: '\u2B50',        label: 'Stunned',     color: '#cc8' },
  unconscious:    { icon: '\uD83D\uDCA4', label: 'Unconscious', color: '#866' },
  asleep:         { icon: '\uD83D\uDCA4', label: 'Asleep',      color: '#88a' },
  frightened:     { icon: '\uD83D\uDE28', label: 'Frightened',  color: '#a8a' },
  invisible:      { icon: '\uD83D\uDC7B', label: 'Invisible',   color: '#aac' },
  faerie_fire:    { icon: '\u2728',        label: 'Faerie Fire', color: '#ca8' },
  blinded:        { icon: '\uD83D\uDE36', label: 'Blinded',     color: '#888' },
  deafened:       { icon: '\uD83D\uDD07', label: 'Deafened',    color: '#888' },
  poisoned:       { icon: '\u2620\uFE0F', label: 'Poisoned',    color: '#8a6' },
  restrained:     { icon: '\uD83E\uDE24', label: 'Restrained',  color: '#a86' },
  prone:          { icon: '\u2B07\uFE0F', label: 'Prone',       color: '#886' },
  grappled:       { icon: '\u270A',        label: 'Grappled',    color: '#a86' },
  dodging:        { icon: '\uD83D\uDEE1\uFE0F', label: 'Dodging', color: '#6a8' },
}

/**
 * ActiveEffectsDisplay — Shows active conditions, concentration status, and
 * spell duration below the portrait circle in the HUD SVG.
 * Uses foreignObject for HTML rendering inside the SVG.
 */
function ActiveEffectsDisplay({ port, combatantState }) {
  const conditions = combatantState.conditions || []
  const concentrating = combatantState.concentrating || null
  const roundsLeft = combatantState.concentrationRoundsRemaining || 0
  const polymorphedAs = combatantState.polymorphedAs || null

  // Build effect list: concentration first, then conditions (deduplicated display)
  const effects = []

  if (concentrating) {
    effects.push({
      key: 'conc',
      icon: '\uD83D\uDD2E',
      label: concentrating,
      sublabel: roundsLeft > 0 ? `${roundsLeft} rd${roundsLeft !== 1 ? 's' : ''}` : null,
      color: '#e0c040',
      isConcentration: true,
    })
  }

  if (polymorphedAs && !effects.some(e => e.key === 'conc' && e.label === 'Polymorph')) {
    // Show polymorphed form (if not already shown via concentration)
    if (concentrating !== 'Polymorph') {
      effects.push({
        key: 'poly',
        icon: '\uD83D\uDC3B',
        label: polymorphedAs,
        sublabel: null,
        color: '#6ac',
      })
    }
  }

  // Add conditions (skip 'polymorphed' if we already show polymorph info)
  const seen = new Set()
  for (const c of conditions) {
    if (c === 'polymorphed' && (polymorphedAs || concentrating === 'Polymorph')) continue
    if (seen.has(c)) continue
    seen.add(c)
    const info = CONDITION_INFO[c] || { icon: '\u26A0\uFE0F', label: c, color: '#aa8' }
    effects.push({
      key: `cond-${c}`,
      icon: info.icon,
      label: info.label,
      sublabel: null,
      color: info.color,
    })
  }

  if (effects.length === 0) return null

  // Position below the portrait circle + name banner
  const foX = Math.max(4, port.cx - 100)
  const foY = port.cy + port.r + Math.round(port.r * 0.3) + 12

  return (
    <foreignObject x={foX} y={foY} width={200} height={effects.length * 26 + 8}
      style={{ overflow: 'visible', pointerEvents: 'none' }}
    >
      <div xmlns="http://www.w3.org/1999/xhtml" data-testid="active-effects"
        style={{
          display: 'flex', flexDirection: 'column', gap: 3,
          fontFamily: 'Georgia, serif', fontSize: 11,
        }}
      >
        {effects.map(eff => (
          <div key={eff.key} data-testid={`effect-${eff.key}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(10, 8, 6, 0.88)',
              border: `1px solid ${eff.color}44`,
              borderRadius: 5, padding: '2px 8px 2px 6px',
              color: eff.color,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: 13 }}>{eff.icon}</span>
            <span style={{ fontWeight: 600, fontSize: 11 }}>{eff.label}</span>
            {eff.isConcentration && (
              <span style={{ fontSize: 9, color: '#c8a040', marginLeft: 2 }}
                title="Requires concentration">
                CONC
              </span>
            )}
            {eff.sublabel && (
              <span style={{ fontSize: 9, color: '#887860', marginLeft: 'auto' }}>
                {eff.sublabel}
              </span>
            )}
          </div>
        ))}
      </div>
    </foreignObject>
  )
}
