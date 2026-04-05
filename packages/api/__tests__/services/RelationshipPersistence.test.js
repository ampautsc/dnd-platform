/**
 * RelationshipPersistence Tests
 *
 * Requirements:
 * 1. Store and retrieve relationship records in SQLite
 * 2. Save: upsert a relationship (subject+target is unique key)
 * 3. Load: retrieve a single relationship by subject+target
 * 4. LoadAll: retrieve all relationships (for startup hydration)
 * 5. JSON fields (memories) are serialized/deserialized transparently
 * 6. Conforms to the RelationshipRepository persistence adapter interface
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRelationshipPersistence } from '../../src/services/RelationshipPersistence.js';
import { initDatabase, closeDatabase } from '../../src/models/database.js';

describe('RelationshipPersistence', () => {
  let db;
  let persistence;

  beforeEach(() => {
    db = initDatabase(':memory:');
    persistence = createRelationshipPersistence(db);
  });

  afterEach(() => {
    closeDatabase();
  });

  describe('schema', () => {
    it('should create the relationships table', () => {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='relationships'"
      ).all();
      assert.strictEqual(tables.length, 1);
    });

    it('should have the expected columns', () => {
      const columns = db.prepare('PRAGMA table_info(relationships)').all();
      const names = columns.map(c => c.name);
      expect(names).toEqual(expect.arrayContaining([
        'subjectId', 'targetId', 'recognitionTier', 'displayLabel',
        'memories', 'emotionalValence', 'encounterCount',
        'lastEncounter', 'createdAt',
      ]));
    });

    it('should enforce unique subject+target pairs', () => {
      persistence.save('player', 'old_mattock', {
        subjectId: 'player', targetId: 'old_mattock',
        recognitionTier: 'stranger', displayLabel: null,
        memories: [], emotionalValence: 0, encounterCount: 0,
        lastEncounter: null, createdAt: '2026-03-18',
      });

      // Second save should update, not duplicate
      persistence.save('player', 'old_mattock', {
        subjectId: 'player', targetId: 'old_mattock',
        recognitionTier: 'recognized', displayLabel: 'the old fisherman',
        memories: [{ summary: 'Met at the bar.', significance: 'minor', date: '2026-03-18' }],
        emotionalValence: 0.2, encounterCount: 1,
        lastEncounter: '2026-03-18', createdAt: '2026-03-18',
      });

      const all = persistence.loadAll();
      assert.strictEqual(all.length, 1);
      assert.strictEqual(all[0].recognitionTier, 'recognized');
    });
  });

  describe('save and load', () => {
    const sampleRelationship = {
      subjectId: 'player',
      targetId: 'old_mattock',
      recognitionTier: 'acquaintance',
      displayLabel: 'the old fisherman',
      memories: [
        { summary: 'Met at the tavern. He told me about the boats.', significance: 'minor', date: '2026-03-17' },
        { summary: 'Bought him an ale. Learned his name is Mattock.', significance: 'minor', date: '2026-03-18' },
      ],
      emotionalValence: 0.3,
      encounterCount: 2,
      lastEncounter: '2026-03-18',
      createdAt: '2026-03-17',
    };

    it('should save and load a relationship', () => {
      persistence.save('player', 'old_mattock', sampleRelationship);
      const loaded = persistence.load('player', 'old_mattock');

      expect(loaded).toMatchObject({
        subjectId: 'player',
        targetId: 'old_mattock',
        recognitionTier: 'acquaintance',
        displayLabel: 'the old fisherman',
        emotionalValence: 0.3,
        encounterCount: 2,
      });
    });

    it('should deserialize memories as an array', () => {
      persistence.save('player', 'old_mattock', sampleRelationship);
      const loaded = persistence.load('player', 'old_mattock');

      assert.strictEqual(Array.isArray(loaded.memories), true);
      assert.strictEqual(loaded.memories.length, 2);
      assert.ok(loaded.memories[0].summary.includes('boats'));
    });

    it('should return null for unknown relationships', () => {
      assert.strictEqual(persistence.load('nobody', 'unknown'), null);
    });

    it('should handle null displayLabel', () => {
      persistence.save('player', 'mira', {
        ...sampleRelationship,
        subjectId: 'player',
        targetId: 'mira',
        displayLabel: null,
      });
      const loaded = persistence.load('player', 'mira');
      assert.strictEqual(loaded.displayLabel, null);
    });

    it('should handle empty memories array', () => {
      persistence.save('player', 'fen', {
        ...sampleRelationship,
        subjectId: 'player',
        targetId: 'fen',
        memories: [],
      });
      const loaded = persistence.load('player', 'fen');
      assert.deepStrictEqual(loaded.memories, []);
    });
  });

  describe('loadAll', () => {
    it('should return all relationships', () => {
      const base = {
        recognitionTier: 'stranger', displayLabel: null,
        memories: [], emotionalValence: 0, encounterCount: 0,
        lastEncounter: null, createdAt: '2026-03-18',
      };

      persistence.save('player', 'old_mattock', { subjectId: 'player', targetId: 'old_mattock', ...base });
      persistence.save('player', 'mira', { subjectId: 'player', targetId: 'mira', ...base });
      persistence.save('old_mattock', 'player', { subjectId: 'old_mattock', targetId: 'player', ...base });

      const all = persistence.loadAll();
      assert.strictEqual(all.length, 3);
    });

    it('should return empty array when no relationships exist', () => {
      assert.deepStrictEqual(persistence.loadAll(), []);
    });
  });

  describe('adapter interface compliance', () => {
    it('should have save, load, and loadAll methods', () => {
      assert.strictEqual(typeof persistence.save, 'function');
      assert.strictEqual(typeof persistence.load, 'function');
      assert.strictEqual(typeof persistence.loadAll, 'function');
    });
  });
});
