const SLEEPING_FALLBACK = Object.freeze({
  location: 'home',
  activity: 'sleeping',
  moodHint: null,
});

function cloneEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return { ...SLEEPING_FALLBACK };
  }
  return { ...entry };
}

function cloneSchedule(schedule) {
  return schedule.map(entry => cloneEntry(entry));
}

export function createNpcScheduler(options = {}) {
  const NPC_SCHEDULES = options.schedules ?? {};
  const defaultFriendlySchedule = Array.isArray(options.defaultFriendlySchedule)
    ? options.defaultFriendlySchedule
    : [];
  const defaultEnemySchedule = Array.isArray(options.defaultEnemySchedule)
    ? options.defaultEnemySchedule
    : [];

  function resolveSchedule(templateKey, npcType = 'friendly') {
    const knownSchedule = NPC_SCHEDULES[templateKey];
    if (Array.isArray(knownSchedule)) {
      return knownSchedule;
    }

    if (npcType === 'enemy') {
      return defaultEnemySchedule;
    }

    return defaultFriendlySchedule;
  }

  function getScheduleEntry(templateKey, hour, npcType = 'friendly') {
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      return { ...SLEEPING_FALLBACK };
    }

    const schedule = resolveSchedule(templateKey, npcType);
    const entry = schedule[hour];

    if (!entry) {
      return { ...SLEEPING_FALLBACK };
    }

    return cloneEntry(entry);
  }

  function getFullSchedule(templateKey, npcType = 'friendly') {
    const schedule = resolveSchedule(templateKey, npcType);
    return cloneSchedule(schedule);
  }

  return {
    NPC_SCHEDULES,
    getScheduleEntry,
    getFullSchedule,
  };
}
