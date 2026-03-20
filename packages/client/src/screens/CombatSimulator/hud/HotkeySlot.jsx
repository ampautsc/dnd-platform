/**
 * HotkeySlot — a single hotbar button with optional dropdown sub-options.
 * Clicking the slot either fires the action (no sub-options) or toggles
 * a dropdown of sub-options.
 */

import { useState, useRef, useEffect } from 'react'
import './CombatHud.css'

export default function HotkeySlot({ hotkey, onAction }) {
  const { id, label, icon, subOptions = [] } = hotkey
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handleClick)
    return () => document.removeEventListener('pointerdown', handleClick)
  }, [open])

  function handleSlotClick() {
    if (subOptions.length === 0) {
      // Direct fire
      onAction?.(hotkey)
    } else {
      setOpen(prev => !prev)
    }
  }

  function handleOptionClick(option) {
    setOpen(false)
    onAction?.(option, hotkey)
  }

  return (
    <div
      ref={ref}
      className={`hotkey-slot${open ? ' expanded' : ''}`}
      onClick={handleSlotClick}
    >
      <span className="hotkey-icon">{icon}</span>
      <span className="hotkey-label">{label}</span>

      {/* Sub-option indicator */}
      {subOptions.length > 0 && (
        <span style={{
          position: 'absolute', bottom: 2, right: 4,
          fontSize: 8, color: '#665', lineHeight: 1,
        }}>
          ▾
        </span>
      )}

      {/* Dropdown */}
      {open && subOptions.length > 0 && (
        <div className="hotkey-dropdown" onClick={e => e.stopPropagation()}>
          {subOptions.map(opt => (
            <button
              key={opt.id}
              className="hotkey-option"
              onClick={() => handleOptionClick(opt)}
            >
              <span className="hotkey-option-icon">{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
