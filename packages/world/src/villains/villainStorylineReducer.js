/**
 * villainStorylineReducer
 *
 * Pure function: (storylines, worldTime) → updatedStorylines
 *
 * Each storyline has a sequence of stages. Each stage has a durationMinutes.
 * When worldTime has advanced past the cumulative duration, the stage advances.
 * The final stage has durationMinutes: null — it never expires on its own.
 *
 * Returns new array and new objects — never mutates input.
 */

/**
 * Advance a single storyline to the correct stage for the given worldTime.
 * @param {Object} storyline
 * @param {number} worldTime - current absoluteMinute from WorldClock
 * @returns {Object} new storyline object (may be same stage or advanced)
 */
function advanceStoryline(storyline, worldTime) {
  let { currentStage, stageStartedAt, stages } = storyline;

  // Advance through as many stages as the elapsed time allows
  while (true) {
    const stage = stages[currentStage];
    if (!stage) break;
    if (stage.durationMinutes === null) break; // final stage — never expires

    const elapsed = worldTime - stageStartedAt;
    if (elapsed < stage.durationMinutes) break; // not yet time

    const nextStage = currentStage + 1;
    if (nextStage >= stages.length) break; // no further stages

    stageStartedAt = stageStartedAt + stage.durationMinutes;
    currentStage = nextStage;
  }

  if (currentStage === storyline.currentStage && stageStartedAt === storyline.stageStartedAt) {
    return { ...storyline }; // return a new object even if unchanged (immutable contract)
  }

  return { ...storyline, currentStage, stageStartedAt };
}

/**
 * @param {Array} storylines
 * @param {number} worldTime - absoluteMinute from WorldClock
 * @returns {Array} new array of updated storylines
 */
export function villainStorylineReducer(storylines, worldTime) {
  return storylines.map(s => advanceStoryline(s, worldTime));
}
