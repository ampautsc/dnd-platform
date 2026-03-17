const MINUTES_PER_DAY = 24 * 60;

export function createWorldClock(options = {}) {
  let absoluteMinute = options.initialMinute ?? 0;

  return {
    tick(minutes = 1) {
      absoluteMinute += minutes;
      return this.getCurrentTime();
    },

    getCurrentTime() {
      const day = Math.floor(absoluteMinute / MINUTES_PER_DAY) + 1;
      const minuteOfDay = ((absoluteMinute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
      const hour = Math.floor(minuteOfDay / 60);
      const minute = minuteOfDay % 60;

      return {
        day,
        hour,
        minute,
        absoluteMinute,
      };
    },

    getTimeOfDay() {
      const { hour } = this.getCurrentTime();
      if (hour < 6) return 'night';
      if (hour < 12) return 'morning';
      if (hour < 18) return 'afternoon';
      return 'evening';
    },
  };
}
