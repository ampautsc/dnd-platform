import { useState } from 'react';

export function CharacterSelect({ characters, onSelect }) {
  if (characters === null) {
    return <p>Loading characters…</p>;
  }

  if (characters.length === 0) {
    return <p>No characters found. Create one to get started.</p>;
  }

  return (
    <section>
      <h2>Choose Your Character</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {characters.map(char => (
          <li
            key={char.id}
            style={{
              border: '1px solid #ccc',
              borderRadius: 8,
              padding: '1rem',
              marginBottom: '0.75rem',
            }}
          >
            <strong>{char.name}</strong>
            <p style={{ margin: '0.25rem 0' }}>
              {char.class} — Level {char.level}
            </p>
            <button
              onClick={() => onSelect(char)}
              style={{ minHeight: 44, padding: '0.5rem 1rem' }}
            >
              Select
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
