/**
 * NpcCatalog screen tests
 *
 * Requirements:
 * - Shows loading state initially
 * - Renders a grid of NPC cards with name, race, npcType
 * - Shows personality summary on each card
 * - Calls onSelect with NPC templateKey when "Talk" button is clicked
 * - Shows empty state when no NPCs
 * - Supports search/filter by NPC name
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NpcCatalog } from './NpcCatalog.jsx';

const mockNpcs = [
  {
    templateKey: 'bree_millhaven',
    name: 'Bree',
    race: 'Halfling',
    npcType: 'friendly',
    personality: { disposition: 'cheerful', voice: 'light and quick' },
  },
  {
    templateKey: 'torval_grimm',
    name: 'Torval Grimm',
    race: 'Dwarf',
    npcType: 'friendly',
    personality: { disposition: 'gruff', voice: 'deep and gravelly' },
  },
  {
    templateKey: 'goblin',
    name: 'Goblin',
    race: 'Goblin',
    npcType: 'monster',
    personality: { disposition: 'hostile', voice: 'screeching' },
  },
];

describe('NpcCatalog', () => {
  it('shows loading state when npcs is null', () => {
    render(<NpcCatalog npcs={null} onSelect={vi.fn()} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows empty state when npcs is empty', () => {
    render(<NpcCatalog npcs={[]} onSelect={vi.fn()} />);
    expect(screen.getByText(/no npcs/i)).toBeInTheDocument();
  });

  it('renders NPC cards with name and race', () => {
    render(<NpcCatalog npcs={mockNpcs} onSelect={vi.fn()} />);

    expect(screen.getByText('Bree')).toBeInTheDocument();
    expect(screen.getByText('Torval Grimm')).toBeInTheDocument();
    expect(screen.getByText('Goblin')).toBeInTheDocument();
    expect(screen.getByText(/halfling/i)).toBeInTheDocument();
    expect(screen.getByText(/dwarf/i)).toBeInTheDocument();
  });

  it('shows disposition on each card', () => {
    render(<NpcCatalog npcs={mockNpcs} onSelect={vi.fn()} />);
    expect(screen.getByText(/cheerful/i)).toBeInTheDocument();
    expect(screen.getByText(/gruff/i)).toBeInTheDocument();
  });

  it('calls onSelect with templateKey when Talk button is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<NpcCatalog npcs={mockNpcs} onSelect={onSelect} />);

    const talkButtons = screen.getAllByRole('button', { name: /talk/i });
    await user.click(talkButtons[0]);

    expect(onSelect).toHaveBeenCalledWith('bree_millhaven');
  });

  it('filters NPCs by name when search is used', async () => {
    const user = userEvent.setup();
    render(<NpcCatalog npcs={mockNpcs} onSelect={vi.fn()} />);

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'bree');

    expect(screen.getByText('Bree')).toBeInTheDocument();
    expect(screen.queryByText('Torval Grimm')).not.toBeInTheDocument();
    expect(screen.queryByText('Goblin')).not.toBeInTheDocument();
  });

  it('shows all NPCs again when search is cleared', async () => {
    const user = userEvent.setup();
    render(<NpcCatalog npcs={mockNpcs} onSelect={vi.fn()} />);

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'bree');
    await user.clear(searchInput);

    expect(screen.getByText('Bree')).toBeInTheDocument();
    expect(screen.getByText('Torval Grimm')).toBeInTheDocument();
  });

  // ── Multi-select for scene mode ──

  it('shows a select checkbox on each card when onToggleSelect is provided', () => {
    render(
      <NpcCatalog
        npcs={mockNpcs}
        onSelect={vi.fn()}
        selectedNpcs={[]}
        onToggleSelect={vi.fn()}
      />
    );
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBe(mockNpcs.length);
  });

  it('does NOT show checkboxes when onToggleSelect is not provided', () => {
    render(<NpcCatalog npcs={mockNpcs} onSelect={vi.fn()} />);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('checks the checkbox for selected NPCs', () => {
    render(
      <NpcCatalog
        npcs={mockNpcs}
        onSelect={vi.fn()}
        selectedNpcs={[mockNpcs[0]]}
        onToggleSelect={vi.fn()}
      />
    );
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it('calls onToggleSelect with the NPC when checkbox is clicked', async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    render(
      <NpcCatalog
        npcs={mockNpcs}
        onSelect={vi.fn()}
        selectedNpcs={[]}
        onToggleSelect={onToggleSelect}
      />
    );
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);
    expect(onToggleSelect).toHaveBeenCalledWith(mockNpcs[1]);
  });

  it('highlights selected NPC cards visually', () => {
    const { container } = render(
      <NpcCatalog
        npcs={mockNpcs}
        onSelect={vi.fn()}
        selectedNpcs={[mockNpcs[0]]}
        onToggleSelect={vi.fn()}
      />
    );
    // First card should have the selected border color
    const cards = container.querySelectorAll('[data-testid="npc-card"]');
    expect(cards[0].style.borderColor).toBe('rgb(124, 58, 237)');
    expect(cards[1].style.borderColor).not.toBe('rgb(124, 58, 237)');
  });
});
