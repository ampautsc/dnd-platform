/**
 * Spell Registry — tests
 *
 * Written BEFORE the implementation (TDD Rule #4).
 * These define the contract for the spells module.
 */

import { describe, it, expect } from 'vitest';
import {
  getSpell,
  hasSpell,
  getSpellsByLevel,
  getSpellsByTag,
  getConcentrationSpells,
  isConcentrationSpell,
  getAllSpellNames,
  getAoERadius,
  SPELLS,
} from '../src/spells/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Data Integrity
// ═══════════════════════════════════════════════════════════════════════════

describe('spell data integrity', () => {
  const REQUIRED_FIELDS = [
    'name', 'level', 'school', 'castingTime', 'range',
    'duration', 'concentration', 'targeting', 'tags', 'notes',
  ];

  it('every spell has all required fields', () => {
    for (const [key, spell] of Object.entries(SPELLS)) {
      for (const field of REQUIRED_FIELDS) {
        expect(spell, `${key} missing '${field}'`).toHaveProperty(field);
      }
    }
  });

  it('every spell name matches its key', () => {
    for (const [key, spell] of Object.entries(SPELLS)) {
      expect(spell.name).toBe(key);
    }
  });

  it('every spell level is 0-9', () => {
    for (const [key, spell] of Object.entries(SPELLS)) {
      expect(spell.level, `${key} has invalid level ${spell.level}`)
        .toBeGreaterThanOrEqual(0);
      expect(spell.level).toBeLessThanOrEqual(9);
    }
  });

  it('every spell has a valid school', () => {
    const VALID_SCHOOLS = [
      'abjuration', 'conjuration', 'divination', 'enchantment',
      'evocation', 'illusion', 'necromancy', 'transmutation',
    ];
    for (const [key, spell] of Object.entries(SPELLS)) {
      expect(VALID_SCHOOLS, `${key} has invalid school '${spell.school}'`)
        .toContain(spell.school);
    }
  });

  it('every spell has a valid casting time', () => {
    const VALID_TIMES = ['action', 'bonus_action', 'reaction'];
    for (const [key, spell] of Object.entries(SPELLS)) {
      expect(VALID_TIMES, `${key} has invalid castingTime '${spell.castingTime}'`)
        .toContain(spell.castingTime);
    }
  });

  it('every spell targeting has a valid type', () => {
    const VALID_TYPES = ['single', 'self', 'area'];
    for (const [key, spell] of Object.entries(SPELLS)) {
      expect(VALID_TYPES, `${key} has invalid targeting type '${spell.targeting.type}'`)
        .toContain(spell.targeting.type);
    }
  });

  it('concentration spells have positive duration', () => {
    for (const [key, spell] of Object.entries(SPELLS)) {
      if (spell.concentration) {
        expect(spell.duration, `${key} is concentration but duration is ${spell.duration}`)
          .toBeGreaterThan(0);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Registry API
// ═══════════════════════════════════════════════════════════════════════════

describe('getSpell', () => {
  it('returns spell data for known spell', () => {
    const hp = getSpell('Hypnotic Pattern');
    expect(hp.name).toBe('Hypnotic Pattern');
    expect(hp.level).toBe(3);
    expect(hp.concentration).toBe(true);
  });

  it('throws for unknown spell', () => {
    expect(() => getSpell('Meteor Swarm')).toThrow(/Unknown spell/);
  });
});

describe('hasSpell', () => {
  it('returns true for registered spell', () => {
    expect(hasSpell('Hold Person')).toBe(true);
  });

  it('returns false for unregistered spell', () => {
    expect(hasSpell('Meteor Swarm')).toBe(false);
  });
});

describe('getSpellsByLevel', () => {
  it('returns cantrips (level 0)', () => {
    const cantrips = getSpellsByLevel(0);
    expect(cantrips.length).toBeGreaterThanOrEqual(2);
    expect(cantrips.every(s => s.level === 0)).toBe(true);
  });

  it('returns level 3 spells', () => {
    const lvl3 = getSpellsByLevel(3);
    const names = lvl3.map(s => s.name);
    expect(names).toContain('Hypnotic Pattern');
    expect(names).toContain('Counterspell');
  });
});

describe('getSpellsByTag', () => {
  it('returns spells with "control" tag', () => {
    const control = getSpellsByTag('control');
    const names = control.map(s => s.name);
    expect(names).toContain('Hypnotic Pattern');
    expect(names).toContain('Hold Person');
    expect(names).toContain('Command');
  });
});

describe('getConcentrationSpells', () => {
  it('returns only concentration spells', () => {
    const conc = getConcentrationSpells();
    expect(conc.length).toBeGreaterThan(0);
    expect(conc.every(s => s.concentration)).toBe(true);
  });

  it('includes known concentration spells', () => {
    const names = getConcentrationSpells().map(s => s.name);
    expect(names).toContain('Hypnotic Pattern');
    expect(names).toContain('Hold Person');
  });
});

describe('isConcentrationSpell', () => {
  it('returns true for concentration spell', () => {
    expect(isConcentrationSpell('Hypnotic Pattern')).toBe(true);
  });

  it('returns false for non-concentration spell', () => {
    expect(isConcentrationSpell('Fireball')).toBe(false);
  });
});

describe('getAllSpellNames', () => {
  it('returns array of all spell names', () => {
    const names = getAllSpellNames();
    expect(names.length).toBeGreaterThanOrEqual(35);
    expect(names).toContain('Fireball');
    expect(names).toContain('Healing Word');
    expect(names).toContain('Counterspell');
  });
});

describe('getAoERadius', () => {
  it('returns 0 for single-target', () => {
    expect(getAoERadius({ type: 'single' })).toBe(0);
  });

  it('returns half-size for cube', () => {
    expect(getAoERadius({ type: 'area', shape: 'cube', size: 20 })).toBe(10);
  });

  it('returns radius for sphere', () => {
    expect(getAoERadius({ type: 'area', shape: 'sphere', radius: 20 })).toBe(20);
  });

  it('returns length for cone', () => {
    expect(getAoERadius({ type: 'area', shape: 'cone', length: 60 })).toBe(60);
  });

  it('returns 0 for null/undefined', () => {
    expect(getAoERadius(null)).toBe(0);
    expect(getAoERadius(undefined)).toBe(0);
  });
});
