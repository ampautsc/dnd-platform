import { useState, useMemo } from 'react';

/**
 * NpcCatalog — browsable grid of all available NPCs.
 *
 * Props:
 *   npcs           — array of NPC summaries (null = loading)
 *   onSelect       — called with templateKey when user clicks "Talk"
 *   selectedNpcs   — (optional) array of currently selected NPC objects for scene mode
 *   onToggleSelect — (optional) called with NPC object when checkbox is toggled
 */
export function NpcCatalog({ npcs, onSelect, selectedNpcs, onToggleSelect }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!npcs) return null;
    if (!search.trim()) return npcs;
    const lower = search.toLowerCase();
    return npcs.filter(n =>
      n.name.toLowerCase().includes(lower) ||
      n.race.toLowerCase().includes(lower) ||
      n.npcType.toLowerCase().includes(lower)
    );
  }, [npcs, search]);

  if (npcs === null) {
    return <p>Loading NPCs…</p>;
  }

  if (npcs.length === 0) {
    return <p>No NPCs available.</p>;
  }

  return (
    <section>
      <input
        type="text"
        placeholder="Search NPCs…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: '100%',
          padding: '0.5rem',
          marginBottom: '1rem',
          fontSize: '1rem',
          borderRadius: 6,
          border: '1px solid #ccc',
          boxSizing: 'border-box',
        }}
      />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '0.75rem',
      }}>
        {filtered.map(npc => {
          const isSelected = selectedNpcs?.some(n => n.templateKey === npc.templateKey);
          return (
          <div
            key={npc.templateKey}
            data-testid="npc-card"
            style={{
              border: '1px solid #ccc',
              borderColor: isSelected ? '#7c3aed' : '#ccc',
              borderWidth: isSelected ? 2 : 1,
              borderRadius: 8,
              padding: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
            }}
          >
            {onToggleSelect && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', marginBottom: '0.25rem' }}>
                <input
                  type="checkbox"
                  checked={!!isSelected}
                  onChange={() => onToggleSelect(npc)}
                />
                <span style={{ fontSize: '0.8rem', color: '#666' }}>Select for scene</span>
              </label>
            )}
            <strong style={{ fontSize: '1.1rem' }}>{npc.name}</strong>
            <span style={{ fontSize: '0.85rem', color: '#666' }}>
              {npc.race} · {npc.npcType}
            </span>
            {npc.personality?.disposition && (
              <span style={{ fontSize: '0.8rem', fontStyle: 'italic', color: '#888' }}>
                {npc.personality.disposition}
              </span>
            )}
            <button
              onClick={() => onSelect(npc.templateKey)}
              style={{
                marginTop: 'auto',
                minHeight: 44,
                padding: '0.5rem',
                cursor: 'pointer',
                borderRadius: 6,
                border: '1px solid #333',
                background: '#333',
                color: '#fff',
                fontWeight: 'bold',
              }}
            >
              Talk
            </button>
          </div>
          );
        })}
      </div>

      {filtered.length === 0 && search.trim() && (
        <p style={{ textAlign: 'center', color: '#888', marginTop: '1rem' }}>
          No NPCs matching &ldquo;{search}&rdquo;
        </p>
      )}
    </section>
  );
}
