/**
 * useScreen hook tests
 *
 * Requirements:
 * - starts at GATE by default
 * - navigate() transitions to next screen
 * - navigate() merges data into screenData
 * - supports custom initial screen
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScreen, SCREENS } from './useScreen.js';

describe('useScreen', () => {
  it('starts at GATE by default', () => {
    const { result } = renderHook(() => useScreen());
    expect(result.current.screen).toBe(SCREENS.GATE);
  });

  it('navigate() transitions to next screen', () => {
    const { result } = renderHook(() => useScreen());

    act(() => result.current.navigate(SCREENS.CHARACTER_SELECT));

    expect(result.current.screen).toBe(SCREENS.CHARACTER_SELECT);
  });

  it('navigate() merges data into screenData', () => {
    const { result } = renderHook(() => useScreen());

    act(() => result.current.navigate(SCREENS.LOBBY, { sessionId: '123' }));

    expect(result.current.screenData.sessionId).toBe('123');
  });

  it('supports custom initial screen', () => {
    const { result } = renderHook(() => useScreen(SCREENS.PLAY));
    expect(result.current.screen).toBe(SCREENS.PLAY);
  });
});
