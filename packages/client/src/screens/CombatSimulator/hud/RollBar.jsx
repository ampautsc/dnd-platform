import { useMemo } from 'react'

const DIE_TYPES = [4, 6, 8, 10, 12, 20]

const PURPOSE_LABELS = {
  attack: 'Attack',
  damage: 'Damage',
  save: 'Save',
  healing: 'Heal',
  free: 'Free',
  concentration_save: 'Conc',
}

export default function RollBar({
  animationState = 'idle',
  currentRoll = null,
  rollHistory = [],
  onFreeRoll = null,
  disabled = false,
}) {
  const latest = useMemo(() => rollHistory?.[0] || currentRoll || null, [rollHistory, currentRoll])

  return (
    <div data-testid="roll-bar" style={S.container}>
      <div style={S.left}>
        {DIE_TYPES.map((sides) => (
          <button
            key={sides}
            type="button"
            data-testid={`die-btn-${sides}`}
            disabled={disabled}
            onClick={() => onFreeRoll?.(`1d${sides}`)}
            style={{ ...S.dieButton, opacity: disabled ? 0.45 : 1 }}
            title={`Roll d${sides}`}
          >
            d{sides}
          </button>
        ))}
      </div>

      <div data-testid="roll-animation-area" style={S.center}>
        {latest ? (
          <>
            <span style={S.statusLabel}>{statusText(animationState)}</span>
            <span style={S.dot}>•</span>
            <span style={S.purpose}>{PURPOSE_LABELS[latest.purpose] || latest.purpose || 'Roll'}</span>
            <span style={S.dot}>•</span>
            <span style={S.total}>{latest.total}</span>
            {Array.isArray(latest.values) && latest.values.length > 0 && (
              <span style={S.values}>[{latest.values.join(',')}]</span>
            )}
          </>
        ) : (
          <span style={S.empty}>Roll dice or take an action</span>
        )}
      </div>

      <div data-testid="roll-history" style={S.right}>
        {rollHistory.slice(0, 3).map((roll, idx) => (
          <span key={`${roll.total}-${idx}`} style={S.historyItem}>
            {(PURPOSE_LABELS[roll.purpose] || roll.purpose || 'Roll').slice(0, 4)} {roll.total}
          </span>
        ))}
        {rollHistory.length === 0 && <span style={S.empty}>No rolls yet</span>}
      </div>
    </div>
  )
}

function statusText(state) {
  if (state === 'awaiting') return 'Resolving…'
  if (state === 'awaiting_input') return 'Awaiting Input'
  if (state === 'rolling') return 'Rolling…'
  if (state === 'resolved') return 'Resolved'
  return 'Ready'
}

const S = {
  container: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 8px',
    background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
    borderTop: '1px solid #333',
    zIndex: 1000,
    fontFamily: 'Segoe UI, sans-serif',
  },
  left: {
    display: 'flex',
    gap: 4,
    flexShrink: 0,
  },
  dieButton: {
    height: 28,
    minWidth: 34,
    borderRadius: 6,
    border: '1px solid #4f5b7a',
    background: '#0d1117',
    color: '#d7deed',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    padding: '0 7px',
  },
  center: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    color: '#d2d8e8',
    fontSize: 12,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  statusLabel: {
    color: '#9aa7c6',
    fontWeight: 600,
    textTransform: 'uppercase',
    fontSize: 10,
    letterSpacing: 0.6,
  },
  purpose: {
    color: '#cfd7ea',
  },
  total: {
    color: '#fff',
    fontWeight: 700,
  },
  values: {
    color: '#8ea0c8',
    fontSize: 11,
  },
  dot: {
    color: '#637296',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    maxWidth: 240,
    overflow: 'hidden',
  },
  historyItem: {
    color: '#9ca7c1',
    border: '1px solid #33405f',
    borderRadius: 5,
    padding: '2px 6px',
    fontSize: 10,
  },
  empty: {
    color: '#637296',
    fontSize: 11,
  },
}
