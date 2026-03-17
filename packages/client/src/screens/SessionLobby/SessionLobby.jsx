export function SessionLobby({ players, onReady, isReady }) {
  return (
    <section>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {players.map(player => (
          <li
            key={player.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.5rem 0',
              borderBottom: '1px solid #eee',
            }}
          >
            <span>{player.name}</span>
            <span style={{ color: player.ready ? '#2e7d32' : '#999' }}>
              {player.ready ? '✓ Ready' : 'Waiting…'}
            </span>
          </li>
        ))}
      </ul>
      <button
        onClick={onReady}
        disabled={isReady}
        style={{ minHeight: 44, padding: '0.5rem 1rem', marginTop: '1rem' }}
      >
        {isReady ? 'Ready!' : 'Ready Up'}
      </button>
    </section>
  );
}
