import { useState, useRef, useEffect } from 'react';

/**
 * NpcScene — Supports two modes:
 *
 * 1. **Initiative mode** (default): Turn-based social scene with initiative order.
 *    Input is only enabled on the player's turn.
 *
 * 2. **Free-chat mode** (freeChatMode=true): Open tavern chat.
 *    Input is always enabled. No initiative, no turns.
 *    Used for ambient NPC reaction testing at locations.
 *
 * Props:
 *   scene         — scene state object (null = loading)
 *   onAction      — called with text string when player submits (initiative mode)
 *   onAmbient     — called with text string for free-chat mode
 *   onLeave       — called when player clicks Leave
 *   processing    — boolean, true while waiting
 *   locationImage — (optional) URL for a location background image
 *   freeChatMode  — boolean, enables always-on input for ambient reactions
 *   locationName  — (optional) name for header in free-chat mode
 *   presentNpcs   — (optional) array of { name, role } for tavern sidebar
 */
export function NpcScene({
  scene,
  onAction,
  onAmbient,
  onLeave,
  processing = false,
  locationImage,
  freeChatMode = false,
  locationName,
  presentNpcs,
}) {
  const [input, setInput] = useState('');
  const [transcript, setTranscript] = useState([]);
  const transcriptEndRef = useRef(null);
  const idCounter = useRef(0);

  // In initiative mode, transcript comes from scene state
  const displayTranscript = freeChatMode ? transcript : (scene?.transcript || []);

  useEffect(() => {
    if (typeof transcriptEndRef.current?.scrollIntoView === 'function') {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [displayTranscript.length]);

  // Free-chat mode: append to local transcript
  const appendToTranscript = (entries) => {
    setTranscript(prev => [...prev, ...entries]);
  };

  // Expose appendToTranscript for parent to call after ambient response
  // We'll use a callback pattern via onAmbient
  const handleSend = () => {
    const text = input.trim();
    if (!text) return;

    if (freeChatMode) {
      // Add player message to transcript immediately
      const playerEntry = {
        id: `msg_${++idCounter.current}`,
        participantId: 'player1',
        participantName: 'You',
        type: 'speech',
        content: text,
      };
      appendToTranscript([playerEntry]);

      // Call parent handler for ambient processing
      if (onAmbient) {
        onAmbient(text, appendToTranscript);
      }
    } else {
      // Initiative mode — delegate to parent
      if (!isPlayerTurn) return;
      onAction(text);
    }

    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // --- Initiative mode state ---
  const participants = scene?.participants || [];
  const initiativeOrder = scene?.initiativeOrder || [];
  const round = scene?.round || 0;
  const status = scene?.status || 'pending';
  const pendingAction = scene?.pendingAction;
  const isEnded = status === 'ended';
  const playerParticipant = participants.find(p => p.isPlayer);
  const isPlayerTurn = pendingAction === playerParticipant?.id && !isEnded;

  const orderedParticipants = initiativeOrder
    .map(id => participants.find(p => p.id === id))
    .filter(Boolean);

  // --- Determine input state ---
  const inputEnabled = freeChatMode
    ? !processing
    : (isPlayerTurn && !isEnded);

  const placeholderText = freeChatMode
    ? (processing ? 'NPCs are thinking…' : 'Say something at the bar…')
    : isEnded
      ? 'Scene ended'
      : isPlayerTurn
        ? 'What do you do? Say or do something…'
        : 'Waiting for their turn…';

  // Loading state
  if (!freeChatMode && !scene) {
    return <p style={{ textAlign: 'center', padding: '2rem' }}>Starting scene…</p>;
  }

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
          {freeChatMode ? (
            <>
              <strong style={{ fontSize: '1.1rem' }}>{locationName || 'Tavern'}</strong>
              <span style={{ display: 'block', fontSize: '0.8rem', color: '#888' }}>
                {processing ? 'NPCs are thinking…' : 'Say something — the regulars might react'}
              </span>
            </>
          ) : (
            <>
              <strong style={{ fontSize: '1.1rem' }}>Scene — Round {round}</strong>
              <span style={{ display: 'block', fontSize: '0.8rem', color: '#888' }}>
                {isPlayerTurn ? 'Your turn' : isEnded ? 'Scene over' : `${participants.find(p => p.id === pendingAction)?.name || 'NPC'}'s turn`}
              </span>
            </>
          )}
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

      {/* Initiative Order Bar (initiative mode only) */}
      {!freeChatMode && (
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
      )}

      {/* Present NPCs bar (free-chat mode) */}
      {freeChatMode && presentNpcs && presentNpcs.length > 0 && (
        <div style={{
          display: 'flex',
          gap: '0.4rem',
          padding: '0.4rem 0',
          overflowX: 'auto',
          borderBottom: '1px solid #eee',
          marginBottom: '0.5rem',
          flexWrap: 'wrap',
        }}>
          {presentNpcs.map(npc => (
            <span
              key={npc.templateKey || npc.name}
              style={{
                padding: '0.25rem 0.5rem',
                borderRadius: 12,
                fontSize: '0.75rem',
                background: '#f5f0e8',
                color: '#5c4a2a',
                whiteSpace: 'nowrap',
              }}
            >
              {npc.name}{npc.role ? ` · ${npc.role}` : ''}
            </span>
          ))}
        </div>
      )}

      {/* Transcript */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0.5rem 0',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}>
        {displayTranscript.length === 0 && !processing && (
          <p style={{ color: '#888', textAlign: 'center', fontStyle: 'italic' }}>
            {freeChatMode ? 'The tavern is quiet… say something.' : 'Setting the scene…'}
          </p>
        )}

        {displayTranscript.map(entry => {
          const isPlayer = entry.participantId === 'player1' || entry.participantId === playerParticipant?.id;
          const isDm = entry.participantId === 'dm' && entry.type === 'narration';
          const isAmbient = entry.type === 'ambient_reaction';

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

          if (isAmbient) {
            return (
              <div
                key={entry.id}
                style={{
                  alignSelf: 'flex-start',
                  maxWidth: '85%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 12,
                  background: '#fdf6e3',
                  color: '#5c4a2a',
                  borderLeft: `3px solid ${entry.strengthColor || '#b8860b'}`,
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '0.2rem', color: '#8b6914' }}>
                  {entry.participantName}
                  {entry.reactionStrength && (
                    <span style={{ fontWeight: 'normal', marginLeft: '0.5rem', fontSize: '0.65rem', opacity: 0.7 }}>
                      {'★'.repeat(entry.reactionStrength)}{'☆'.repeat(5 - entry.reactionStrength)}
                    </span>
                  )}
                </div>
                <div style={{ fontStyle: 'italic' }}>
                  {entry.content}
                </div>
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
            {displayTranscript.length === 0 ? 'Setting the scene…' : 'NPCs are thinking…'}
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
          disabled={!inputEnabled}
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
          disabled={!inputEnabled || processing || !input.trim()}
          style={{
            minHeight: 44,
            padding: '0.5rem 1rem',
            cursor: inputEnabled ? 'pointer' : 'not-allowed',
            borderRadius: 6,
            border: '1px solid #333',
            background: '#333',
            color: '#fff',
            fontWeight: 'bold',
            opacity: (!inputEnabled || processing || !input.trim()) ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </div>
    </section>
  );
}
