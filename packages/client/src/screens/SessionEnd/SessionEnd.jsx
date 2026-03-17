export function SessionEnd({ summary, onPlayAgain }) {
  return (
    <section>
      <h2>Session Complete</h2>

      <h3>{summary.title}</h3>
      <p style={{ lineHeight: 1.6, fontStyle: 'italic' }}>{summary.chapterSummary}</p>

      <div style={{ marginTop: '1rem' }}>
        <p><strong>{summary.xp} XP</strong> gained</p>
      </div>

      {summary.loot && summary.loot.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <strong>Loot:</strong>
          <ul>
            {summary.loot.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={onPlayAgain}
        style={{ minHeight: 44, padding: '0.75rem 1.5rem', marginTop: '1.5rem' }}
      >
        Play Again
      </button>
    </section>
  );
}
