function buildUnknownResult(text) {
  return {
    intent: 'unknown',
    requiresCheck: false,
    check: null,
    narrationSeed: `The party attempts: ${text}`,
  };
}

export function createActionProcessor() {
  return {
    process({ text }) {
      const normalized = text.toLowerCase();

      if (normalized.includes('search') || normalized.includes('look for') || normalized.includes('tracks')) {
        return {
          intent: 'investigate',
          requiresCheck: true,
          check: { ability: 'wis', skill: 'perception', dc: 12 },
          narrationSeed: 'You carefully scan the area for meaningful signs.',
        };
      }

      if (normalized.includes('persuade') || normalized.includes('convince') || normalized.includes('negotiate')) {
        return {
          intent: 'persuade',
          requiresCheck: true,
          check: { ability: 'cha', skill: 'persuasion', dc: 13 },
          narrationSeed: 'You make your case and wait for their reaction.',
        };
      }

      return buildUnknownResult(text);
    },
  };
}
