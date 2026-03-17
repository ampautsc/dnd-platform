import { useState, useCallback } from 'react';
import { useScreen, SCREENS } from './hooks/useScreen.js';
import { TheGate } from './screens/TheGate/TheGate.jsx';
import { CharacterSelect } from './screens/CharacterSelect/CharacterSelect.jsx';
import { SessionLobby } from './screens/SessionLobby/SessionLobby.jsx';
import { Exploration } from './screens/Exploration/Exploration.jsx';
import { GroupVote } from './screens/GroupVote/GroupVote.jsx';
import { SessionEnd } from './screens/SessionEnd/SessionEnd.jsx';

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

  return (
    <main style={{ maxWidth: 480, margin: '2rem auto', padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
      {screen === SCREENS.GATE && (
        <>
          <h1>The Gate</h1>
          <p>Who goes there?</p>
          <TheGate onJoin={handleJoin} />
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
    </main>
  );
}
