/**
 * locationReducer
 *
 * Pure function: (location, absoluteMinute) → updatedLocation
 *
 * Computes weather and season deterministically from worldTime.
 * Does not call any external APIs — pure simulation logic.
 *
 * Season cycle (360 days per year, 90 days per season):
 *   Days 0–89:   spring
 *   Days 90–179: summer
 *   Days 180–269: autumn
 *   Days 270–359: winter
 *
 * Weather is deterministic: same inputs always produce the same output.
 * It varies by season and by day, giving a realistic feel without randomness.
 */

const MINUTES_PER_DAY = 24 * 60;
const DAYS_PER_SEASON = 90;
const DAYS_PER_YEAR = 360;
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

// Weather probability tables per season — index by (day % cycle.length)
const WEATHER_CYCLES = {
  spring: ['clear', 'clear', 'cloudy', 'rain', 'clear', 'cloudy', 'clear'],
  summer: ['clear', 'clear', 'clear', 'cloudy', 'clear', 'storm', 'clear'],
  autumn: ['cloudy', 'rain', 'cloudy', 'clear', 'rain', 'storm', 'cloudy'],
  winter: ['snow', 'cloudy', 'clear', 'snow', 'snow', 'cloudy', 'clear'],
};

/**
 * Determine the season from the current absolute minute.
 * @param {number} absoluteMinute
 * @returns {'spring'|'summer'|'autumn'|'winter'}
 */
function getSeason(absoluteMinute) {
  const day = Math.floor(absoluteMinute / MINUTES_PER_DAY);
  const dayOfYear = ((day % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  const seasonIndex = Math.min(Math.floor(dayOfYear / DAYS_PER_SEASON), 3);
  return SEASONS[seasonIndex];
}

/**
 * Determine weather for a location on a given day.
 * Deterministic: same (absoluteMinute, locationId) → same weather.
 * @param {number} absoluteMinute
 * @param {string} locationId
 * @returns {string}
 */
function getWeather(absoluteMinute, locationId) {
  const season = getSeason(absoluteMinute);
  const cycle = WEATHER_CYCLES[season];
  // Hash day + sum of char codes of locationId for variety across locations
  const day = Math.floor(absoluteMinute / MINUTES_PER_DAY);
  const locationHash = locationId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const index = (day + locationHash) % cycle.length;
  return cycle[index];
}

/**
 * @param {{ id: string, events: Array }} location
 * @param {number} absoluteMinute - current world time from WorldClock
 * @returns {{ id: string, season: string, weather: string, events: Array }}
 */
export function locationReducer(location, absoluteMinute) {
  return {
    ...location,
    season: getSeason(absoluteMinute),
    weather: getWeather(absoluteMinute, location.id),
  };
}
