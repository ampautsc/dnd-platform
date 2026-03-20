/**
 * EncounterModal — Modal overlay for browsing and loading pre-built encounters.
 *
 * Thin UI component — no business logic. Renders encounter cards grouped by
 * theme, with difficulty badges and foe summaries. Delegates load action to
 * parent via onLoadEncounter callback.
 */
import { useState, useEffect, useRef } from 'react'
import { ENCOUNTERS, DIFFICULTY_COLORS, getThemes, foeSummary, countFoes } from '.././encounters.js'

// ── Creature display names (friendlier than raw templateKey) ────────────────
const CREATURE_NAMES = {
  zombie: 'Zombie', skeleton: 'Skeleton', ghoul: 'Ghoul',
  ghast: 'Ghast', lich: 'Lich',
}

function creatureName(templateKey) {
  return CREATURE_NAMES[templateKey] || templateKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── Theme icons ─────────────────────────────────────────────────────────────
const THEME_ICONS = {
  undead: '\uD83D\uDC80',  // 💀
}

export default function EncounterModal({ onLoadEncounter, onClose }) {
  const backdropRef = useRef(null)
  const [selectedTheme, setSelectedTheme] = useState('undead')

  const themes = getThemes()
  const filtered = ENCOUNTERS.filter(e => e.theme === selectedTheme)

  // Close on Escape
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Close on backdrop click
  function handleBackdropClick(e) {
    if (e.target === backdropRef.current) onClose?.()
  }

  return (
    <div
      ref={backdropRef}
      data-testid="encounter-modal"
      onClick={handleBackdropClick}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0, 0, 0, 0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Georgia, serif',
      }}
    >
      <div style={{
        background: 'linear-gradient(180deg, #2a2622 0%, #1a1612 100%)',
        border: '2px solid #8a6a30',
        borderRadius: 14,
        width: 540, maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 12px 48px rgba(0,0,0,0.8)',
        overflow: 'hidden',
      }}>
        {/* ── Header ── */}
        <div style={{
          padding: '16px 20px 12px',
          borderBottom: '1px solid #3a3020',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>{'\u2694\uFE0F'}</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#f0d060', letterSpacing: '0.05em' }}>
              Load Encounter
            </span>
          </div>
          <button
            data-testid="encounter-modal-close"
            onClick={onClose}
            style={{
              background: 'none', border: '1px solid #5a4830', borderRadius: 6,
              color: '#c8b888', fontSize: 16, cursor: 'pointer', padding: '2px 8px',
              lineHeight: 1,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#c8a040' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#5a4830' }}
          >
            {'\u2715'}
          </button>
        </div>

        {/* ── Theme tabs ── */}
        <div style={{
          display: 'flex', gap: 4, padding: '10px 20px 6px',
          borderBottom: '1px solid #2a2218',
        }}>
          {themes.map(theme => (
            <button
              key={theme}
              data-testid={`encounter-theme-${theme}`}
              onClick={() => setSelectedTheme(theme)}
              style={{
                background: selectedTheme === theme ? '#3a3020' : 'transparent',
                border: `1px solid ${selectedTheme === theme ? '#c8a040' : '#3a3020'}`,
                borderRadius: 6,
                padding: '5px 14px',
                color: selectedTheme === theme ? '#f0d060' : '#a09070',
                fontSize: 13, fontFamily: 'Georgia, serif',
                cursor: 'pointer',
                textTransform: 'capitalize',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <span style={{ fontSize: 14 }}>{THEME_ICONS[theme] || '\u2694\uFE0F'}</span>
              {theme}
            </button>
          ))}
        </div>

        {/* ── Encounter cards (scrollable) ── */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '12px 16px',
          display: 'flex', flexDirection: 'column', gap: 10,
          scrollbarWidth: 'thin',
        }}>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', color: '#665', fontStyle: 'italic', padding: 24 }}>
              No encounters for this theme yet.
            </div>
          )}

          {filtered.map(encounter => (
            <EncounterCard
              key={encounter.id}
              encounter={encounter}
              onLoad={() => onLoadEncounter(encounter)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Encounter Card ──────────────────────────────────────────────────────────

function EncounterCard({ encounter, onLoad }) {
  const diffColor = DIFFICULTY_COLORS[encounter.difficulty] || '#888'
  const totalFoes = countFoes(encounter)

  return (
    <div
      data-testid={`encounter-card-${encounter.id}`}
      style={{
        background: '#221e18',
        border: '1px solid #3a2e1a',
        borderRadius: 8,
        padding: '12px 14px',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#6a5838' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#3a2e1a' }}
    >
      {/* Top row: name + difficulty badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#e8d8a8' }}>
          {encounter.name}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {encounter.explorationMode && (
            <span
              title="Exploration mode — not necessarily a fight to the death"
              style={{ fontSize: 12, color: '#6a8', cursor: 'help' }}
            >
              {'\uD83C\uDF3F'}
            </span>
          )}
          <span style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            color: diffColor, border: `1px solid ${diffColor}`,
            borderRadius: 4, padding: '1px 7px', letterSpacing: '0.06em',
          }}>
            {encounter.difficulty}
          </span>
        </div>
      </div>

      {/* Description */}
      <div style={{ fontSize: 12, color: '#a09070', lineHeight: '17px', marginBottom: 8, fontStyle: 'italic' }}>
        {encounter.description}
      </div>

      {/* Foe breakdown + Load button */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          {/* Foe list with icons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
            {encounter.foes.map((f, i) => (
              <span key={i} style={{
                fontSize: 11, color: '#c8b888',
                background: '#1a1612', border: '1px solid #2a2218',
                borderRadius: 4, padding: '2px 8px',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                <span style={{ color: '#f66', fontSize: 10 }}>{'\u00D7'}{f.count}</span>
                {creatureName(f.templateKey)}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 10, color: '#706050' }}>
            {totalFoes} foe{totalFoes !== 1 ? 's' : ''} {'\u00B7'} Total CR {encounter.totalCR}
          </div>
        </div>

        <button
          data-testid={`encounter-load-${encounter.id}`}
          onClick={onLoad}
          style={{
            background: 'linear-gradient(180deg, #3a3020, #2a2218)',
            border: '1px solid #8a6a30',
            borderRadius: 6,
            color: '#f0d060',
            fontSize: 12, fontWeight: 700,
            fontFamily: 'Georgia, serif',
            padding: '6px 16px',
            cursor: 'pointer',
            letterSpacing: '0.04em',
            transition: 'background 0.15s, border-color 0.15s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'linear-gradient(180deg, #4a4030, #3a3228)'
            e.currentTarget.style.borderColor = '#c8a040'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'linear-gradient(180deg, #3a3020, #2a2218)'
            e.currentTarget.style.borderColor = '#8a6a30'
          }}
        >
          {'\u2694\uFE0F'} Load
        </button>
      </div>
    </div>
  )
}
