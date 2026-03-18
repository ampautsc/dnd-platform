/**
 * NpcEncounter screen tests
 *
 * Requirements:
 * - Shows loading state while encounter is being created
 * - Displays NPC name and status once encounter is active
 * - Renders chat messages — player on right, NPC on left
 * - Allows typing and sending a message
 * - Shows "thinking" indicator while NPC is responding
 * - Calls onLeave when "Leave" button is clicked
 * - Handles encounter end state
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NpcEncounter } from './NpcEncounter.jsx';

const mockEncounter = {
  encounterId: 'enc_test1',
  npcs: [
    { templateKey: 'bree_millhaven', name: 'Bree', race: 'Halfling', npcType: 'friendly', disposition: 'cheerful' },
  ],
  messages: [],
  worldContext: { location: 'a quiet tavern', timeOfDay: 'evening', tone: 'conversational' },
  status: 'active',
};

const mockMessages = [
  { id: 'msg1', sender: 'player', senderName: 'Hero', text: 'Hello Bree!', timestamp: 1000 },
  { id: 'msg2', sender: 'bree_millhaven', senderName: 'Bree', text: 'Well hello there, traveler!', timestamp: 2000 },
];

describe('NpcEncounter', () => {
  it('shows loading state when encounter is null', () => {
    render(<NpcEncounter encounter={null} onSend={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.getByText(/loading|connecting/i)).toBeInTheDocument();
  });

  it('displays NPC name when encounter is active', () => {
    render(<NpcEncounter encounter={mockEncounter} onSend={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.getByText('Bree')).toBeInTheDocument();
  });

  it('displays world context location', () => {
    render(<NpcEncounter encounter={mockEncounter} onSend={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.getByText(/quiet tavern/i)).toBeInTheDocument();
  });

  it('renders chat messages', () => {
    const encounter = { ...mockEncounter, messages: mockMessages };
    render(<NpcEncounter encounter={encounter} onSend={vi.fn()} onLeave={vi.fn()} />);

    expect(screen.getByText('Hello Bree!')).toBeInTheDocument();
    expect(screen.getByText('Well hello there, traveler!')).toBeInTheDocument();
  });

  it('allows typing and sending a message', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<NpcEncounter encounter={mockEncounter} onSend={onSend} onLeave={vi.fn()} />);

    const input = screen.getByPlaceholderText(/say something|type/i);
    await user.type(input, 'How are you?');
    
    const sendButton = screen.getByRole('button', { name: /send/i });
    await user.click(sendButton);

    expect(onSend).toHaveBeenCalledWith('How are you?');
  });

  it('clears input after sending', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<NpcEncounter encounter={mockEncounter} onSend={onSend} onLeave={vi.fn()} />);

    const input = screen.getByPlaceholderText(/say something|type/i);
    await user.type(input, 'Hello');
    
    const sendButton = screen.getByRole('button', { name: /send/i });
    await user.click(sendButton);

    expect(input.value).toBe('');
  });

  it('shows thinking indicator when sending is true', () => {
    render(
      <NpcEncounter encounter={mockEncounter} onSend={vi.fn()} onLeave={vi.fn()} sending={true} />
    );
    expect(screen.getByText(/thinking|typing/i)).toBeInTheDocument();
  });

  it('calls onLeave when Leave button is clicked', async () => {
    const user = userEvent.setup();
    const onLeave = vi.fn();
    render(<NpcEncounter encounter={mockEncounter} onSend={vi.fn()} onLeave={onLeave} />);

    const leaveBtn = screen.getByRole('button', { name: /leave/i });
    await user.click(leaveBtn);

    expect(onLeave).toHaveBeenCalled();
  });

  it('disables input when encounter has ended', () => {
    const ended = { ...mockEncounter, status: 'ended' };
    render(<NpcEncounter encounter={ended} onSend={vi.fn()} onLeave={vi.fn()} />);

    const input = screen.getByPlaceholderText(/say something|type|ended/i);
    expect(input).toBeDisabled();
  });
});
