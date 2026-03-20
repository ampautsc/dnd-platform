/**
 * EntityCard — compact card for a creature, NPC, item, or object.
 * Shows circular portrait (image or initials), name, HP bar, and conditions.
 * Used in both left (party) and right (enemies/items) panels.
 */

import './CombatHud.css'

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().replace(/[^a-zA-Z0-9 ]/g, '').split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function hpClass(hp, maxHp) {
  if (maxHp <= 0) return 'hp-high'
  const pct = hp / maxHp
  if (pct > 0.5) return 'hp-high'
  if (pct > 0.25) return 'hp-mid'
  return 'hp-low'
}

export default function EntityCard({ entity, isActive = false, onClick }) {
  const { name, portraitUrl, hp, maxHp, ac, side = 'neutral', conditions = [], shortDesc } = entity
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0
  const showHpBar = maxHp > 0

  return (
    <div
      className={`entity-card${isActive ? ' active' : ''}`}
      onClick={() => onClick?.(entity)}
      title={shortDesc || name}
    >
      {/* Circular portrait */}
      <div className={`entity-portrait side-${side}`}>
        {portraitUrl
          ? <img src={portraitUrl} alt={name} />
          : getInitials(name)
        }
      </div>

      {/* Info column */}
      <div className="entity-info">
        <div className="entity-name">{name}</div>

        {showHpBar && (
          <>
            <div className="entity-hp-bar">
              <div
                className={`entity-hp-fill ${hpClass(hp, maxHp)}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="entity-sub">
              HP {hp}/{maxHp} &nbsp;·&nbsp; AC {ac}
            </div>
          </>
        )}

        {!showHpBar && shortDesc && (
          <div className="entity-sub">{shortDesc}</div>
        )}

        {conditions.length > 0 && (
          <div className="entity-conditions">
            {conditions.map(c => (
              <span key={c} className="condition-badge">{c}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
