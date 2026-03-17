import { createGameLog } from './services/GameLog.js';
import { createSessionManager } from './services/SessionManager.js';
import { createActionProcessor } from './services/ActionProcessor.js';
import { createSceneManager } from './story/SceneManager.js';
import { createStoryEngine } from './story/StoryEngine.js';
import { createChapterGenerator } from './story/ChapterGenerator.js';
import { createImagePromptBuilder } from './narration/ImagePromptBuilder.js';
import { createNarrationGenerator } from './narration/NarrationGenerator.js';
import { createGroupDecisionArbiter } from './actions/GroupDecisionArbiter.js';
import { createPartyCoherenceMonitor } from './actions/PartyCoherenceMonitor.js';
import { CharacterResponseService } from './npc/CharacterResponseService.js';
import { CharacterContextBuilder } from './npc/CharacterContextBuilder.js';
import { EncounterMemoryService } from './npc/EncounterMemoryService.js';
import { InfoExtractionService } from './npc/InfoExtractionService.js';
import { PersonalityEvolutionService } from './npc/PersonalityEvolutionService.js';
import { EncounterSessionService } from './npc/EncounterSessionService.js';
import { CombatNarratorService } from './npc/CombatNarratorService.js';
import { createNpcScheduler } from './npc/NpcScheduler.js';
import { MockProvider } from './llm/MockProvider.js';
import { LLMProvider } from './llm/LLMProvider.js';

export { createGameLog } from './services/GameLog.js';
export { createSessionManager } from './services/SessionManager.js';
export { createActionProcessor } from './services/ActionProcessor.js';
export { createSceneManager } from './story/SceneManager.js';
export { createStoryEngine } from './story/StoryEngine.js';
export { createChapterGenerator } from './story/ChapterGenerator.js';
export { createImagePromptBuilder } from './narration/ImagePromptBuilder.js';
export { createNarrationGenerator } from './narration/NarrationGenerator.js';
export { createGroupDecisionArbiter } from './actions/GroupDecisionArbiter.js';
export { createPartyCoherenceMonitor } from './actions/PartyCoherenceMonitor.js';
export { CharacterResponseService } from './npc/CharacterResponseService.js';
export { CharacterContextBuilder } from './npc/CharacterContextBuilder.js';
export { EncounterMemoryService } from './npc/EncounterMemoryService.js';
export { InfoExtractionService } from './npc/InfoExtractionService.js';
export { PersonalityEvolutionService } from './npc/PersonalityEvolutionService.js';
export { EncounterSessionService } from './npc/EncounterSessionService.js';
export { CombatNarratorService } from './npc/CombatNarratorService.js';
export { createNpcScheduler } from './npc/NpcScheduler.js';
export { MockProvider } from './llm/MockProvider.js';
export { LLMProvider } from './llm/LLMProvider.js';
export {
  TRIGGER_EVENT, NPC_TYPE, EMOTIONAL_STATE, RESPONSE_FORMAT,
  buildContextPackage, buildSystemPrompt, buildUserPrompt, getTokenModulation,
} from './llm/CharacterContextPackage.js';

export function createDmEngine(options = {}) {
  const gameLog = createGameLog();
  const sessionManager = createSessionManager();
  const actionProcessor = createActionProcessor();
  const sceneManager = createSceneManager();
  const storyEngine = createStoryEngine();
  const groupDecisionArbiter = options.groupDecisionArbiter || createGroupDecisionArbiter();
  const partyCoherenceMonitor = options.partyCoherenceMonitor || createPartyCoherenceMonitor(options.partyCoherence);
  const encounterMemory = new EncounterMemoryService();

  const provider = options.provider || new MockProvider();
  const contextBuilder = options.contextBuilder || new CharacterContextBuilder();
  const characterResponseService = new CharacterResponseService({ provider, contextBuilder });
  const infoExtraction = new InfoExtractionService({ provider });
  const personalityEvolution = new PersonalityEvolutionService();

  const personalityLookup = options.personalityLookup || (() => null);
  const encounterSession = new EncounterSessionService({
    encounterMemory,
    infoExtraction,
    responseService: characterResponseService,
    personalityLookup,
  });
  const combatNarrator = new CombatNarratorService({
    responseService: characterResponseService,
    personalityLookup,
  });
  const npcScheduler = options.npcScheduler || createNpcScheduler({
    schedules: options.npcSchedules,
  });
  const chapterGenerator = options.chapterGenerator || createChapterGenerator({ provider });
  const imagePromptBuilder = options.imagePromptBuilder || createImagePromptBuilder();
  const narrationGenerator = options.narrationGenerator || createNarrationGenerator({ provider, imagePromptBuilder });

  return {
    gameLog,
    sessionManager,
    actionProcessor,
    sceneManager,
    storyEngine,
    groupDecisionArbiter,
    encounterMemory,
    characterResponseService,
    infoExtraction,
    personalityEvolution,
    encounterSession,
    combatNarrator,
    npcScheduler,
    partyCoherenceMonitor,
    chapterGenerator,
    imagePromptBuilder,
    narrationGenerator,
  };
}
