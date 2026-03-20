/**
 * DiceRollBar — Bottom bar with polyhedral dice buttons that trigger 3D physics rolls.
 *
 * Thin UI component: no business logic. Renders dice buttons, delegates roll
 * initiation to parent via `onDieClick(notation)`, and displays recent roll history
 * and the active roll state from the DiceArena overlay.
 *
 * Props:
 *   onDieClick(notation: string)  — Called when user clicks a die (e.g. "1d20")
 *   rollHistory: Array<{ purpose, notation, total, values }>
 *   activeRoll: { purpose, notation } | null  — Set while DiceArena is open
 *   disabled: boolean
 */

const DIE_TYPES = [
  { sides: 4,  label: 'd4',  icon: '△' },
  { sides: 6,  label: 'd6',  icon: '⬡' },
  { sides: 8,  label: 'd8',  icon: '◇' },
  { sides: 10, label: 'd10', icon: '⬠' },
  { sides: 12, label: 'd12', icon: '⬟' },
  { sides: 20, label: 'd20', icon: '⬣' },
]

const PURPOSE_LABELS = {
  attack: 'Attack',
  damage: 'Damage',
  save: 'Save',
  healing: 'Heal',
  free: 'Free',
  concentration_save: 'Conc',
}

export default function DiceRollBar({
  onDieClick = null,
  rollHistory = [],
  activeRoll = null,
  disabled = false,
}) {
  return (
    <div data-testid="dice-roll-bar" style={S.container}>
      {/* ── Die buttons ── */}
      <div style={S.diceGroup}>
        {DIE_TYPES.map(({ sides, label, icon }) => (
          <button
            key={sides}
            type="button"
            data-testid={`die-btn-${sides}`}
            disabled={disabled || !!activeRoll}
            onClick={() => onDieClick?.(`1d${sides}`)}
            style={{
              ...S.dieButton,
              opacity: (disabled || !!activeRoll) ? 0.4 : 1,
              ...(activeRoll?.notation === `1d${sides}` ? S.dieButtonActive : {}),
            }}
            title={`Roll ${label}`}
          >
            <span style={S.dieIcon}>{icon}</span>
            <span style={S.dieLabel}>{label}</span>
          </button>
        ))}
      </div>

      {/* ── Active roll indicator ── */}
      <div data-testid="roll-status" style={S.statusArea}>
        {activeRoll ? (
          <span style={S.activeIndicator}>
            <span style={S.pulsingDot} />
            Rolling {activeRoll.notation}…
          </span>
        ) : rollHistory.length > 0 ? (
          <span style={S.lastResult}>
            <span style={S.resultLabel}>
              {PURPOSE_LABELS[rollHistory[0].purpose] || 'Roll'}
            </span>
            <span style={S.resultTotal}>{rollHistory[0].total}</span>
            {Array.isArray(rollHistory[0].values) && rollHistory[0].values.length > 0 && (
              <span style={S.resultValues}>[{rollHistory[0].values.join(', ')}]</span>
            )}
          </span>
        ) : (
          <span style={S.emptyHint}>Click a die to roll</span>
        )}
      </div>

      {/* ── Roll history (last 5) ── */}
      <div data-testid="roll-history" style={S.historyGroup}>
        {rollHistory.slice(0, 5).map((roll, idx) => (
          <div
            key={`${roll.total}-${roll.notation}-${idx}`}
            style={{
              ...S.historyChip,
              opacity: 1 - idx * 0.15,
            }}
          >
            <span style={S.historyPurpose}>
              {(PURPOSE_LABELS[roll.purpose] || 'Roll').slice(0, 4)}
            </span>
            <span style={S.historyTotal}>{roll.total}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Styles ───────────────────────────────────────────────────────────────── */

const S = {
  container: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    height: 48,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 12px',
    background: 'linear-gradient(180deg, #12121e 0%, #0d0d18 100%)',
    borderTop: '1px solid rgba(140, 100, 255, 0.25)',
    zIndex: 1000,
    fontFamily: "'Segoe UI', system-ui, sans-serif",
  },

  // Die buttons group
  diceGroup: {
    display: 'flex',
    gap: 6,
    flexShrink: 0,
  },
  dieButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    minWidth: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(140, 100, 255, 0.35)',
    background: 'rgba(20, 17, 35, 0.9)',
    color: '#d7deed',
    fontSize: 10,
    fontWeight: 700,
    cursor: 'pointer',
    padding: '2px 6px',
    transition: 'all 0.15s ease',
    gap: 1,
  },
  dieButtonActive: {
    borderColor: 'rgba(140, 100, 255, 0.8)',
    boxShadow: '0 0 12px rgba(140, 100, 255, 0.4)',
    background: 'rgba(40, 30, 70, 0.9)',
  },
  dieIcon: {
    fontSize: 14,
    lineHeight: 1,
    color: 'rgba(180, 160, 255, 0.8)',
  },
  dieLabel: {
    fontSize: 10,
    letterSpacing: 0.5,
    color: '#b0bcd5',
  },

  // Status area (center)
  statusArea: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  activeIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: 'rgba(180, 160, 255, 0.9)',
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: 0.3,
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'rgba(140, 100, 255, 0.85)',
    animation: 'pulse 1s ease-in-out infinite',
    boxShadow: '0 0 6px rgba(140, 100, 255, 0.6)',
  },
  lastResult: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  resultLabel: {
    color: '#9aa7c6',
    fontWeight: 600,
    textTransform: 'uppercase',
    fontSize: 10,
    letterSpacing: 0.8,
  },
  resultTotal: {
    color: '#fff',
    fontWeight: 700,
    fontSize: 18,
  },
  resultValues: {
    color: '#7a8aad',
    fontSize: 11,
  },
  emptyHint: {
    color: '#4f5b7a',
    fontSize: 12,
    fontStyle: 'italic',
  },

  // History group (right)
  historyGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    maxWidth: 280,
    overflow: 'hidden',
  },
  historyChip: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    border: '1px solid rgba(100, 80, 180, 0.3)',
    borderRadius: 6,
    padding: '2px 8px',
    background: 'rgba(25, 22, 45, 0.6)',
    minWidth: 36,
  },
  historyPurpose: {
    color: '#7a8aad',
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  historyTotal: {
    color: '#c8d0e8',
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.2,
  },
}
