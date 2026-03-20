/**
 * HexMap.jsx
 *
 * Renders a flat-top SVG hexagonal grid.
 *
 * Coordinate system: axial (q, r)
 *   Flat-top hex pixel conversion:
 *     x = hexSize * (3/2 * q)
 *     y = hexSize * (sqrt(3)/2 * q + sqrt(3) * r)
 *
 * Props:
 *   width    {number}  – SVG viewport width in px
 *   height   {number}  – SVG viewport height in px
 *   hexSize  {number}  – radius (centre to corner) of each hex
 *   tokens   {Array}   – [{ id, q, r, color, label }] — entities on the map
 *   onHexClick {Function} – optional callback(q, r) when a hex is clicked
 */

import { useState, useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'

// ── Geometry helpers ──────────────────────────────────────────────────────────

/**
 * Returns the 6 SVG polygon point strings for a flat-top hexagon centred at (cx, cy).
 * Flat-top: first point is at angle 0° (right side), increments by 60°.
 */
function hexCorners(cx, cy, size) {
  const corners = []
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i          // flat-top: 0°, 60°, 120°, ...
    const angleRad = (Math.PI / 180) * angleDeg
    corners.push(`${cx + size * Math.cos(angleRad)},${cy + size * Math.sin(angleRad)}`)
  }
  return corners.join(' ')
}

/**
 * Convert axial (q, r) to pixel (x, y) for flat-top hexagons.
 */
function axialToPixel(q, r, size) {
  const x = size * (3 / 2) * q
  const y = size * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r)
  return { x, y }
}

/**
 * Compute the bounding box needed to display qMin..qMax, rMin..rMax.
 * Returns an origin offset so all hexes are visible.
 */
function computeGridBounds(cols, rows, size) {
  const padding = size * 1.5
  const totalW = size * (3 / 2) * (cols - 1) + size * 2 + padding * 2
  const totalH = size * Math.sqrt(3) * rows + size + padding * 2
  return { offsetX: padding + size, offsetY: padding + size, totalW, totalH }
}

// ── Terrain colour palette ────────────────────────────────────────────────────
const TERRAIN_FILL = {
  open:      '#1e3a2f',
  difficult: '#2e2a1a',
  wall:      '#3a3a3a',
  water:     '#1a2a3e',
  forest:    '#1a2e1a',
  lava:      '#3e1a0a',
  void:      '#0a0a0a',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function HexCell({ q, r, cx, cy, size, terrain, isHovered, isSelected, onClick, onMouseEnter, onMouseLeave }) {
  const points = hexCorners(cx, cy, size - 1.5) // slight inset for visible border
  let fill = TERRAIN_FILL[terrain] ?? TERRAIN_FILL.open
  if (isSelected) fill = '#4a3a00'
  if (isHovered)  fill = '#2a4a3a'

  return (
    <polygon
      points={points}
      fill={fill}
      stroke={isSelected ? '#ffd700' : isHovered ? '#6af0a8' : '#2a4a3a'}
      strokeWidth={isSelected ? 2 : 1}
      style={{ cursor: 'pointer', transition: 'fill 0.1s' }}
      onClick={() => onClick(q, r)}
      onMouseEnter={() => onMouseEnter(q, r)}
      onMouseLeave={onMouseLeave}
    />
  )
}

function HexToken({ cx, cy, size, color, label }) {
  const r = size * 0.38
  return (
    <g pointerEvents="none">
      <circle cx={cx} cy={cy} r={r} fill={color} stroke="#fff" strokeWidth={1.5} opacity={0.9} />
      <text
        x={cx}
        y={cy + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#fff"
        fontSize={r * 0.9}
        fontWeight="bold"
        fontFamily="system-ui, sans-serif"
      >
        {label}
      </text>
    </g>
  )
}

function CoordLabel({ cx, cy, q, r, size }) {
  return (
    <text
      x={cx}
      y={cy + size * 0.55}
      textAnchor="middle"
      dominantBaseline="middle"
      fill="#3a5a4a"
      fontSize={size * 0.22}
      fontFamily="monospace"
      pointerEvents="none"
    >
      {q},{r}
    </text>
  )
}

// ── Main HexMap component ─────────────────────────────────────────────────────

export default function HexMap({
  width = 800,
  height = 500,
  hexSize = 44,
  tokens = [],
  terrainMap = {},        // key: `${q},${r}` → terrain string
  showCoords = false,
  onHexClick,
}) {
  const [hoveredHex, setHoveredHex] = useState(null) // { q, r }
  const [selectedHex, setSelectedHex] = useState(null)

  // Derive grid dimensions from the viewport size
  const cols = useMemo(() => Math.ceil(width  / (hexSize * 1.5)) + 1, [width, hexSize])
  const rows = useMemo(() => Math.ceil(height / (hexSize * Math.sqrt(3))) + 1, [height, hexSize])

  const { offsetX, offsetY } = useMemo(
    () => computeGridBounds(cols, rows, hexSize),
    [cols, rows, hexSize],
  )

  const handleHexClick = useCallback((q, r) => {
    setSelectedHex(prev => (prev?.q === q && prev?.r === r ? null : { q, r }))
    onHexClick?.(q, r)
  }, [onHexClick])

  // Build a lookup map from token coordinates for fast rendering.
  // Multiple tokens sharing the same hex are collected into an array.
  const tokenMap = useMemo(() => {
    const map = {}
    for (const t of tokens) {
      const key = `${t.q ?? t.x ?? 0},${t.r ?? t.y ?? 0}`
      if (!map[key]) map[key] = []
      map[key].push(t)
    }
    return map
  }, [tokens])

  // Generate all hex cells
  const hexCells = useMemo(() => {
    const cells = []
    for (let q = 0; q < cols; q++) {
      for (let r = -Math.floor(rows / 2); r < Math.ceil(rows / 2); r++) {
        const { x, y } = axialToPixel(q, r, hexSize)
        const cx = x + offsetX
        const cy = y + offsetY
        // Cull cells outside the visible viewport (with a one-cell margin)
        if (cx < -hexSize || cy < -hexSize || cx > width + hexSize || cy > height + hexSize) continue
        cells.push({ q, r, cx, cy })
      }
    }
    return cells
  }, [cols, rows, hexSize, offsetX, offsetY, width, height])

  return (
    <div style={{ borderRadius: 8, overflow: 'hidden', border: '2px solid #0f3460', display: 'inline-block' }}>
      {/* Info bar */}
      <div style={{
        background: '#0d1b2a',
        padding: '0.4rem 0.75rem',
        fontSize: '0.8rem',
        color: '#a8b2d8',
        display: 'flex',
        gap: '1.5rem',
      }}>
        <span>Grid: {cols}×{rows} hexes</span>
        <span>Hex size: {hexSize}px</span>
        {hoveredHex && <span>Hover: ({hoveredHex.q}, {hoveredHex.r})</span>}
        {selectedHex && <span style={{ color: '#ffd700' }}>Selected: ({selectedHex.q}, {selectedHex.r})</span>}
      </div>

      <svg
        width={width}
        height={height}
        style={{ display: 'block', background: '#0d1b2a' }}
        role="img"
        aria-label="Hex grid map"
      >
        {/* Hex cells layer */}
        <g id="hex-cells">
          {hexCells.map(({ q, r, cx, cy }) => (
            <HexCell
              key={`${q},${r}`}
              q={q} r={r} cx={cx} cy={cy} size={hexSize}
              terrain={terrainMap[`${q},${r}`] ?? 'open'}
              isHovered={hoveredHex?.q === q && hoveredHex?.r === r}
              isSelected={selectedHex?.q === q && selectedHex?.r === r}
              onClick={handleHexClick}
              onMouseEnter={(hq, hr) => setHoveredHex({ q: hq, r: hr })}
              onMouseLeave={() => setHoveredHex(null)}
            />
          ))}
        </g>

        {/* Optional coordinate labels */}
        {showCoords && (
          <g id="coord-labels">
            {hexCells.map(({ q, r, cx, cy }) => (
              <CoordLabel key={`lbl-${q},${r}`} cx={cx} cy={cy} q={q} r={r} size={hexSize} />
            ))}
          </g>
        )}

        {/* Token layer — rendered on top */}
        <g id="tokens">
          {hexCells.map(({ q, r, cx, cy }) => {
            const tokensAtHex = tokenMap[`${q},${r}`]
            if (!tokensAtHex) return null
            // Offset multiple tokens within the same hex so they don't overlap
            return tokensAtHex.map((token, idx) => {
              const total = tokensAtHex.length
              const angle = (2 * Math.PI * idx) / total
              const offsetDist = total > 1 ? hexSize * 0.28 : 0
              return (
                <HexToken
                  key={`tok-${token.id}`}
                  cx={cx + offsetDist * Math.cos(angle)}
                  cy={cy + offsetDist * Math.sin(angle)}
                  size={total > 1 ? hexSize * 0.55 : hexSize}
                  color={token.color ?? '#4fc3f7'}
                  label={token.label ?? '?'}
                />
              )
            })
          })}
        </g>

        {/* Legend */}
        <g id="legend" transform={`translate(${width - 130}, 12)`}>
          {[
            { fill: TERRAIN_FILL.open,      label: 'Open' },
            { fill: TERRAIN_FILL.difficult,  label: 'Difficult' },
            { fill: TERRAIN_FILL.wall,       label: 'Wall' },
            { fill: TERRAIN_FILL.water,      label: 'Water' },
            { fill: TERRAIN_FILL.forest,     label: 'Forest' },
          ].map(({ fill, label }, i) => (
            <g key={label} transform={`translate(0, ${i * 18})`}>
              <rect width={12} height={12} fill={fill} stroke="#2a4a3a" strokeWidth={0.5} />
              <text x={16} y={10} fill="#a8b2d8" fontSize={10} fontFamily="system-ui, sans-serif">{label}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}

HexMap.propTypes = {
  width:      PropTypes.number,
  height:     PropTypes.number,
  hexSize:    PropTypes.number,
  tokens:     PropTypes.arrayOf(PropTypes.shape({
    id:    PropTypes.string.isRequired,
    q:     PropTypes.number,
    r:     PropTypes.number,
    // legacy x/y aliases
    x:     PropTypes.number,
    y:     PropTypes.number,
    color: PropTypes.string,
    label: PropTypes.string,
  })),
  terrainMap: PropTypes.objectOf(PropTypes.string),
  showCoords: PropTypes.bool,
  onHexClick: PropTypes.func,
}
