import { useEffect, useRef, useState } from "react"
import { TERRAIN_COLOR, TERRAIN_STROKE } from "./battleMapSchema.js"

const RADIUS = 64
const HEX_SIZE = 28
const SQRT3 = Math.sqrt(3)

// Full hex-shaped grid, computed once at module level
const HEXES = []
for (let q = -RADIUS; q <= RADIUS; q++) {
  const r1 = Math.max(-RADIUS, -q - RADIUS)
  const r2 = Math.min(RADIUS, -q + RADIUS)
  for (let r = r1; r <= r2; r++) {
    HEXES.push({ q, r })
  }
}

// Pointy-top layout: flat top/bottom overall map
function toXY(q, r) {
  return {
    x: HEX_SIZE * (SQRT3 * q + SQRT3 / 2 * r),
    y: HEX_SIZE * 1.5 * r,
  }
}

function hexPath(ctx, cx, cy) {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6
    const x = cx + HEX_SIZE * Math.cos(a)
    const y = cy + HEX_SIZE * Math.sin(a)
    if (i === 0) { ctx.moveTo(x, y) } else { ctx.lineTo(x, y) }
  }
  ctx.closePath()
}

// Entity side -> token ring color
const SIDE_COLOR = {
  player:  '#4af',
  ally:    '#4c8',
  enemy:   '#f44',
  neutral: '#aa8',
}

export default function CombatHexCanvas({
  hexes = {},           // BattleMap.hexes — sparse "q,r" -> HexData
  entities = [],        // BattleMap.entities array
  corpses = [],         // Array of { id, name, position, looted, hasLoot } from server
  activeId = null,
  onHexClick = null,
  onHexHover = null,        // (q, r) => void — for AoE preview
  reachableHexKeys = null,  // Set<"q,r"> for movement range overlay (green)
  aoePreviewKeys = null,    // Set<"q,r"> for AoE area overlay (orange)
  validTargetIds = null,    // Set<entityId> for target selection highlighting
  interactionMode = 'idle', // 'idle' | 'move' | 'target' | 'aoe' | 'editor'
}) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const cam = useRef({ x: 0, y: 0, scale: 0.14 })
  const drag = useRef(null)
  const sizeRef = useRef({ w: 800, h: 600 })
  // Portrait image cache: url -> HTMLImageElement (loaded)
  const imgCache = useRef({})
  const scaledOnce = useRef(false)

  // Track container size; set initial zoom to 6-hex radius on first size
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      const w = Math.floor(width)
      const h = Math.floor(height)
      sizeRef.current = { w, h }
      if (!scaledOnce.current) {
        // scale so 6 hexes fit from center to edge of the shorter viewport dimension
        cam.current.scale = Math.min(w, h) / 2 / (6 * HEX_SIZE * SQRT3)
        scaledOnce.current = true
      }
      setSize({ w, h })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Build entity lookup for fast render
  const entityMap = {}
  for (const e of entities) {
    entityMap[`${e.q},${e.r}`] = e
  }

  function render(w, h) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = w + "px"
    canvas.style.height = h + "px"
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Background
    ctx.fillStyle = "#111"
    ctx.fillRect(0, 0, w, h)

    ctx.save()
    ctx.translate(w / 2 + cam.current.x, h / 2 + cam.current.y)
    ctx.scale(cam.current.scale, cam.current.scale)

    // Draw all hex tiles
    for (let i = 0; i < HEXES.length; i++) {
      const { q, r } = HEXES[i]
      const key = `${q},${r}`
      const hexData = hexes[key]
      const terrain = hexData?.terrain ?? "open"
      const elevation = hexData?.elevation ?? 0
      const { x, y } = toXY(q, r)

      // Elevation-based brightness shift
      const bright = elevation > 0 ? Math.min(elevation * 12, 60) : 0

      hexPath(ctx, x, y)
      ctx.fillStyle = shiftBrightness(TERRAIN_COLOR[terrain] ?? "#2a2010", bright)
      ctx.fill()
      ctx.strokeStyle = TERRAIN_STROKE[terrain] ?? "#4a3a20"
      ctx.lineWidth = 1
      ctx.stroke()

      // Elevation label (only when zoomed in enough)
      if (elevation !== 0 && cam.current.scale > 0.4) {
        ctx.fillStyle = "rgba(255,255,200,0.7)"
        ctx.font = `${HEX_SIZE * 0.35}px sans-serif`
        ctx.textAlign = "center"
        ctx.textBaseline = "bottom"
        ctx.fillText(elevation > 0 ? `+${elevation}` : `${elevation}`, x, y + HEX_SIZE * 0.3)
      }
    }

    // Movement range overlays
    if (reachableHexKeys && reachableHexKeys.size > 0) {
      for (let i = 0; i < HEXES.length; i++) {
        const { q, r } = HEXES[i]
        const key = `${q},${r}`
        if (!reachableHexKeys.has(key)) continue
        const { x, y } = toXY(q, r)
        hexPath(ctx, x, y)
        ctx.fillStyle = 'rgba(40, 200, 80, 0.22)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(60, 220, 90, 0.55)'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }

    // AoE preview overlays (orange)
    if (aoePreviewKeys && aoePreviewKeys.size > 0) {
      for (let i = 0; i < HEXES.length; i++) {
        const { q, r } = HEXES[i]
        const key = `${q},${r}`
        if (!aoePreviewKeys.has(key)) continue
        const { x, y } = toXY(q, r)
        hexPath(ctx, x, y)
        ctx.fillStyle = 'rgba(255, 140, 20, 0.25)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(255, 160, 40, 0.65)'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }

    // Draw corpse markers (behind living entities)
    for (const corpse of corpses) {
      if (!corpse.position) continue
      const { x, y } = toXY(corpse.position.q, corpse.position.r)
      const cr = HEX_SIZE * 0.52

      // Dark circle base
      ctx.beginPath()
      ctx.arc(x, y, cr, 0, Math.PI * 2)
      ctx.fillStyle = corpse.looted ? 'rgba(30, 25, 20, 0.5)' : 'rgba(50, 20, 15, 0.65)'
      ctx.fill()

      // Skull icon
      ctx.fillStyle = corpse.looted ? 'rgba(120, 100, 80, 0.4)' : 'rgba(200, 180, 140, 0.7)'
      ctx.font = `${HEX_SIZE * 0.48}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('\u{1F480}', x, y)

      // Loot sparkle indicator (unlooted with loot)
      if (!corpse.looted && corpse.hasLoot) {
        ctx.fillStyle = 'rgba(255, 215, 60, 0.8)'
        ctx.font = `${HEX_SIZE * 0.24}px sans-serif`
        ctx.fillText('\u2728', x + cr * 0.6, y - cr * 0.5)
      }

      // Thin border
      ctx.beginPath()
      ctx.arc(x, y, cr, 0, Math.PI * 2)
      ctx.lineWidth = 1
      ctx.strokeStyle = corpse.looted ? 'rgba(80, 60, 40, 0.3)' : 'rgba(140, 60, 40, 0.5)'
      ctx.stroke()
    }

    // Draw entities on top
    for (const e of entities) {
      const { x, y } = toXY(e.q, e.r)
      const r = HEX_SIZE * 0.72
      const isActive = e.id === activeId
      const isValidTarget = validTargetIds && validTargetIds.has(e.id)

      const isDead = (e.hp != null && e.hp <= 0)

      // Target selection glow ring (pulsing)
      if (isValidTarget) {
        ctx.beginPath()
        ctx.arc(x, y, r + 4, 0, Math.PI * 2)
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(255, 220, 60, 0.8)'
        ctx.stroke()
        // Outer glow
        ctx.beginPath()
        ctx.arc(x, y, r + 7, 0, Math.PI * 2)
        ctx.lineWidth = 2
        ctx.strokeStyle = 'rgba(255, 220, 60, 0.3)'
        ctx.stroke()
      }

      // Portrait image or initials fallback
      const portrait = e.portraitUrl ? imgCache.current[e.portraitUrl] : null
      if (portrait) {
        ctx.save()
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.clip()

        // Crop strategy: v2 tokens are square-centered (full square), legacy photos use top-65% face crop
        const iw = portrait.naturalWidth
        const ih = portrait.naturalHeight
        const isV2Token = e.portraitUrl?.includes('/portraits/v2/')
        const cropSize = isV2Token ? Math.min(iw, ih) : Math.min(iw, ih * 0.65)
        const sx = (iw - cropSize) / 2            // center horizontally
        const sy = isV2Token ? 0 : ih * 0.02       // v2: full square; legacy: skip 2% top border
        ctx.drawImage(portrait, sx, sy, cropSize, cropSize, x - r, y - r, r * 2, r * 2)
        ctx.restore()
      } else {
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = e.side === "player" ? "#1a2633" : e.side === "ally" ? "#142614" : "#331414"
        ctx.fill()
        const initials = getInitials(e.name)
        ctx.fillStyle = "#eee"
        ctx.font = `bold ${HEX_SIZE * 0.38}px sans-serif`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(initials, x, y)
      }

      // Thin border only — no glow ring
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.lineWidth = isActive ? 2 : 1
      ctx.strokeStyle = isActive ? (SIDE_COLOR[e.side] ?? "#888") : "rgba(255,255,255,0.2)"
      ctx.stroke()

      // Dead overlay: darken + red-X mark
      if (isDead) {
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
        ctx.fill()
        // Red X
        const xr = r * 0.45
        ctx.strokeStyle = 'rgba(180, 40, 30, 0.7)'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(x - xr, y - xr)
        ctx.lineTo(x + xr, y + xr)
        ctx.moveTo(x + xr, y - xr)
        ctx.lineTo(x - xr, y + xr)
        ctx.stroke()
      }
    }

    ctx.restore()
  }

  function redraw() {
    const { w, h } = sizeRef.current
    render(w, h)
  }

  // Load portrait images for entities that have a portraitUrl
  useEffect(() => {
    let dirty = false
    for (const e of entities) {
      if (e.portraitUrl && !imgCache.current[e.portraitUrl]) {
        const img = new Image()
        img.src = e.portraitUrl
        img.onload = () => {
          imgCache.current[e.portraitUrl] = img
          redraw()
        }
        imgCache.current[e.portraitUrl] = null // mark loading
        dirty = true
      }
    }
    if (!dirty) redraw()
  }, [entities])

  // Re-render when size, hexes, entities, or overlay states change
  useEffect(() => {
    render(size.w, size.h)
  }, [size, hexes, entities, corpses, activeId, reachableHexKeys, aoePreviewKeys, validTargetIds])

  // Input handlers
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onWheel = (e) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 0.9
      cam.current = { ...cam.current, scale: Math.min(6, Math.max(0.05, cam.current.scale * factor)) }
      redraw()
    }

    const onDown = (e) => {
      drag.current = { x: e.clientX, y: e.clientY, moved: false }
    }

    const onMove = (e) => {
      if (!drag.current) {
        // Not dragging — fire hex hover for AoE preview
        if (onHexHover) {
          const { w, h } = sizeRef.current
          const rect = canvas.getBoundingClientRect()
          const cx = e.clientX - rect.left
          const cy = e.clientY - rect.top
          const wx = (cx - w / 2 - cam.current.x) / cam.current.scale
          const wy = (cy - h / 2 - cam.current.y) / cam.current.scale
          const { q, r } = pixelToHex(wx, wy)
          const dist = (Math.abs(q) + Math.abs(q + r) + Math.abs(r)) / 2
          if (dist <= RADIUS) onHexHover(q, r)
        }
        return
      }
      const dx = e.clientX - drag.current.x
      const dy = e.clientY - drag.current.y
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.current.moved = true
      drag.current.x = e.clientX
      drag.current.y = e.clientY
      cam.current = { ...cam.current, x: cam.current.x + dx, y: cam.current.y + dy }
      redraw()
    }

    const onUp = (e) => {
      if (drag.current && !drag.current.moved && onHexClick) {
        // Convert click to world coords -> find hex
        const { w, h } = sizeRef.current
        const rect = canvas.getBoundingClientRect()
        const cx = e.clientX - rect.left
        const cy = e.clientY - rect.top
        const wx = (cx - w / 2 - cam.current.x) / cam.current.scale
        const wy = (cy - h / 2 - cam.current.y) / cam.current.scale
        const { q, r } = pixelToHex(wx, wy)
        const dist = (Math.abs(q) + Math.abs(q + r) + Math.abs(r)) / 2
        if (dist <= RADIUS) onHexClick(q, r)
      }
      drag.current = null
    }

    canvas.addEventListener("wheel", onWheel, { passive: false })
    canvas.addEventListener("pointerdown", onDown)
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      canvas.removeEventListener("wheel", onWheel)
      canvas.removeEventListener("pointerdown", onDown)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [size, onHexClick, onHexHover])

  // Cursor style based on interaction mode
  const cursorStyle = interactionMode === 'target' ? 'crosshair'
    : interactionMode === 'aoe' ? 'crosshair'
    : interactionMode === 'move' ? 'pointer'
    : 'default'

  return (
    <div ref={containerRef} style={{ position: "fixed", inset: 0, overflow: "hidden", background: "#111", cursor: cursorStyle }}>
      <canvas ref={canvasRef} style={{ display: "block" }} />
    </div>
  )
}

// Pointy-top pixel -> axial hex coordinate
function pixelToHex(x, y) {
  const q = Math.round((SQRT3 / 3 * x - 1 / 3 * y) / HEX_SIZE)
  const r = Math.round((2 / 3 * y) / HEX_SIZE)
  return { q, r }
}

function getInitials(name) {
  if (!name) return "?"
  const parts = name.trim().replace(/[^a-zA-Z0-9 ]/g, "").split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function shiftBrightness(hex, amount) {
  if (amount === 0) return hex
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, ((n >> 16) & 0xff) + amount)
  const g = Math.min(255, ((n >> 8) & 0xff) + amount)
  const b = Math.min(255, (n & 0xff) + amount)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`
}
