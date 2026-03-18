import { useState, useRef, useEffect } from 'react';

/**
 * NpcEncounter — full-screen chat with one or more NPCs.
 *
 * Props:
 *   encounter — encounter state object (null = loading)
 *   onSend    — called with text string when player sends a message
 *   onLeave   — called when player clicks Leave
 *   sending   — boolean, true while waiting for NPC response
 */
export function NpcEncounter({ encounter, onSend, onLeave, sending = false }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [encounter?.messages?.length]);

  if (!encounter) {
    return <p style={{ textAlign: 'center', padding: '2rem' }}>Connecting to encounter…</p>;
  }

  const { npcs, messages, worldContext, status } = encounter;
  const isEnded = status === 'ended';
  const npcNames = npcs.map(n => n.name).join(', ');

  const handleSend = () => {
    const text = input.trim();
    if (!text || isEnded) return;
    onSend(text);
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <section style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: '60vh',
    }}>
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
          <strong style={{ fontSize: '1.1rem' }}>{npcNames}</strong>
          <span style={{ display: 'block', fontSize: '0.8rem', color: '#888' }}>
            {worldContext?.location}
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

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0.5rem 0',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}>
        {messages.map(msg => {
          const isPlayer = msg.sender === 'player';
          return (
            <div
              key={msg.id}
              style={{
                alignSelf: isPlayer ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                padding: '0.5rem 0.75rem',
                borderRadius: 12,
                background: isPlayer ? '#333' : '#e8e8e8',
                color: isPlayer ? '#fff' : '#222',
              }}
            >
              {!isPlayer && (
                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '0.2rem' }}>
                  {msg.senderName}
                </div>
              )}
              <div>{msg.text}</div>
            </div>
          );
        })}

        {sending && (
          <div style={{
            alignSelf: 'flex-start',
            padding: '0.5rem 0.75rem',
            borderRadius: 12,
            background: '#e8e8e8',
            color: '#888',
            fontStyle: 'italic',
          }}>
            {npcs[0]?.name || 'NPC'} is thinking…
          </div>
        )}

        <div ref={messagesEndRef} />
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
          placeholder={isEnded ? 'Encounter ended' : 'Say something…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isEnded}
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
          disabled={isEnded || sending || !input.trim()}
          style={{
            minHeight: 44,
            padding: '0.5rem 1rem',
            cursor: isEnded ? 'not-allowed' : 'pointer',
            borderRadius: 6,
            border: '1px solid #333',
            background: '#333',
            color: '#fff',
            fontWeight: 'bold',
            opacity: (isEnded || sending || !input.trim()) ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </div>
    </section>
  );
}
