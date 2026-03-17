export function GroupVote({ vote, onVote }) {
  return (
    <section>
      <h2>Group Decision</h2>
      <p style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem' }}>
        {vote.prompt}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {vote.options.map(option => (
          <button
            key={option.id}
            onClick={() => onVote(option)}
            disabled={vote.hasVoted}
            style={{
              minHeight: 44,
              padding: '0.75rem 1rem',
              textAlign: 'left',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{option.label}</span>
            <span style={{ marginLeft: '1rem', color: '#666', fontSize: '0.85rem' }}>
              {option.votes} vote{option.votes !== 1 ? 's' : ''}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
