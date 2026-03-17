/**
 * GroupVote screen tests
 *
 * Requirements:
 * - renders the vote prompt
 * - renders vote option buttons
 * - calls onVote with selected option
 * - shows current vote tally
 * - disables buttons after voting
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupVote } from './GroupVote.jsx';

const mockVote = {
  prompt: 'The road forks. Which path do you take?',
  options: [
    { id: 'v1', label: 'Left — through the forest', votes: 1 },
    { id: 'v2', label: 'Right — along the river', votes: 2 },
  ],
  hasVoted: false,
};

describe('GroupVote', () => {
  it('renders the vote prompt', () => {
    render(<GroupVote vote={mockVote} onVote={vi.fn()} />);

    expect(screen.getByText(/which path do you take/i)).toBeInTheDocument();
  });

  it('renders vote option buttons', () => {
    render(<GroupVote vote={mockVote} onVote={vi.fn()} />);

    expect(screen.getByRole('button', { name: /left.*forest/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /right.*river/i })).toBeInTheDocument();
  });

  it('calls onVote with selected option', async () => {
    const user = userEvent.setup();
    const onVote = vi.fn();
    render(<GroupVote vote={mockVote} onVote={onVote} />);

    await user.click(screen.getByRole('button', { name: /left.*forest/i }));

    expect(onVote).toHaveBeenCalledWith(mockVote.options[0]);
  });

  it('shows current vote tally', () => {
    render(<GroupVote vote={mockVote} onVote={vi.fn()} />);

    expect(screen.getByText(/1 vote/i)).toBeInTheDocument();
    expect(screen.getByText(/2 votes/i)).toBeInTheDocument();
  });

  it('disables buttons after voting', () => {
    const voted = { ...mockVote, hasVoted: true };
    render(<GroupVote vote={voted} onVote={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    buttons.forEach(btn => expect(btn).toBeDisabled());
  });
});
