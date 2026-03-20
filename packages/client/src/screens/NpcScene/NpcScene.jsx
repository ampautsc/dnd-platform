import { useState, useRef, useEffect } from 'react';

/**
 * NpcScene — Turn-based initiative scene with multiple participants.
 *
 * Props:
 *   scene      — scene state object (null = loading). Shape from /api/scenes/:id
 *   onAction   — called with text string when player submits their turn action
 *   onLeave    — called when player clicks Leave
 *   processing — boolean, true while waiting for NPC turns to resolve
 *   locationImage — (optional) URL for a location background image
 */
export function NpcScene({ scene, onAction, onLeave, processing = false, locationImage }) {
  const [input, setInput] = useState('');
  const transcriptEndRef = useRef(null);

  useEffect(() => {
    if (typeof transcriptEndRef.current?.scrollIntoView === 'function') {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scene?.transcript?.length]);

  if (!scene) {
    return <p style={{ textAlign: 'center', padding: '2rem' }}>Starting scene…</p>;
  }

  const { participants, initiativeOrder, round, transcript, status, pendingAction } = scene;
  const isEnded = status === 'ended';
  const playerParticipant = participants.find(p => p.isPlayer);
  const isPlayerTurn = pendingAction === playerParticipant?.id && !isEnded;

  const handleSend = () => {
    const text = input.trim();
    if (!text || !isPlayerTurn) return;
    onAction(text);
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Build display-order participant list
  const orderedParticipants = initiativeOrder
    .map(id => participants.find(p => p.id === id))
    .filter(Boolean);

  const placeholderText = isEnded
    ? 'Scene ended'
    : isPlayerTurn
      ? 'What do you do? Say or do something…'
      : 'Waiting for their turn…';

  return (
    <section style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: '60vh',
    }}>
      {/* Location Image */}
      {locationImage && (
        <img
          src={locationImage}
          alt="Scene location"
          style={{
            width: '100%',
            maxHeight: 200,
            objectFit: 'cover',
            borderRadius: 8,
            marginBottom: '0.5rem',
          }}
        />
      )}

      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.5rem 0',
        borderBottom: '1px solid #ccc',
        marginBottom: '0.5rem',
      }}>
        <div>
          <strong style={{ fontSize: '1.1rem' }}>Scene — Round {round}</strong>
          <span style={{ display: 'block', fontSize: '0.8rem', color: '#888' }}>
            {isPlayerTurn ? 'Your turn' : isEnded ? 'Scene over' : `${participants.find(p => p.id === pendingAction)?.name || 'NPC'}'s turn`}
          </span>
        </div>
        <button
          onClick={onLeave}
          style={{
            minHeight: 36,
            padding: '0.4rem 1rem',
            cursor: 'pointer',
            borderRadius: 6,
            border: '1px solid #c33',
            background: '#c33',
            color: '#fff',
            fontWeight: 'bold',
          }}
        >
          Leave
        </button>
      </div>

      {/* Initiative Order Bar */}
      <div style={{
        display: 'flex',
        gap: '0.4rem',
        padding: '0.4rem 0',
        overflowX: 'auto',
        borderBottom: '1px solid #eee',
        marginBottom: '0.5rem',
      }}>
        {orderedParticipants.map(p => {
          const isCurrent = p.id === pendingAction;
          return (
            <span
              key={p.id}
              style={{
                padding: '0.25rem 0.5rem',
                borderRadius: 12,
                fontSize: '0.8rem',
                fontWeight: isCurrent ? 'bold' : 'normal',
                background: isCurrent ? '#333' : '#eee',
                color: isCurrent ? '#fff' : '#333',
                whiteSpace: 'nowrap',
              }}
            >
              {p.name}{p.isPlayer ? ' (you)' : ''}
            </span>
          );
        })}
      </div>

      {/* Transcript */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0.5rem 0',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}>
        {transcript.length === 0 && !processing && (
          <p style={{ color: '#888', textAlign: 'center', fontStyle: 'italic' }}>
            Setting the scene…
          </p>
        )}

        {transcript.map(entry => {
          const isPlayer = entry.participantId === playerParticipant?.id;
          const isDm = entry.participantId === 'dm' && entry.type === 'narration';

          if (isDm) {
            return (
              <div
                key={entry.id}
                style={{
                  alignSelf: 'center',
                  maxWidth: '95%',
                  padding: '0.6rem 1rem',
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #2a1a3e, #1a1a2e)',
                  color: '#d4c4a8',
                  fontStyle: 'italic',
                  fontSize: '0.95rem',
                  lineHeight: 1.5,
                  borderLeft: '3px solid #8b6914',
                }}
              >
                {entry.content}
              </div>
            );
          }

          return (
            <div
              key={entry.id}
              style={{
                alignSelf: isPlayer ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                padding: '0.5rem 0.75rem',
                borderRadius: 12,
                background: isPlayer ? '#333' : '#e8e8e8',
                color: isPlayer ? '#fff' : '#222',
              }}
            >
              {!isPlayer && (
                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '0.2rem' }}>
                  {entry.participantName}
                </div>
              )}
              <div style={entry.type === 'act' || entry.type === 'observe' ? { fontStyle: 'italic' } : {}}>
                {entry.type === 'speech' ? `"${entry.content}"` : entry.content}
              </div>
            </div>
          );
        })}

        {processing && (
          <div style={{
            alignSelf: 'center',
            padding: '0.5rem 0.75rem',
            borderRadius: 12,
            background: '#e8e8e8',
            color: '#888',
            fontStyle: 'italic',
          }}>
            {transcript.length === 0 ? 'Setting the scene…' : 'NPCs are thinking…'}
          </div>
        )}

        <div ref={transcriptEndRef} />
      </div>

      {/* Input */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        padding: '0.5rem 0',
        borderTop: '1px solid #ccc',
      }}>
        <input
          type="text"
          placeholder={placeholderText}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!isPlayerTurn || isEnded}
          style={{
            flex: 1,
            padding: '0.5rem',
            fontSize: '1rem',
            borderRadius: 6,
            border: '1px solid #ccc',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!isPlayerTurn || isEnded || processing || !input.trim()}
          style={{
            minHeight: 44,
            padding: '0.5rem 1rem',
            cursor: isPlayerTurn && !isEnded ? 'pointer' : 'not-allowed',
            borderRadius: 6,
            border: '1px solid #333',
            background: '#333',
            color: '#fff',
            fontWeight: 'bold',
            opacity: (!isPlayerTurn || isEnded || processing || !input.trim()) ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </div>
    </section>
  );
}
