/**
 * Exploration screen tests
 *
 * Requirements:
 * - renders narrative text from DM
 * - renders action buttons from menu options
 * - calls onAction with selected action
 * - shows NPC dialogue when present
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Exploration } from './Exploration.jsx';

const mockScene = {
  narration: 'You stand at the entrance to a dark cavern. The air smells of damp earth.',
  actions: [
    { id: 'a1', label: 'Enter the cavern' },
    { id: 'a2', label: 'Search for traps' },
    { id: 'a3', label: 'Talk to the guard' },
  ],
  npcDialogue: null,
};

describe('Exploration', () => {
  it('renders narrative text', () => {
    render(<Exploration scene={mockScene} onAction={vi.fn()} />);

    expect(screen.getByText(/dark cavern/i)).toBeInTheDocument();
  });

  it('renders action buttons', () => {
    render(<Exploration scene={mockScene} onAction={vi.fn()} />);

    expect(screen.getByRole('button', { name: /enter the cavern/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /search for traps/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /talk to the guard/i })).toBeInTheDocument();
  });

  it('calls onAction with selected action', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<Exploration scene={mockScene} onAction={onAction} />);

    await user.click(screen.getByRole('button', { name: /enter the cavern/i }));

    expect(onAction).toHaveBeenCalledWith(mockScene.actions[0]);
  });

  it('shows NPC dialogue when present', () => {
    const sceneWithNpc = {
      ...mockScene,
      npcDialogue: { speaker: 'Innkeeper', text: 'Welcome, traveler!' },
    };
    render(<Exploration scene={sceneWithNpc} onAction={vi.fn()} />);

    expect(screen.getByText('Innkeeper')).toBeInTheDocument();
    expect(screen.getByText(/welcome, traveler/i)).toBeInTheDocument();
  });

  it('shows waiting message when no actions available', () => {
    const waitScene = { ...mockScene, actions: [] };
    render(<Exploration scene={waitScene} onAction={vi.fn()} />);

    expect(screen.getByText(/waiting/i)).toBeInTheDocument();
  });
});
