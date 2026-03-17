/**
 * TheGate screen tests
 *
 * Requirements:
 * - renders session code and player name inputs
 * - renders join button
 * - calls onJoin with entered values on submit
 * - shows validation error when fields are missing
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TheGate } from './TheGate.jsx';

describe('TheGate', () => {
  it('renders gate form fields', () => {
    render(<TheGate onJoin={vi.fn()} />);

    expect(screen.getByLabelText(/session code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/player name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /join session/i })).toBeInTheDocument();
  });

  it('calls onJoin with entered values', async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn();
    render(<TheGate onJoin={onJoin} />);

    await user.type(screen.getByLabelText(/session code/i), 'ABCD');
    await user.type(screen.getByLabelText(/player name/i), 'Aria');
    await user.click(screen.getByRole('button', { name: /join session/i }));

    expect(onJoin).toHaveBeenCalledWith({ code: 'ABCD', playerName: 'Aria' });
  });

  it('shows validation error when fields are missing', async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn();
    render(<TheGate onJoin={onJoin} />);

    await user.click(screen.getByRole('button', { name: /join session/i }));

    expect(screen.getByText(/enter both session code and player name/i)).toBeInTheDocument();
    expect(onJoin).not.toHaveBeenCalled();
  });
});
