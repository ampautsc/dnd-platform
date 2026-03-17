import { useState } from 'react';

export function TheGate({ onJoin }) {
  const [code, setCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();

    const trimmedCode = code.trim();
    const trimmedName = playerName.trim();

    if (!trimmedCode || !trimmedName) {
      setError('Enter both session code and player name');
      return;
    }

    setError('');
    onJoin({ code: trimmedCode, playerName: trimmedName });
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ marginBottom: '0.75rem' }}>
        <label htmlFor="session-code">Session Code</label>
        <input
          id="session-code"
          name="session-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="off"
          style={{ display: 'block', width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
        />
      </div>

      <div style={{ marginBottom: '0.75rem' }}>
        <label htmlFor="player-name">Player Name</label>
        <input
          id="player-name"
          name="player-name"
          value={playerName}
          onChange={(event) => setPlayerName(event.target.value)}
          autoComplete="name"
          style={{ display: 'block', width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
        />
      </div>

      <button type="submit" style={{ minHeight: 44, padding: '0.5rem 1rem' }}>
        Join Session
      </button>

      {error && (
        <p role="alert" style={{ color: '#b00020', marginTop: '0.75rem' }}>
          {error}
        </p>
      )}
    </form>
  );
}
