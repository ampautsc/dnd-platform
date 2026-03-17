/**
 * SessionEnd screen tests
 *
 * Requirements:
 * - renders session complete message
 * - shows chapter summary
 * - shows XP and loot gained
 * - renders Play Again button
 * - calls onPlayAgain when clicked
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionEnd } from './SessionEnd.jsx';

const mockSummary = {
  title: 'The Cavern of Echoes',
  chapterSummary: 'The party delved deep into the cavern, defeated the goblin horde, and recovered the ancient artifact.',
  xp: 450,
  loot: ['Sword of Flames', 'Potion of Healing'],
};

describe('SessionEnd', () => {
  it('renders session complete heading', () => {
    render(<SessionEnd summary={mockSummary} onPlayAgain={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /session complete/i })).toBeInTheDocument();
  });

  it('shows chapter title', () => {
    render(<SessionEnd summary={mockSummary} onPlayAgain={vi.fn()} />);

    expect(screen.getByText(/the cavern of echoes/i)).toBeInTheDocument();
  });

  it('shows chapter summary', () => {
    render(<SessionEnd summary={mockSummary} onPlayAgain={vi.fn()} />);

    expect(screen.getByText(/goblin horde/i)).toBeInTheDocument();
  });

  it('shows XP gained', () => {
    render(<SessionEnd summary={mockSummary} onPlayAgain={vi.fn()} />);

    expect(screen.getByText(/450 xp/i)).toBeInTheDocument();
  });

  it('shows loot gained', () => {
    render(<SessionEnd summary={mockSummary} onPlayAgain={vi.fn()} />);

    expect(screen.getByText(/sword of flames/i)).toBeInTheDocument();
    expect(screen.getByText(/potion of healing/i)).toBeInTheDocument();
  });

  it('renders Play Again button and calls callback', async () => {
    const user = userEvent.setup();
    const onPlayAgain = vi.fn();
    render(<SessionEnd summary={mockSummary} onPlayAgain={onPlayAgain} />);

    await user.click(screen.getByRole('button', { name: /play again/i }));

    expect(onPlayAgain).toHaveBeenCalled();
  });
});
