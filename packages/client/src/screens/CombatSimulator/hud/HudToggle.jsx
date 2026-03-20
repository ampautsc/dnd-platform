/**
 * HudToggle — small toggle buttons to show/hide each HUD panel.
 * Sits in the bottom-left corner of the viewport.
 */

import './CombatHud.css'

const PANELS = [
  { key: 'left',   icon: '◀', title: 'Party' },
  { key: 'top',    icon: '▲', title: 'Actions' },
  { key: 'right',  icon: '▶', title: 'Entities' },
  { key: 'bottom', icon: '▼', title: 'Narration' },
]

export default function HudToggle({ visibility, onToggle }) {
  return (
    <div className="hud-toggles">
      {PANELS.map(p => (
        <button
          key={p.key}
          className={`hud-toggle-btn${visibility[p.key] ? ' active' : ''}`}
          onClick={() => onToggle(p.key)}
          title={`${visibility[p.key] ? 'Hide' : 'Show'} ${p.title}`}
        >
          {p.icon}
        </button>
      ))}
    </div>
  )
}
