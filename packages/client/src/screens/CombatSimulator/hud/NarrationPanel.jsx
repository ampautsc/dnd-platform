/**
 * NarrationPanel — scrollable AI-narrated combat flavor text.
 * Auto-scrolls to the most recent entry.
 */

import { useEffect, useRef } from 'react'
import './CombatHud.css'

export default function NarrationPanel({ entries = [] }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries.length])

  if (entries.length === 0) return null

  return (
    <div className="narration-list">
      {entries.map(entry => (
        <div key={entry.id} className="narration-entry">
          <span className="narration-timestamp">[{entry.timestamp}]</span>
          {entry.text}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
