/**
 * NpcScene screen tests
 *
 * Requirements:
 * - Shows loading state when scene is null
 * - Displays participant names
 * - Shows initiative order
 * - Indicates whose turn it is
 * - Renders transcript entries (speech, actions, observations)
 * - Enables input when it's the player's turn
 * - Disables input when it's NOT the player's turn
 * - Calls onAction with typed text when Send is clicked
 * - Clears input after sending
 * - Calls onLeave when Leave is clicked
 * - Shows "thinking" while NPCs are resolving
 * - Disables input when scene has ended
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NpcScene } from './NpcScene.jsx';

const mockScene = {
  id: 'scene_test1',
  participants: [
    { id: 'player1', name: 'You', isPlayer: true, chaMod: 2 },
    { id: 'npc_bree', name: 'Bree', isPlayer: false, chaMod: 3 },
    { id: 'npc_gareth', name: 'Gareth', isPlayer: false, chaMod: 1 },
  ],
  initiativeOrder: ['npc_bree', 'player1', 'npc_gareth'],
  round: 1,
  turnIndex: 1, // player1's turn
  transcript: [],
  status: 'active',
  pendingAction: 'player1',
};

const sceneWithTranscript = {
  ...mockScene,
  transcript: [
    { id: 't1', participantId: 'npc_bree', participantName: 'Bree', type: 'speech', content: 'Welcome to my tavern!', round: 1 },
    { id: 't2', participantId: 'player1', participantName: 'You', type: 'speech', content: 'Thanks! Nice place.', round: 1 },
    { id: 't3', participantId: 'npc_gareth', participantName: 'Gareth', type: 'act', content: '*nods quietly from the corner*', round: 1 },
  ],
};

describe('NpcScene', () => {
  it('shows loading state when scene is null', () => {
    render(<NpcScene scene={null} onAction={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.getByText(/loading|starting|connecting/i)).toBeInTheDocument();
  });

  it('displays participant names', () => {
    render(<NpcScene scene={mockScene} onAction={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.getByText(/Bree/)).toBeInTheDocument();
    expect(screen.getByText(/Gareth/)).toBeInTheDocument();
  });

  it('shows round number', () => {
    render(<NpcScene scene={mockScene} onAction={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.getByText(/round 1/i)).toBeInTheDocument();
  });

  it('indicates whose turn it is', () => {
    render(<NpcScene scene={mockScene} onAction={vi.fn()} onLeave={vi.fn()} />);
    // pendingAction is 'player1' which is 'You'
    expect(screen.getByText(/your turn/i)).toBeInTheDocument();
  });

  it('renders transcript entries', () => {
    render(<NpcScene scene={sceneWithTranscript} onAction={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.getByText(/Welcome to my tavern!/)).toBeInTheDocument();
    expect(screen.getByText(/Nice place/)).toBeInTheDocument();
    expect(screen.getByText(/nods quietly/)).toBeInTheDocument();
  });

  it('enables input when it is the player turn', () => {
    render(<NpcScene scene={mockScene} onAction={vi.fn()} onLeave={vi.fn()} />);
    const input = screen.getByPlaceholderText(/what do you do|your action|say or do/i);
    expect(input).not.toBeDisabled();
  });

  it('disables input when it is NOT the player turn', () => {
    const npcTurn = {
      ...mockScene,
      turnIndex: 0, // npc_bree's turn
      pendingAction: 'npc_bree',
    };
    render(<NpcScene scene={npcTurn} onAction={vi.fn()} onLeave={vi.fn()} />);
    const input = screen.getByPlaceholderText(/waiting|npc|their turn/i);
    expect(input).toBeDisabled();
  });

  it('calls onAction with typed text when Send is clicked', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<NpcScene scene={mockScene} onAction={onAction} onLeave={vi.fn()} />);

    const input = screen.getByPlaceholderText(/what do you do|your action|say or do/i);
    await user.type(input, 'I greet everyone warmly');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(onAction).toHaveBeenCalledWith('I greet everyone warmly');
  });

  it('clears input after sending', async () => {
    const user = userEvent.setup();
    render(<NpcScene scene={mockScene} onAction={vi.fn()} onLeave={vi.fn()} />);

    const input = screen.getByPlaceholderText(/what do you do|your action|say or do/i);
    await user.type(input, 'Hello');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(input.value).toBe('');
  });

  it('shows thinking indicator when processing is true', () => {
    // processing=true during NPC turn resolution — transcript is non-empty at this point
    render(<NpcScene scene={sceneWithTranscript} onAction={vi.fn()} onLeave={vi.fn()} processing={true} />);
    expect(screen.getByText(/thinking|resolving/i)).toBeInTheDocument();
  });

  it('shows setting the scene indicator during initial load (processing=true, empty transcript)', () => {
    render(<NpcScene scene={mockScene} onAction={vi.fn()} onLeave={vi.fn()} processing={true} />);
    expect(screen.getByText(/setting the scene/i)).toBeInTheDocument();
  });

  it('calls onLeave when Leave is clicked', async () => {
    const user = userEvent.setup();
    const onLeave = vi.fn();
    render(<NpcScene scene={mockScene} onAction={vi.fn()} onLeave={onLeave} />);

    await user.click(screen.getByRole('button', { name: /leave/i }));
    expect(onLeave).toHaveBeenCalled();
  });

  it('disables input when scene has ended', () => {
    const ended = { ...mockScene, status: 'ended' };
    render(<NpcScene scene={ended} onAction={vi.fn()} onLeave={vi.fn()} />);
    const input = screen.getByPlaceholderText(/ended|over/i);
    expect(input).toBeDisabled();
  });

  // ── Location image ──

  it('renders location image when locationImage prop is provided', () => {
    render(
      <NpcScene
        scene={mockScene}
        onAction={vi.fn()}
        onLeave={vi.fn()}
        locationImage="/images/locations/bottoms-up.png"
      />
    );
    const img = screen.getByRole('img', { name: /scene location/i });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/images/locations/bottoms-up.png');
  });

  it('does NOT render location image when prop is not provided', () => {
    render(<NpcScene scene={mockScene} onAction={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.queryByRole('img', { name: /scene location/i })).not.toBeInTheDocument();
  });

  // ── DM Narration ──

  it('renders DM narration entries with distinct styling', () => {
    const sceneWithNarration = {
      ...mockScene,
      transcript: [
        { id: 't1', participantId: 'player1', participantName: 'You', type: 'speech', content: 'Hello!', round: 1 },
        { id: 't2', participantId: 'dm', participantName: 'DM', type: 'narration', content: 'Bree looks up from behind the bar and smiles warmly.', round: 1 },
      ],
    };
    render(<NpcScene scene={sceneWithNarration} onAction={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.getByText(/Bree looks up from behind the bar/)).toBeInTheDocument();
  });
});
