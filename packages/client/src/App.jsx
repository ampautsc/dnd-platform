import { useState, useCallback, useEffect } from 'react';
import { useScreen, SCREENS } from './hooks/useScreen.js';
import { TheGate } from './screens/TheGate/TheGate.jsx';
import { CharacterSelect } from './screens/CharacterSelect/CharacterSelect.jsx';
import { SessionLobby } from './screens/SessionLobby/SessionLobby.jsx';
import { Exploration } from './screens/Exploration/Exploration.jsx';
import { GroupVote } from './screens/GroupVote/GroupVote.jsx';
import { SessionEnd } from './screens/SessionEnd/SessionEnd.jsx';
import { NpcCatalog } from './screens/NpcCatalog/NpcCatalog.jsx';
import { NpcEncounter } from './screens/NpcEncounter/NpcEncounter.jsx';
import { NpcScene } from './screens/NpcScene/NpcScene.jsx';

/**
 * Demo fixtures for local dev — these simulate gateway responses.
 * In production the gateway pushes real data.
 */
const DEMO_CHARACTERS = [
  { id: 'c1', name: 'Aria Moonwhisper', class: 'Wizard', level: 5 },
  { id: 'c2', name: 'Thrak the Bold', class: 'Barbarian', level: 3 },
  { id: 'c3', name: 'Lyra Songsteel', class: 'Bard', level: 4 },
];

const DEMO_SCENE = {
  narration: 'You stand at the entrance to a dark cavern. Torchlight flickers against damp stone walls. The air smells of earth and something older.',
  actions: [
    { id: 'a1', label: 'Enter the cavern cautiously' },
    { id: 'a2', label: 'Search the entrance for traps' },
    { id: 'a3', label: 'Call out into the darkness' },
  ],
  npcDialogue: null,
};

const DEMO_VOTE = {
  prompt: 'The tunnel forks. Which path does the party take?',
  options: [
    { id: 'v1', label: 'Left — a narrow passage with strange markings', votes: 0 },
    { id: 'v2', label: 'Right — a wider tunnel with distant echoes', votes: 0 },
  ],
  hasVoted: false,
};

const DEMO_SUMMARY = {
  title: 'The Cavern of Echoes',
  chapterSummary: 'The party delved into the ancient cavern beneath the Whispering Hills, navigating treacherous passages and encountering a band of goblin scouts. Through quick thinking and sharp steel, they recovered a fragment of the Starfall Codex.',
  xp: 450,
  loot: ['Fragment of the Starfall Codex', 'Potion of Healing', '75 gold pieces'],
};

export function App() {
  const { screen, screenData, navigate } = useScreen();
  const [players, setPlayers] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const [scene, setScene] = useState(DEMO_SCENE);
  const [vote, setVote] = useState(DEMO_VOTE);

  // NPC encounter state
  const [npcList, setNpcList] = useState(null);
  const [encounter, setEncounter] = useState(null);
  const [npcSending, setNpcSending] = useState(false);

  // NPC scene state (multi-NPC initiative scenes)
  const [sceneState, setSceneState] = useState(null);
  const [sceneProcessing, setSceneProcessing] = useState(false);
  const [selectedNpcs, setSelectedNpcs] = useState([]);

  const handleJoin = useCallback((payload) => {
    navigate(SCREENS.CHARACTER_SELECT, { playerName: payload.playerName, code: payload.code });
  }, [navigate]);

  const handleSelectCharacter = useCallback((char) => {
    setPlayers([
      { id: 'self', name: screenData.playerName || 'You', ready: false },
      { id: 'p2', name: 'Waiting for players…', ready: false },
    ]);
    navigate(SCREENS.LOBBY, { character: char });
  }, [navigate, screenData.playerName]);

  const handleReady = useCallback(() => {
    setIsReady(true);
    setPlayers(prev => prev.map(p => p.id === 'self' ? { ...p, ready: true } : p));
    // In demo mode, auto-advance to play after a short delay
    setTimeout(() => {
      navigate(SCREENS.PLAY);
    }, 1000);
  }, [navigate]);

  const handleAction = useCallback((action) => {
    // Simulate a scene transition — in real app, gateway pushes next scene
    if (scene.npcDialogue) {
      // After NPC dialogue, go to vote
      navigate(SCREENS.VOTE);
    } else {
      setScene({
        narration: `You chose: "${action.label}". The cavern responds to your decision. A gravelly voice echoes from deeper within…`,
        actions: [
          { id: 'a4', label: 'Investigate the voice' },
          { id: 'a5', label: 'Retreat to safety' },
        ],
        npcDialogue: { speaker: 'Mysterious Voice', text: 'You dare enter my domain? Bold… or foolish.' },
      });
    }
  }, [navigate, scene]);

  const handleVote = useCallback((option) => {
    setVote(prev => ({
      ...prev,
      hasVoted: true,
      options: prev.options.map(o =>
        o.id === option.id ? { ...o, votes: o.votes + 1 } : o
      ),
    }));
    // Auto-advance to session end after voting
    setTimeout(() => {
      navigate(SCREENS.END);
    }, 1500);
  }, [navigate]);

  const handlePlayAgain = useCallback(() => {
    setIsReady(false);
    setScene(DEMO_SCENE);
    setVote(DEMO_VOTE);
    setPlayers([]);
    navigate(SCREENS.GATE);
  }, [navigate]);

  // ── NPC Catalog: fetch NPC list when entering catalog screen ──
  const handleOpenNpcCatalog = useCallback(() => {
    setNpcList(null);
    navigate(SCREENS.NPC_CATALOG);
    fetch('/api/content/npcs')
      .then(r => r.json())
      .then(data => setNpcList(data.npcs))
      .catch(() => setNpcList([]));
  }, [navigate]);

  // ── NPC Catalog: select an NPC to talk to ──
  const handleSelectNpc = useCallback((templateKey) => {
    setEncounter(null);
    navigate(SCREENS.NPC_ENCOUNTER);
    fetch('/api/encounters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ npcTemplateKeys: [templateKey] }),
    })
      .then(r => r.json())
      .then(data => setEncounter(data))
      .catch(() => setEncounter({ error: true }));
  }, [navigate]);

  // ── NPC Encounter: send a message ──
  const handleNpcSend = useCallback((text) => {
    if (!encounter?.encounterId) return;
    setNpcSending(true);
    fetch(`/api/encounters/${encounter.encounterId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
      .then(r => r.json())
      .then(data => {
        // Merge new messages into encounter state
        setEncounter(prev => ({
          ...prev,
          messages: [
            ...(prev.messages || []),
            data.playerMessage,
            ...data.npcResponses,
          ],
        }));
      })
      .catch(() => {})
      .finally(() => setNpcSending(false));
  }, [encounter?.encounterId]);

  // ── NPC Encounter: leave ──
  const handleNpcLeave = useCallback(() => {
    if (encounter?.encounterId) {
      fetch(`/api/encounters/${encounter.encounterId}/end`, { method: 'POST' }).catch(() => {});
    }
    setEncounter(null);
    handleOpenNpcCatalog();
  }, [encounter?.encounterId, handleOpenNpcCatalog]);

  // ── NPC Scene: toggle NPC selection for scene mode ──
  const handleToggleNpcSelection = useCallback((npc) => {
    setSelectedNpcs(prev => {
      const exists = prev.find(n => n.templateKey === npc.templateKey);
      if (exists) return prev.filter(n => n.templateKey !== npc.templateKey);
      return [...prev, npc];
    });
  }, []);

  // ── NPC Scene: start a multi-NPC scene ──
  const handleStartScene = useCallback(() => {
    if (selectedNpcs.length < 1) return;
    setSceneState(null);
    navigate(SCREENS.NPC_SCENE);

    const participants = [
      { id: 'player1', name: 'You', chaMod: 2, isPlayer: true },
      ...selectedNpcs.map(npc => ({
        id: `npc_${npc.templateKey}`,
        name: npc.name,
        chaMod: npc.personality?.chaMod ?? 0,
        isPlayer: false,
        templateKey: npc.templateKey,
      })),
    ];

    fetch('/api/scenes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participants }),
    })
      .then(r => r.json())
      .then(created => {
        // Start the scene (roll initiative)
        return fetch(`/api/scenes/${created.id}/start`, { method: 'POST' })
          .then(r => r.json());
      })
      .then(started => {
        setSceneState(started);
        setSelectedNpcs([]);
      })
      .catch(() => setSceneState({ error: true }));
  }, [selectedNpcs, navigate]);

  // ── NPC Scene: submit player action ──
  const handleSceneAction = useCallback((text) => {
    if (!sceneState?.id) return;
    setSceneProcessing(true);
    fetch(`/api/scenes/${sceneState.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantId: 'player1',
        type: 'speech',
        content: text,
      }),
    })
      .then(r => r.json())
      .then(data => setSceneState(data.sceneState))
      .catch(() => {})
      .finally(() => setSceneProcessing(false));
  }, [sceneState?.id]);

  // ── NPC Scene: leave ──
  const handleSceneLeave = useCallback(() => {
    if (sceneState?.id) {
      fetch(`/api/scenes/${sceneState.id}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'player_left' }),
      }).catch(() => {});
    }
    setSceneState(null);
    setSceneProcessing(false);
    navigate(SCREENS.GATE);
  }, [sceneState?.id, navigate]);

  // ── Enter a location scene (e.g. Bottoms Up) ──
  const handleEnterLocation = useCallback((locationId, locationImage) => {
    setSceneState(null);
    setSceneProcessing(false);
    navigate(SCREENS.NPC_SCENE, { locationImage });

    fetch('/api/scenes/at-location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId }),
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(started => setSceneState(started))
      .catch(() => setSceneState({ error: true }));
  }, [navigate]);

  return (
    <main style={{ maxWidth: 480, margin: '2rem auto', padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
      {screen === SCREENS.GATE && (
        <>
          <h1 style={{ marginBottom: '0.5rem' }}>D&amp;D Platform</h1>

          {/* ── Location Scenes ── */}
          <button
            onClick={() => handleEnterLocation('bottoms_up', '/images/locations/bottoms-up.png')}
            style={{
              width: '100%',
              minHeight: 56,
              padding: '0.75rem',
              cursor: 'pointer',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, #b45309, #92400e)',
              color: '#fff',
              fontWeight: 'bold',
              fontSize: '1.1rem',
              marginBottom: '0.75rem',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>🍺</span>
            <span>
              <span style={{ display: 'block' }}>Enter Bottoms Up</span>
              <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'normal', opacity: 0.85 }}>
                Tavern scene with Mira, Lell, and the regulars
              </span>
            </span>
          </button>

          <button
            onClick={handleOpenNpcCatalog}
            style={{
              width: '100%',
              minHeight: 48,
              padding: '0.75rem',
              cursor: 'pointer',
              borderRadius: 6,
              border: 'none',
              background: '#7c3aed',
              color: '#fff',
              fontWeight: 'bold',
              fontSize: '1.1rem',
              marginBottom: '2rem',
            }}
          >
            🗣️ Talk to NPCs
          </button>

          <details style={{ borderTop: '1px solid #444', paddingTop: '1rem' }}>
            <summary style={{ cursor: 'pointer', color: '#aaa', fontSize: '0.9rem' }}>
              Join a Game Session
            </summary>
            <div style={{ marginTop: '1rem' }}>
              <TheGate onJoin={handleJoin} />
            </div>
          </details>
        </>
      )}

      {screen === SCREENS.CHARACTER_SELECT && (
        <>
          <h1>Choose Your Champion</h1>
          <CharacterSelect characters={DEMO_CHARACTERS} onSelect={handleSelectCharacter} />
        </>
      )}

      {screen === SCREENS.LOBBY && (
        <>
          <h1>Session Lobby</h1>
          <p>Session: <strong>{screenData.code}</strong></p>
          <SessionLobby players={players} onReady={handleReady} isReady={isReady} />
        </>
      )}

      {screen === SCREENS.PLAY && (
        <>
          <h1>Adventure</h1>
          <Exploration scene={scene} onAction={handleAction} />
        </>
      )}

      {screen === SCREENS.VOTE && (
        <>
          <h1>Party Decision</h1>
          <GroupVote vote={vote} onVote={handleVote} />
        </>
      )}

      {screen === SCREENS.END && (
        <>
          <SessionEnd summary={DEMO_SUMMARY} onPlayAgain={handlePlayAgain} />
        </>
      )}

      {screen === SCREENS.NPC_CATALOG && (
        <>
          <h1>NPC Catalog</h1>

          {/* Scene mode: show selected count + start button */}
          {selectedNpcs.length > 0 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.5rem 0.75rem',
              marginBottom: '0.75rem',
              background: '#f0f0ff',
              borderRadius: 8,
              border: '1px solid #7c3aed',
            }}>
              <span>{selectedNpcs.length} NPC{selectedNpcs.length > 1 ? 's' : ''} selected</span>
              <button
                onClick={handleStartScene}
                style={{
                  minHeight: 36,
                  padding: '0.4rem 1rem',
                  cursor: 'pointer',
                  borderRadius: 6,
                  border: 'none',
                  background: '#7c3aed',
                  color: '#fff',
                  fontWeight: 'bold',
                }}
              >
                Start Scene
              </button>
            </div>
          )}

          <NpcCatalog
            npcs={npcList}
            onSelect={handleSelectNpc}
            selectedNpcs={selectedNpcs}
            onToggleSelect={handleToggleNpcSelection}
          />
          <button
            onClick={() => { setSelectedNpcs([]); navigate(SCREENS.GATE); }}
            style={{ marginTop: '1rem', minHeight: 36, padding: '0.4rem 1rem', cursor: 'pointer' }}
          >
            ← Back
          </button>
        </>
      )}

      {screen === SCREENS.NPC_ENCOUNTER && (
        <NpcEncounter
          encounter={encounter}
          onSend={handleNpcSend}
          onLeave={handleNpcLeave}
          sending={npcSending}
        />
      )}

      {screen === SCREENS.NPC_SCENE && (
        <>
          <h1>Scene</h1>
          <NpcScene
            scene={sceneState}
            onAction={handleSceneAction}
            onLeave={handleSceneLeave}
            processing={sceneProcessing}
            locationImage={screenData.locationImage}
          />
        </>
      )}
    </main>
  );
}
