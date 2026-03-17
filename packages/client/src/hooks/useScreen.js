/**
 * useScreen — Screen state machine for navigation.
 *
 * Screens flow:
 *   gate → characterSelect → lobby → play → vote → end
 *
 * "play" is the exploration/social scene. Combat would be another but
 * we keep it simple for the MVP flow.
 */
import { useState, useCallback } from 'react';

export const SCREENS = {
  GATE: 'gate',
  CHARACTER_SELECT: 'characterSelect',
  LOBBY: 'lobby',
  PLAY: 'play',
  VOTE: 'vote',
  END: 'end',
};

export function useScreen(initial = SCREENS.GATE) {
  const [screen, setScreen] = useState(initial);
  const [screenData, setScreenData] = useState({});

  const navigate = useCallback((nextScreen, data = {}) => {
    setScreen(nextScreen);
    setScreenData(prev => ({ ...prev, ...data }));
  }, []);

  return { screen, screenData, navigate };
}
