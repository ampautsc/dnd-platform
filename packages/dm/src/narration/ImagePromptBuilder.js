/**
 * ImagePromptBuilder
 *
 * Crafts image generation prompts from narrative context.
 * Pure function — no LLM calls, no async, no side effects.
 */

const DEFAULT_STYLE = 'fantasy illustration';

const NEGATIVE_PROMPT = [
  'modern technology', 'cars', 'phones', 'computers', 'logos',
  'text overlays', 'watermarks', 'signatures', 'blurry', 'low quality',
  'deformed', 'extra limbs', 'mutated',
].join(', ');

const FALLBACK_PROMPT = 'A sweeping fantasy landscape, rich with detail and atmosphere.';

function serializeCharacters(characters) {
  if (!characters || characters.length === 0) return '';
  return characters
    .map(c => `${c.name} (${c.descriptor || 'adventurer'})`)
    .join(', ');
}

export function createImagePromptBuilder(options = {}) {
  const defaultStyle = options.defaultStyle || DEFAULT_STYLE;

  function buildPrompt(input = {}) {
    const { scene, characters, mood, action, environment } = input;

    if (!scene || scene.trim().length === 0) {
      return {
        prompt: FALLBACK_PROMPT,
        style: defaultStyle,
        negativePrompt: NEGATIVE_PROMPT,
      };
    }

    const parts = [scene];

    const charStr = serializeCharacters(characters);
    if (charStr) {
      parts.push(`Characters: ${charStr}`);
    }

    if (action) {
      parts.push(action);
    }

    if (mood) {
      parts.push(`Mood: ${mood}`);
    }

    if (environment) {
      parts.push(`Setting: ${environment}`);
    }

    return {
      prompt: parts.join('. ') + '.',
      style: defaultStyle,
      negativePrompt: NEGATIVE_PROMPT,
    };
  }

  return { buildPrompt };
}
