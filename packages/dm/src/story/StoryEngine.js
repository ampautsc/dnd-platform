const BEAT_TENSION_RATING = {
  'exploration.discovery': 1,
  'social.success': -1,
  'social.tension': 1,
  'conflict.discovery': 2,
  'combat.start': 3,
  'combat.critical': 2,
  'combat.end': -4,
  'rest.short': -2,
  'rest.long': -5,
};

export function createStoryEngine() {
  let tension = 1;

  function updateArcState(currentTension) {
    if (currentTension >= 8) return 'climax';
    if (currentTension >= 4) return 'rising_action';
    if (currentTension <= 2) return 'introduction';
    return 'rising_action'; // fallback/mid-range
  }

  // Pre-calculate initial arc state based on starting tension
  let arc = updateArcState(tension);

  return {
    getStoryState() {
      return { arc, tension };
    },

    recordBeat({ type }) {
      const modifier = BEAT_TENSION_RATING[type] || 0;
      tension = Math.max(0, Math.min(10, tension + modifier));
      arc = updateArcState(tension);
    }
  };
}
