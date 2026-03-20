/**
 * ActionBar — Comprehensive D&D 5e action bar.
 *
 * Thin UI — no business logic here. All turn/budget rules live in useCombatTurn.
 * Layout: Turn info | Movement | Actions | Bonus Actions | Reaction | Spell Slots | End Turn
 */
import { useState, useRef, useEffect } from 'react'

export default function ActionBar({
  round = 1,
  activeName = '',
  activeBudget = null,
  character = null,         // MOCK_ACTIVE_CHARACTER — weapons, spells, cantrips, classFeatures
  movePending = false,
  onMoveClick = null,
  onAction = null,          // (actionType, actionData) — dispatched to CombatViewer
  onEndTurn = null,
}) {
  const [openMenu, setOpenMenu] = useState(null)  // 'attack' | 'spell' | 'feature' | null
  const menuRef = useRef(null)

  // Close menu on outside click
  useEffect(() => {
    if (!openMenu) return
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenu(null)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [openMenu])

  if (!activeBudget) return null

  const { movementRemaining, speed, actionUsed, bonusActionUsed, reactionUsed, spellSlots, concentrating } = activeBudget
  const moveFt = movementRemaining ?? 0
  const weapons = character?.weapons ?? []
  const spells = character?.spells ?? []
  const cantrips = character?.cantrips ?? []
  const features = character?.classFeatures ?? []
  const maxSlots = character?.spellSlots ?? {}

  // Split features by action type
  const actionFeatures = features.filter(f => f.actionType === 'action')
  const bonusFeatures  = features.filter(f => f.actionType === 'bonus')
  const reactionFeatures = features.filter(f => f.actionType === 'reaction')

  // Split spells by action type
  const actionSpells   = spells.filter(s => s.actionType === 'action')
  const bonusSpells    = spells.filter(s => s.actionType === 'bonus')
  const reactionSpells = spells.filter(s => s.actionType === 'reaction')

  function handleAction(type, data) {
    setOpenMenu(null)
    onAction?.(type, data)
  }

  function slotPips(level) {
    const max = maxSlots[level] ?? 0
    const cur = spellSlots[level] ?? 0
    const pips = []
    for (let i = 0; i < max; i++) {
      pips.push(
        <span key={i} style={{
          display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
          background: i < cur ? LVL_COLORS[level] ?? '#a88' : '#222',
          border: '1px solid ' + (i < cur ? '#fff3' : '#333'),
          marginRight: 2,
        }} />
      )
    }
    return pips
  }

  // Helper: can a spell be cast? Check slot + action type budget
  function canCast(spell) {
    if (spell.level === 0) return true  // cantrips always available
    const slotsLeft = spellSlots[spell.level] ?? 0
    if (slotsLeft <= 0) return false
    if (spell.actionType === 'action' && actionUsed) return false
    if (spell.actionType === 'bonus' && bonusActionUsed) return false
    if (spell.actionType === 'reaction' && reactionUsed) return false
    return true
  }

  function featureUsesLeft(f) {
    if (f.sharePool) {
      // Shared pool — look up the parent feature's uses
      const parent = features.find(p => p.id === f.sharePool)
      if (parent) return activeBudget.featureUses[parent.id] ?? 0
    }
    return activeBudget.featureUses[f.id] ?? 0
  }

  return (
    <div style={S.bar} ref={menuRef}>
      {/* ── Turn Info ─────────────────────────────────────────── */}
      <div style={S.section}>
        <div style={S.round}>Round {round}</div>
        <div style={S.turnLabel}>{activeName}</div>
      </div>

      <Div />

      {/* ── Movement ──────────────────────────────────────────── */}
      <div style={S.section}>
        <div style={S.sectionLabel}>Movement</div>
        <button
          style={movePending ? S.btnActive : moveFt <= 0 ? S.btnDim : S.btn}
          onClick={onMoveClick}
          disabled={moveFt <= 0 && !movePending}
          title={moveFt > 0 ? `${moveFt} ft remaining (${Math.floor(moveFt / 5)} hexes)` : 'No movement left'}
        >
          <I>🦶</I>{movePending ? 'Cancel' : `${moveFt} ft`}
        </button>
      </div>

      <Div />

      {/* ── Action ────────────────────────────────────────────── */}
      <div style={S.section}>
        <div style={S.sectionLabel}>Action{actionUsed ? ' ✓' : ''}</div>
        <div style={S.row}>
          {/* Attack dropdown */}
          <MenuBtn
            icon="⚔️" label="Attack" disabled={actionUsed}
            open={openMenu === 'attack'} onClick={() => setOpenMenu(openMenu === 'attack' ? null : 'attack')}
          >
            {weapons.map(w => (
              <MenuItem key={w.id} icon={w.icon} disabled={actionUsed}
                onClick={() => handleAction('attack', w)}>
                {w.name} <Dim>(+{w.attackBonus}, {w.damage})</Dim>
              </MenuItem>
            ))}
          </MenuBtn>

          {/* Cast Spell dropdown (action spells + cantrips) */}
          <MenuBtn
            icon="✨" label="Spell" disabled={actionUsed}
            open={openMenu === 'spell'} onClick={() => setOpenMenu(openMenu === 'spell' ? null : 'spell')}
          >
            {cantrips.map(s => (
              <MenuItem key={s.id} icon={s.icon} disabled={actionUsed}
                onClick={() => handleAction('spell', s)}>
                {s.name} <Dim>(cantrip)</Dim>
              </MenuItem>
            ))}
            {cantrips.length > 0 && actionSpells.length > 0 && <div style={S.menuDivider} />}
            {actionSpells.map(s => (
              <MenuItem key={s.id} icon={s.icon} disabled={!canCast(s)}
                onClick={() => handleAction('spell', s)}>
                {s.name}
                <Dim> ({s.level}{s.concentration ? ', C' : ''})</Dim>
                {(spellSlots[s.level] ?? 0) <= 0 && <Dim style={{ color: '#a44' }}> no slots</Dim>}
              </MenuItem>
            ))}
          </MenuBtn>

          {/* Standard actions */}
          <SmallBtn icon="💨" label="Dash"       disabled={actionUsed} onClick={() => handleAction('dash', {})} title="Double movement this turn" />
          <SmallBtn icon="🛡️" label="Dodge"     disabled={actionUsed} onClick={() => handleAction('dodge', {})} title="Attacks against you have disadvantage" />
          <SmallBtn icon="↩️" label="Disengage"  disabled={actionUsed} onClick={() => handleAction('disengage', {})} title="Movement doesn't provoke opportunity attacks" />
          <SmallBtn icon="👁️" label="Hide"       disabled={actionUsed} onClick={() => handleAction('hide', {})} title="Attempt to become hidden (DEX Stealth)" />
          <SmallBtn icon="🤚" label="Help"       disabled={actionUsed} onClick={() => handleAction('help', {})} title="Give advantage to ally's next check or attack" />
          <SmallBtn icon="⏳" label="Ready"      disabled={actionUsed} onClick={() => handleAction('ready', {})} title="Prepare a reaction trigger" />

          {/* Action-type class features */}
          {actionFeatures.map(f => (
            <SmallBtn key={f.id} icon={f.icon} label={f.name}
              disabled={actionUsed || featureUsesLeft(f) <= 0}
              badge={featureUsesLeft(f)}
              onClick={() => handleAction('feature', f)}
              title={`${f.description} (${featureUsesLeft(f)} uses)`}
            />
          ))}
        </div>
      </div>

      <Div />

      {/* ── Bonus Action ──────────────────────────────────────── */}
      <div style={S.section}>
        <div style={S.sectionLabel}>Bonus{bonusActionUsed ? ' ✓' : ''}</div>
        <div style={S.row}>
          {/* Bonus spells (e.g. Healing Word) */}
          {bonusSpells.map(s => (
            <SmallBtn key={s.id} icon={s.icon} label={s.name.split(' ')[0]}
              disabled={bonusActionUsed || !canCast(s)}
              onClick={() => handleAction('bonusSpell', s)}
              title={`${s.name} (${s.level}${s.concentration ? ', C' : ''}) — ${s.description}`}
            />
          ))}
          {/* Bonus features (e.g. Bardic Inspiration, Gem Flight) */}
          {bonusFeatures.map(f => (
            <SmallBtn key={f.id} icon={f.icon} label={f.name.split(' ')[0]}
              disabled={bonusActionUsed || featureUsesLeft(f) <= 0}
              badge={featureUsesLeft(f)}
              onClick={() => handleAction('bonusFeature', f)}
              title={`${f.description} (${featureUsesLeft(f)} uses)`}
            />
          ))}
        </div>
      </div>

      <Div />

      {/* ── Reaction ──────────────────────────────────────────── */}
      <div style={S.section}>
        <div style={S.sectionLabel}>React{reactionUsed ? ' ✓' : ''}</div>
        <div style={S.row}>
          {reactionSpells.map(s => (
            <SmallBtn key={s.id} icon={s.icon} label={s.name.split(' ')[0]}
              disabled={reactionUsed || !canCast(s)}
              onClick={() => handleAction('reactionSpell', s)}
              title={`${s.name} (${s.level}) — ${s.description}`}
            />
          ))}
          {reactionFeatures.map(f => (
            <SmallBtn key={f.id} icon={f.icon} label={f.name.split(' ')[0]}
              disabled={reactionUsed || featureUsesLeft(f) <= 0}
              badge={featureUsesLeft(f)}
              onClick={() => handleAction('reactionFeature', f)}
              title={`${f.description} (${featureUsesLeft(f)} uses)`}
            />
          ))}
        </div>
      </div>

      <Div />

      {/* ── Spell Slots ───────────────────────────────────────── */}
      <div style={S.section}>
        <div style={S.sectionLabel}>Slots</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {Object.keys(maxSlots).sort().map(lvl => (
            <div key={lvl} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#665', fontSize: 9, minWidth: 14, textAlign: 'right' }}>{lvl}</span>
              {slotPips(Number(lvl))}
            </div>
          ))}
        </div>
        {concentrating && (
          <div style={{ fontSize: 9, color: '#c8a040', marginTop: 2 }}>
            ⟳ Concentrating
          </div>
        )}
      </div>

      <Div />

      {/* ── End Turn ──────────────────────────────────────────── */}
      <button style={S.btnEnd} onClick={onEndTurn}>
        End Turn
      </button>
    </div>
  )
}

/* ── Tiny sub-components ──────────────────────────────────────────── */

function Div() { return <div style={S.divider} /> }
function I({ children }) { return <span style={{ fontSize: 13, marginRight: 3 }}>{children}</span> }
function Dim({ children, style }) { return <span style={{ color: '#665', fontSize: 10, ...style }}>{children}</span> }

/** Small square-ish action button */
function SmallBtn({ icon, label, disabled, badge, onClick, title }) {
  return (
    <button
      style={disabled ? S.btnDim : S.btn}
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      <I>{icon}</I>
      <span style={{ fontSize: 10 }}>{label}</span>
      {badge != null && badge > 0 && (
        <span style={S.badge}>{badge}</span>
      )}
    </button>
  )
}

/** Button that opens a dropdown menu */
function MenuBtn({ icon, label, disabled, open, onClick, children }) {
  return (
    <div style={{ position: 'relative' }}>
      <button style={open ? S.btnActive : disabled ? S.btnDim : S.btn} disabled={disabled} onClick={onClick}>
        <I>{icon}</I><span style={{ fontSize: 10 }}>{label}</span>
        <span style={{ fontSize: 8, marginLeft: 2, color: '#665' }}>▾</span>
      </button>
      {open && (
        <div style={S.dropdown} onClick={e => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  )
}

/** Single dropdown menu item */
function MenuItem({ icon, disabled, onClick, children }) {
  return (
    <button style={disabled ? S.menuItemDim : S.menuItem} disabled={disabled} onClick={onClick}>
      <I>{icon}</I>{children}
    </button>
  )
}

/* ── Spell slot level colors ─────────────────────────────────────── */
const LVL_COLORS = { 1: '#6ab4ff', 2: '#6aff8a', 3: '#f0c040', 4: '#e080f0', 5: '#ff6a6a', 6: '#ff9040', 7: '#40e0e0', 8: '#e0e040', 9: '#ff60a0' }

/* ── Styles ──────────────────────────────────────────────────────── */

const base = {
  fontFamily: '"Palatino Linotype", Georgia, serif',
  fontSize: 11,
  borderRadius: 4,
  border: 'none',
  cursor: 'pointer',
  padding: '4px 8px',
  display: 'flex',
  alignItems: 'center',
  gap: 3,
  transition: 'background 0.12s',
  whiteSpace: 'nowrap',
}

const S = {
  bar: {
    position: 'fixed',
    top: 10,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 200,
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
    background: 'rgba(8, 6, 4, 0.94)',
    border: '1px solid #4a3010',
    borderRadius: 10,
    padding: '7px 14px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,200,100,0.06)',
    backdropFilter: 'blur(4px)',
    pointerEvents: 'auto',
    maxWidth: '98vw',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    alignItems: 'flex-start',
  },
  sectionLabel: {
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#5a5040',
    fontWeight: 700,
    lineHeight: 1,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    flexWrap: 'wrap',
  },
  round: {
    color: '#7a6040',
    fontSize: 10,
    fontFamily: 'sans-serif',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  },
  turnLabel: {
    color: '#c8a84a',
    fontSize: 13,
    fontFamily: '"Palatino Linotype", Georgia, serif',
    fontWeight: 700,
  },
  divider: {
    width: 1,
    alignSelf: 'stretch',
    background: '#3a2810',
    margin: '0 2px',
    minHeight: 36,
  },
  btn: {
    ...base,
    background: '#1c160c',
    color: '#d4b870',
    border: '1px solid #4a3418',
  },
  btnActive: {
    ...base,
    background: '#1a3018',
    color: '#60e080',
    border: '1px solid #30a040',
    fontWeight: 700,
  },
  btnDim: {
    ...base,
    background: '#111',
    color: '#443a2a',
    border: '1px solid #2a2018',
    cursor: 'default',
    opacity: 0.45,
  },
  btnEnd: {
    ...base,
    background: '#301010',
    color: '#d06040',
    border: '1px solid #6a2a18',
    fontSize: 12,
    padding: '6px 14px',
    alignSelf: 'center',
  },
  badge: {
    fontSize: 9,
    background: '#4a3018',
    color: '#d4a040',
    borderRadius: 6,
    padding: '0 4px',
    marginLeft: 2,
    lineHeight: '14px',
    minWidth: 14,
    textAlign: 'center',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 4,
    background: 'rgba(12, 10, 6, 0.97)',
    border: '1px solid #4a3418',
    borderRadius: 6,
    padding: '4px 0',
    zIndex: 300,
    minWidth: 200,
    boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    background: 'transparent',
    border: 'none',
    color: '#d4b870',
    fontSize: 11,
    fontFamily: '"Palatino Linotype", Georgia, serif',
    padding: '5px 12px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.1s',
    whiteSpace: 'nowrap',
  },
  menuItemDim: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    background: 'transparent',
    border: 'none',
    color: '#443a2a',
    fontSize: 11,
    fontFamily: '"Palatino Linotype", Georgia, serif',
    padding: '5px 12px',
    cursor: 'default',
    textAlign: 'left',
    opacity: 0.45,
    whiteSpace: 'nowrap',
  },
  menuDivider: {
    height: 1,
    background: '#3a2810',
    margin: '3px 8px',
  },
}
