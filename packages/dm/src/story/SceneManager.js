const VALID_SCENES = new Set(['exploration', 'social', 'travel', 'combat', 'rest', 'shop']);

export function createSceneManager(initialScene = 'exploration') {
  if (!VALID_SCENES.has(initialScene)) {
    throw new Error(`UNKNOWN_SCENE_TYPE: ${initialScene}`);
  }

  let currentScene = initialScene;

  return {
    getCurrentScene() {
      return currentScene;
    },

    transitionTo(sceneType) {
      if (!VALID_SCENES.has(sceneType)) {
        throw new Error(`UNKNOWN_SCENE_TYPE: ${sceneType}`);
      }
      currentScene = sceneType;
      return currentScene;
    }
  };
}
