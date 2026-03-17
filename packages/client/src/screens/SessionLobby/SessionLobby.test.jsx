/**
 * SessionLobby screen tests
 *
 * Requirements:
 * - renders list of connected players
 * - shows ready status for each player
 * - renders Ready Up button
 * - calls onReady when button clicked
 * - shows waiting message when not all ready
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionLobby } from './SessionLobby.jsx';

const mockPlayers = [
  { id: 'p1', name: 'Aria', ready: true },
  { id: 'p2', name: 'Thrak', ready: false },
];

describe('SessionLobby', () => {
  it('renders connected players', () => {
    render(<SessionLobby players={mockPlayers} onReady={vi.fn()} isReady={false} />);

    expect(screen.getByText('Aria')).toBeInTheDocument();
    expect(screen.getByText('Thrak')).toBeInTheDocument();
  });

  it('shows ready status for each player', () => {
    render(<SessionLobby players={mockPlayers} onReady={vi.fn()} isReady={false} />);

    expect(screen.getByText(/✓ Ready/)).toBeInTheDocument();
    expect(screen.getByText(/Waiting…/)).toBeInTheDocument();
  });

  it('renders Ready Up button', () => {
    render(<SessionLobby players={mockPlayers} onReady={vi.fn()} isReady={false} />);

    expect(screen.getByRole('button', { name: /ready up/i })).toBeInTheDocument();
  });

  it('calls onReady when button clicked', async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    render(<SessionLobby players={mockPlayers} onReady={onReady} isReady={false} />);

    await user.click(screen.getByRole('button', { name: /ready up/i }));

    expect(onReady).toHaveBeenCalled();
  });

  it('disables button when already ready', () => {
    render(<SessionLobby players={mockPlayers} onReady={vi.fn()} isReady={true} />);

    expect(screen.getByRole('button', { name: /ready/i })).toBeDisabled();
  });
});
