/**
 * NarrationGenerator
 *
 * Produces the DM's "book pages" — prose text, image generation prompts,
 * and speech synthesis directives. Delegates image prompt construction to
 * the injected ImagePromptBuilder and prose generation to the LLM provider.
 */

const NARRATION_SYSTEM_PROMPT = [
  'You are the Dungeon Master narrating a D&D adventure as a book page.',
  'Write immersive second-person prose ("You see...", "The air around you...").',
  'Be vivid, atmospheric, and concise — one to three paragraphs.',
  'Match tone and pacing to the mood and scene type provided.',
  'Do not include game mechanics, dice rolls, or meta-commentary.',
].join(' ');

const FALLBACK_TEXT = 'The world stretches before you, full of possibility and peril.';

const PACE_BY_SCENE_TYPE = {
  combat: 'fast',
  rest: 'slow',
  exploration: 'moderate',
  social: 'moderate',
  travel: 'moderate',
  shop: 'moderate',
};

const DEFAULT_VOICE = 'narrator';

function buildUserPrompt(input) {
  const parts = [];

  if (input.scene) parts.push(`Scene: ${input.scene}`);
  if (input.characters && input.characters.length > 0) {
    const charStr = input.characters.map(c => `${c.name} (${c.descriptor || 'adventurer'})`).join(', ');
    parts.push(`Characters present: ${charStr}`);
  }
  if (input.mood) parts.push(`Mood: ${input.mood}`);
  if (input.action) parts.push(`Current action: ${input.action}`);
  if (input.environment) parts.push(`Environment: ${input.environment}`);
  if (input.sceneType) parts.push(`Scene type: ${input.sceneType}`);

  return parts.join('\n');
}

function buildSpeechDirective(input) {
  const sceneType = input.sceneType || 'default';
  const pace = PACE_BY_SCENE_TYPE[sceneType] || 'moderate';
  const tone = input.mood || 'neutral';
  const voice = DEFAULT_VOICE;

  return { voice, pace, tone };
}

export function createNarrationGenerator(options = {}) {
  const { provider, imagePromptBuilder } = options;
  const nowFn = options.nowFn || (() => new Date().toISOString());

  async function generatePage(input = {}) {
    const { scene, characters, mood, action, environment, sceneType } = input;

    // Build image prompt regardless (fallback handles empty scene)
    const imagePrompt = imagePromptBuilder.buildPrompt({ scene, characters, mood, action, environment });

    // Build speech directive
    const speechDirective = buildSpeechDirective(input);

    // Fallback for missing scene — no LLM call
    if (!scene || scene.trim().length === 0) {
      return {
        text: FALLBACK_TEXT,
        imagePrompt,
        speechDirective,
        sceneType: sceneType || 'unknown',
        generatedAt: nowFn(),
      };
    }

    // Generate prose via LLM
    const userPrompt = buildUserPrompt(input);
    const response = await provider.generateResponse({
      systemPrompt: NARRATION_SYSTEM_PROMPT,
      userPrompt,
    });

    return {
      text: response.text,
      imagePrompt,
      speechDirective,
      sceneType: sceneType || 'unknown',
      generatedAt: nowFn(),
    };
  }

  return { generatePage };
}
