export function Exploration({ scene, onAction }) {
  return (
    <section>
      <div
        className="narration"
        style={{
          background: '#f5f0e6',
          padding: '1rem',
          borderRadius: 8,
          marginBottom: '1rem',
          fontStyle: 'italic',
          lineHeight: 1.6,
        }}
      >
        <p>{scene.narration}</p>
      </div>

      {scene.npcDialogue && (
        <div
          className="npc-dialogue"
          style={{
            background: '#e8f5e9',
            padding: '1rem',
            borderRadius: 8,
            marginBottom: '1rem',
          }}
        >
          <strong>{scene.npcDialogue.speaker}</strong>
          <p>"{scene.npcDialogue.text}"</p>
        </div>
      )}

      {scene.actions.length === 0 ? (
        <p style={{ color: '#999' }}>Waiting for the DM…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {scene.actions.map(action => (
            <button
              key={action.id}
              onClick={() => onAction(action)}
              style={{ minHeight: 44, padding: '0.75rem 1rem', textAlign: 'left' }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
