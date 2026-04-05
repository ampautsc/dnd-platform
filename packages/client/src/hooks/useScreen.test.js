/**
 * useScreen hook tests
 *
 * Requirements:
 * - starts at GATE by default
 * - navigate() transitions to next screen
 * - navigate() merges data into screenData
 * - supports custom initial screen
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderHook, act } from '@testing-library/react';
import { useScreen, SCREENS } from './useScreen.js';

describe('useScreen', () => {
  it('starts at GATE by default', () => {
    const { result } = renderHook(() => useScreen());
    assert.strictEqual(result.current.screen, SCREENS.GATE);
  });

  it('navigate() transitions to next screen', () => {
    const { result } = renderHook(() => useScreen());

    act(() => result.current.navigate(SCREENS.CHARACTER_SELECT));

    assert.strictEqual(result.current.screen, SCREENS.CHARACTER_SELECT);
  });

  it('navigate() merges data into screenData', () => {
    const { result } = renderHook(() => useScreen());

    act(() => result.current.navigate(SCREENS.LOBBY, { sessionId: '123' }));

    assert.strictEqual(result.current.screenData.sessionId, '123');
  });

  it('supports custom initial screen', () => {
    const { result } = renderHook(() => useScreen(SCREENS.PLAY));
    assert.strictEqual(result.current.screen, SCREENS.PLAY);
  });
});
