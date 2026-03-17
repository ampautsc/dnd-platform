/**
 * CharacterSelect screen tests
 *
 * Requirements:
 * - renders a list of character cards
 * - calls onSelect with the chosen character
 * - shows loading state when characters is null
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CharacterSelect } from './CharacterSelect.jsx';

const mockCharacters = [
  { id: 'c1', name: 'Aria Moonwhisper', class: 'Wizard', level: 5 },
  { id: 'c2', name: 'Thrak the Bold', class: 'Barbarian', level: 3 },
];

describe('CharacterSelect', () => {
  it('renders character cards', () => {
    render(<CharacterSelect characters={mockCharacters} onSelect={vi.fn()} />);

    expect(screen.getByText('Aria Moonwhisper')).toBeInTheDocument();
    expect(screen.getByText('Thrak the Bold')).toBeInTheDocument();
  });

  it('shows class and level for each character', () => {
    render(<CharacterSelect characters={mockCharacters} onSelect={vi.fn()} />);

    expect(screen.getByText(/wizard/i)).toBeInTheDocument();
    expect(screen.getByText(/level 5/i)).toBeInTheDocument();
  });

  it('calls onSelect with the chosen character', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<CharacterSelect characters={mockCharacters} onSelect={onSelect} />);

    const buttons = screen.getAllByRole('button', { name: /select/i });
    await user.click(buttons[0]);

    expect(onSelect).toHaveBeenCalledWith(mockCharacters[0]);
  });

  it('shows loading state when characters is null', () => {
    render(<CharacterSelect characters={null} onSelect={vi.fn()} />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows empty state when characters is empty array', () => {
    render(<CharacterSelect characters={[]} onSelect={vi.fn()} />);

    expect(screen.getByText(/no characters/i)).toBeInTheDocument();
  });
});
