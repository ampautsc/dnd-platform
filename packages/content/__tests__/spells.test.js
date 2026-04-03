/**
 * Spell Registry — tests
 *
 * Written BEFORE the implementation (TDD Rule #4).
 * These define the contract for the spells module.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

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
        assert.notStrictEqual(spell[field], undefined, `${key} missing '${field}'`);
      }
    }
  });

  it('every spell name matches its key', () => {
    for (const [key, spell] of Object.entries(SPELLS)) {
      assert.strictEqual(spell.name, key);
    }
  });

  it('every spell level is 0-9', () => {
    for (const [key, spell] of Object.entries(SPELLS)) {
      assert.ok(spell.level >= 0, `${key} has invalid level ${spell.level}`);
      assert.ok(spell.level <= 9, `${key} has invalid level ${spell.level}`);
    }
  });

  it('every spell has a valid school', () => {
    const VALID_SCHOOLS = [
      'abjuration', 'conjuration', 'divination', 'enchantment',
      'evocation', 'illusion', 'necromancy', 'transmutation',
    ];
    for (const [key, spell] of Object.entries(SPELLS)) {
      assert.ok(VALID_SCHOOLS.includes(spell.school), `${key} has invalid school '${spell.school}'`);
    }
  });

  it('every spell has a valid casting time', () => {
    const VALID_TIMES = ['action', 'bonus_action', 'reaction'];
    for (const [key, spell] of Object.entries(SPELLS)) {
      assert.ok(VALID_TIMES.includes(spell.castingTime), `${key} has invalid castingTime '${spell.castingTime}'`);
    }
  });

  it('every spell targeting has a valid type', () => {
    const VALID_TYPES = ['single', 'self', 'area'];
    for (const [key, spell] of Object.entries(SPELLS)) {
      assert.ok(VALID_TYPES.includes(spell.targeting.type), `${key} has invalid targeting type '${spell.targeting.type}'`);
    }
  });

  it('concentration spells have positive duration', () => {
    for (const [key, spell] of Object.entries(SPELLS)) {
      if (spell.concentration) {
        assert.ok(spell.duration > 0, `${key} is concentration but duration is ${spell.duration}`);
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
    assert.strictEqual(hp.name, 'Hypnotic Pattern');
    assert.strictEqual(hp.level, 3);
    assert.strictEqual(hp.concentration, true);
  });

  it('throws for unknown spell', () => {
    assert.throws(() => getSpell('Meteor Swarm'), /Unknown spell/);
  });
});

describe('hasSpell', () => {
  it('returns true for registered spell', () => {
    assert.strictEqual(hasSpell('Hold Person'), true);
  });

  it('returns false for unregistered spell', () => {
    assert.strictEqual(hasSpell('Meteor Swarm'), false);
  });
});

describe('getSpellsByLevel', () => {
  it('returns cantrips (level 0)', () => {
    const cantrips = getSpellsByLevel(0);
    assert.ok(cantrips.length >= 2);
    assert.strictEqual(cantrips.every(s => s.level === 0), true);
  });

  it('returns level 3 spells', () => {
    const lvl3 = getSpellsByLevel(3);
    const names = lvl3.map(s => s.name);
    assert.ok(names.includes('Hypnotic Pattern'));
    assert.ok(names.includes('Counterspell'));
  });
});

describe('getSpellsByTag', () => {
  it('returns spells with "control" tag', () => {
    const control = getSpellsByTag('control');
    const names = control.map(s => s.name);
    assert.ok(names.includes('Hypnotic Pattern'));
    assert.ok(names.includes('Hold Person'));
    assert.ok(names.includes('Command'));
  });
});

describe('getConcentrationSpells', () => {
  it('returns only concentration spells', () => {
    const conc = getConcentrationSpells();
    assert.ok(conc.length > 0);
    assert.strictEqual(conc.every(s => s.concentration), true);
  });

  it('includes known concentration spells', () => {
    const names = getConcentrationSpells().map(s => s.name);
    assert.ok(names.includes('Hypnotic Pattern'));
    assert.ok(names.includes('Hold Person'));
  });
});

describe('isConcentrationSpell', () => {
  it('returns true for concentration spell', () => {
    assert.strictEqual(isConcentrationSpell('Hypnotic Pattern'), true);
  });

  it('returns false for non-concentration spell', () => {
    assert.strictEqual(isConcentrationSpell('Fireball'), false);
  });
});

describe('getAllSpellNames', () => {
  it('returns array of all spell names', () => {
    const names = getAllSpellNames();
    assert.ok(names.length >= 35);
    assert.ok(names.includes('Fireball'));
    assert.ok(names.includes('Healing Word'));
    assert.ok(names.includes('Counterspell'));
  });
});

describe('getAoERadius', () => {
  it('returns 0 for single-target', () => {
    assert.strictEqual(getAoERadius({ type: 'single' }), 0);
  });

  it('returns half-size for cube', () => {
    assert.strictEqual(getAoERadius({ type: 'area', shape: 'cube', size: 20 }), 10);
  });

  it('returns radius for sphere', () => {
    assert.strictEqual(getAoERadius({ type: 'area', shape: 'sphere', radius: 20 }), 20);
  });

  it('returns length for cone', () => {
    assert.strictEqual(getAoERadius({ type: 'area', shape: 'cone', length: 60 }), 60);
  });

  it('returns 0 for null/undefined', () => {
    assert.strictEqual(getAoERadius(null), 0);
    assert.strictEqual(getAoERadius(undefined), 0);
  });
});
