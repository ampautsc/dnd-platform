/**
 * App tests — screen router integration
 *
 * Requirements:
 * - starts at The Gate screen
 * - navigates to Character Select after joining
 * - navigates through full flow: gate → select → lobby → play → vote → end
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App.jsx';

describe('App', () => {
  it('renders the gate heading on start', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /d&d platform/i })).toBeInTheDocument();
  });

  it('renders join session button on start', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /join session/i })).toBeInTheDocument();
  });

  it('navigates to character select after joining', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/session code/i), 'ABCD');
    await user.type(screen.getByLabelText(/player name/i), 'Aria');
    await user.click(screen.getByRole('button', { name: /join session/i }));

    expect(screen.getByRole('heading', { name: /choose your champion/i })).toBeInTheDocument();
    expect(screen.getByText('Aria Moonwhisper')).toBeInTheDocument();
  });

  it('navigates to lobby after selecting character', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Gate → join
    await user.type(screen.getByLabelText(/session code/i), 'ABCD');
    await user.type(screen.getByLabelText(/player name/i), 'TestPlayer');
    await user.click(screen.getByRole('button', { name: /join session/i }));

    // CharacterSelect → select first
    const selectButtons = screen.getAllByRole('button', { name: /select/i });
    await user.click(selectButtons[0]);

    expect(screen.getByRole('heading', { name: /session lobby/i })).toBeInTheDocument();
    expect(screen.getByText('ABCD')).toBeInTheDocument();
  });

  it('navigates to exploration after ready up', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Gate → join
    await user.type(screen.getByLabelText(/session code/i), 'ABCD');
    await user.type(screen.getByLabelText(/player name/i), 'TestPlayer');
    await user.click(screen.getByRole('button', { name: /join session/i }));

    // CharacterSelect → select
    const selectButtons = screen.getAllByRole('button', { name: /select/i });
    await user.click(selectButtons[0]);

    // Lobby → ready up
    await user.click(screen.getByRole('button', { name: /ready up/i }));

    // Should auto-advance to play
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /adventure/i })).toBeInTheDocument();
    }, { timeout: 2000 });

    expect(screen.getByText(/dark cavern/i)).toBeInTheDocument();
  });

  it('renders Enter Bottoms Up button on gate screen', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /enter bottoms up/i })).toBeInTheDocument();
  });
});
