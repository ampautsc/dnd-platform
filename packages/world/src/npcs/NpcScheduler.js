export function createNpcScheduler(options = {}) {
  const schedules = options.schedules ?? {};

  return {
    getNpcStateAtHour(npcId, hour) {
      const schedule = schedules[npcId];
      if (!schedule) return null;

      if (schedule[hour]) {
        return { ...schedule[hour] };
      }

      // Find nearest earlier hour in same day
      for (let scan = hour - 1; scan >= 0; scan -= 1) {
        if (schedule[scan]) {
          return { ...schedule[scan] };
        }
      }

      // Wrap to previous day: find latest defined hour
      const hours = Object.keys(schedule).map(Number).sort((a, b) => b - a);
      if (hours.length === 0) return null;
      return { ...schedule[hours[0]] };
    },
  };
}
