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
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
      expect(tables).toHaveLength(1);
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
      expect(all).toHaveLength(1);
      expect(all[0].recognitionTier).toBe('recognized');
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

      expect(Array.isArray(loaded.memories)).toBe(true);
      expect(loaded.memories).toHaveLength(2);
      expect(loaded.memories[0].summary).toContain('boats');
    });

    it('should return null for unknown relationships', () => {
      expect(persistence.load('nobody', 'unknown')).toBeNull();
    });

    it('should handle null displayLabel', () => {
      persistence.save('player', 'mira', {
        ...sampleRelationship,
        subjectId: 'player',
        targetId: 'mira',
        displayLabel: null,
      });
      const loaded = persistence.load('player', 'mira');
      expect(loaded.displayLabel).toBeNull();
    });

    it('should handle empty memories array', () => {
      persistence.save('player', 'fen', {
        ...sampleRelationship,
        subjectId: 'player',
        targetId: 'fen',
        memories: [],
      });
      const loaded = persistence.load('player', 'fen');
      expect(loaded.memories).toEqual([]);
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
      expect(all).toHaveLength(3);
    });

    it('should return empty array when no relationships exist', () => {
      expect(persistence.loadAll()).toEqual([]);
    });
  });

  describe('adapter interface compliance', () => {
    it('should have save, load, and loadAll methods', () => {
      expect(typeof persistence.save).toBe('function');
      expect(typeof persistence.load).toBe('function');
      expect(typeof persistence.loadAll).toBe('function');
    });
  });
});
