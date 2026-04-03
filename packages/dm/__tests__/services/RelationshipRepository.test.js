import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { RelationshipRepository, RECOGNITION_TIERS, SIGNIFICANCE_LEVELS } from '../../src/services/RelationshipRepository.js';

/**
 * RelationshipRepository — Persistent memory for relationships between entities.
 *
 * Requirements:
 * 1. Store bidirectional relationships between any two entities (NPC↔player, NPC↔NPC)
 * 2. Track recognition tiers: stranger → recognized → acquaintance → familiar
 * 3. Store narrative memories synthesized by the DM after each encounter
 * 4. Track emotional valence (-1 to +1)
 * 5. Support display labels (appearance-based descriptions for strangers)
 * 6. Accept an optional persistence adapter for DB backing
 * 7. Provide bulk retrieval (all relationships for a subject, all memories)
 * 8. Never lose data on tier promotion — memories accumulate
 */

describe('RelationshipRepository', () => {
  let repo;

  beforeEach(() => {
    repo = new RelationshipRepository();
  });

  // ── Constants ────────────────────────────────────────────────────

  describe('constants', () => {
    it('should export the four recognition tiers in order', () => {
      assert.deepStrictEqual(RECOGNITION_TIERS, ['stranger', 'recognized', 'acquaintance', 'familiar']);
    });

    it('should export significance levels in ascending order', () => {
      assert.deepStrictEqual(SIGNIFICANCE_LEVELS, ['trivial', 'minor', 'notable', 'major', 'life-changing']);
    });
  });

  // ── Core CRUD ────────────────────────────────────────────────────

  describe('getRelationship / setRelationship', () => {
    it('should return null for unknown relationships', () => {
      const rel = repo.getRelationship('player', 'old_mattock');
      assert.strictEqual(rel, null);
    });

    it('should create a new relationship with defaults', () => {
      const rel = repo.getOrCreateRelationship('player', 'old_mattock');
      expect(rel).toMatchObject({
        subjectId: 'player',
        targetId: 'old_mattock',
        recognitionTier: 'stranger',
        displayLabel: null,
        memories: [],
        emotionalValence: 0,
        encounterCount: 0,
      });
      assert.strictEqual(rel.lastEncounter, null);
      assert.notStrictEqual(rel.createdAt, undefined);
    });

    it('should return the same relationship on second call', () => {
      const first = repo.getOrCreateRelationship('player', 'old_mattock');
      const second = repo.getOrCreateRelationship('player', 'old_mattock');
      assert.strictEqual(first, second);
    });

    it('should treat subject→target and target→subject as separate relationships', () => {
      const playerToNpc = repo.getOrCreateRelationship('player', 'old_mattock');
      const npcToPlayer = repo.getOrCreateRelationship('old_mattock', 'player');
      assert.notStrictEqual(playerToNpc, npcToPlayer);
      assert.strictEqual(playerToNpc.subjectId, 'player');
      assert.strictEqual(npcToPlayer.subjectId, 'old_mattock');
    });
  });

  // ── Recognition Tiers ───────────────────────────────────────────

  describe('recognition tiers', () => {
    it('should start at stranger', () => {
      const rel = repo.getOrCreateRelationship('player', 'old_mattock');
      assert.strictEqual(rel.recognitionTier, 'stranger');
    });

    it('should promote through tiers in order', () => {
      repo.getOrCreateRelationship('player', 'old_mattock');

      repo.promoteTier('player', 'old_mattock', 'recognized');
      assert.strictEqual(repo.getRelationship('player', 'old_mattock').recognitionTier, 'recognized');

      repo.promoteTier('player', 'old_mattock', 'acquaintance');
      assert.strictEqual(repo.getRelationship('player', 'old_mattock').recognitionTier, 'acquaintance');

      repo.promoteTier('player', 'old_mattock', 'familiar');
      assert.strictEqual(repo.getRelationship('player', 'old_mattock').recognitionTier, 'familiar');
    });

    it('should not allow demotion', () => {
      repo.getOrCreateRelationship('player', 'old_mattock');
      repo.promoteTier('player', 'old_mattock', 'recognized');    // stranger → recognized
      repo.promoteTier('player', 'old_mattock', 'acquaintance');  // recognized → acquaintance
      repo.promoteTier('player', 'old_mattock', 'stranger');      // attempt demotion
      assert.strictEqual(repo.getRelationship('player', 'old_mattock').recognitionTier, 'acquaintance');
    });

    it('should not allow skipping tiers', () => {
      repo.getOrCreateRelationship('player', 'old_mattock');
      // Trying to jump from stranger straight to familiar
      repo.promoteTier('player', 'old_mattock', 'familiar');
      // Should only advance to the next tier (recognized)
      assert.strictEqual(repo.getRelationship('player', 'old_mattock').recognitionTier, 'recognized');
    });

    it('should throw on invalid tier', () => {
      repo.getOrCreateRelationship('player', 'old_mattock');
      expect(() => repo.promoteTier('player', 'old_mattock', 'best_friend'))
        .toThrow('Invalid recognition tier');
    });

    it('should auto-create relationship if promoting unknown pair', () => {
      repo.promoteTier('player', 'lell_sparrow', 'recognized');
      const rel = repo.getRelationship('player', 'lell_sparrow');
      assert.notStrictEqual(rel, null);
      assert.strictEqual(rel.recognitionTier, 'recognized');
    });
  });

  // ── Display Labels ──────────────────────────────────────────────

  describe('display labels', () => {
    it('should store and retrieve a display label', () => {
      repo.getOrCreateRelationship('player', 'old_mattock');
      repo.setDisplayLabel('player', 'old_mattock', 'a weathered old fisherman mending nets');
      expect(repo.getRelationship('player', 'old_mattock').displayLabel)
        .toBe('a weathered old fisherman mending nets');
    });

    it('should return the display label via getDisplayName when stranger', () => {
      repo.getOrCreateRelationship('player', 'old_mattock');
      repo.setDisplayLabel('player', 'old_mattock', 'the old fisherman');
      assert.strictEqual(repo.getDisplayName('player', 'old_mattock', 'Old Mattock'), 'the old fisherman');
    });

    it('should return the real name when acquaintance or higher', () => {
      repo.getOrCreateRelationship('player', 'old_mattock');
      repo.setDisplayLabel('player', 'old_mattock', 'the old fisherman');
      repo.promoteTier('player', 'old_mattock', 'recognized');
      // Still recognized — use label
      assert.strictEqual(repo.getDisplayName('player', 'old_mattock', 'Old Mattock'), 'the old fisherman');

      repo.promoteTier('player', 'old_mattock', 'acquaintance');
      // Acquaintance — knows the name
      assert.strictEqual(repo.getDisplayName('player', 'old_mattock', 'Old Mattock'), 'Old Mattock');
    });

    it('should return real name when familiar', () => {
      repo.getOrCreateRelationship('player', 'old_mattock');
      repo.promoteTier('player', 'old_mattock', 'recognized');
      repo.promoteTier('player', 'old_mattock', 'acquaintance');
      repo.promoteTier('player', 'old_mattock', 'familiar');
      assert.strictEqual(repo.getDisplayName('player', 'old_mattock', 'Old Mattock'), 'Old Mattock');
    });

    it('should fall back to real name if no display label set for stranger', () => {
      repo.getOrCreateRelationship('player', 'old_mattock');
      // No label set — stranger with no description falls back to name
      assert.strictEqual(repo.getDisplayName('player', 'old_mattock', 'Old Mattock'), 'Old Mattock');
    });

    it('should return real name for unknown relationships', () => {
      assert.strictEqual(repo.getDisplayName('player', 'unknown_npc', 'Some Guy'), 'Some Guy');
    });
  });

  // ── Memory Recording ────────────────────────────────────────────

  describe('memories', () => {
    it('should record a memory with narrative summary and significance', () => {
      repo.getOrCreateRelationship('player', 'old_mattock');
      repo.recordMemory('player', 'old_mattock', {
        summary: 'Met in the Bottoms Up tavern. He was mending nets and seemed content to be left alone.',
        significance: 'minor',
      });

      const rel = repo.getRelationship('player', 'old_mattock');
      assert.strictEqual(rel.memories.length, 1);
      expect(rel.memories[0]).toMatchObject({
        summary: 'Met in the Bottoms Up tavern. He was mending nets and seemed content to be left alone.',
        significance: 'minor',
      });
      assert.notStrictEqual(rel.memories[0].date, undefined);
    });

    it('should accumulate memories across encounters', () => {
      repo.getOrCreateRelationship('player', 'old_mattock');
      repo.recordMemory('player', 'old_mattock', {
        summary: 'First meeting — he barely glanced up from his nets.',
        significance: 'trivial',
      });
      repo.recordMemory('player', 'old_mattock', {
        summary: 'Bought him an ale. He opened up about the river currents and the fish migration.',
        significance: 'minor',
      });
      repo.recordMemory('player', 'old_mattock', {
        summary: 'Saved him from drowning when his boat capsized. He gripped my hand and wept.',
        significance: 'life-changing',
      });

      const rel = repo.getRelationship('player', 'old_mattock');
      assert.strictEqual(rel.memories.length, 3);
      assert.strictEqual(rel.memories[2].significance, 'life-changing');
    });

    it('should default significance to minor', () => {
      repo.getOrCreateRelationship('player', 'old_mattock');
      repo.recordMemory('player', 'old_mattock', {
        summary: 'A brief nod across the room.',
      });
      assert.strictEqual(repo.getRelationship('player', 'old_mattock').memories[0].significance, 'minor');
    });

    it('should reject invalid significance levels', () => {
      repo.getOrCreateRelationship('player', 'old_mattock');
      expect(() => repo.recordMemory('player', 'old_mattock', {
        summary: 'Some event.',
        significance: 'epic',
      })).toThrow('Invalid significance');
    });

    it('should auto-create relationship when recording memory', () => {
      repo.recordMemory('player', 'lell_sparrow', {
        summary: 'Heard her playing a haunting melody in the corner.',
        significance: 'minor',
      });
      const rel = repo.getRelationship('player', 'lell_sparrow');
      assert.notStrictEqual(rel, null);
      assert.strictEqual(rel.memories.length, 1);
    });

    it('should increment encounterCount when recording', () => {
      repo.getOrCreateRelationship('player', 'old_mattock');
      repo.recordMemory('player', 'old_mattock', { summary: 'First.' });
      repo.recordMemory('player', 'old_mattock', { summary: 'Second.' });
      assert.strictEqual(repo.getRelationship('player', 'old_mattock').encounterCount, 2);
    });

    it('should update lastEncounter timestamp', () => {
      repo.getOrCreateRelationship('player', 'old_mattock');
      repo.recordMemory('player', 'old_mattock', { summary: 'Hello.' });
      assert.notStrictEqual(repo.getRelationship('player', 'old_mattock').lastEncounter, undefined);
    });
  });

  // ── Emotional Valence ───────────────────────────────────────────

  describe('emotional valence', () => {
    it('should start at 0 (neutral)', () => {
      const rel = repo.getOrCreateRelationship('player', 'old_mattock');
      assert.strictEqual(rel.emotionalValence, 0);
    });

    it('should adjust valence within bounds', () => {
      repo.getOrCreateRelationship('player', 'old_mattock');
      repo.adjustValence('player', 'old_mattock', 0.3);
      expect(repo.getRelationship('player', 'old_mattock').emotionalValence).toBeCloseTo(0.3);
    });

    it('should clamp to [-1, 1]', () => {
      repo.getOrCreateRelationship('player', 'old_mattock');
      repo.adjustValence('player', 'old_mattock', 5);
      assert.strictEqual(repo.getRelationship('player', 'old_mattock').emotionalValence, 1);

      repo.adjustValence('player', 'old_mattock', -10);
      assert.strictEqual(repo.getRelationship('player', 'old_mattock').emotionalValence, -1);
    });

    it('should accumulate across calls', () => {
      repo.getOrCreateRelationship('player', 'old_mattock');
      repo.adjustValence('player', 'old_mattock', 0.2);
      repo.adjustValence('player', 'old_mattock', 0.3);
      expect(repo.getRelationship('player', 'old_mattock').emotionalValence).toBeCloseTo(0.5);
    });
  });

  // ── Bulk Queries ────────────────────────────────────────────────

  describe('bulk queries', () => {
    beforeEach(() => {
      repo.getOrCreateRelationship('player', 'old_mattock');
      repo.getOrCreateRelationship('player', 'mira_barrelbottom');
      repo.getOrCreateRelationship('player', 'lell_sparrow');
      repo.getOrCreateRelationship('old_mattock', 'player');
      repo.getOrCreateRelationship('old_mattock', 'mira_barrelbottom');
    });

    it('should retrieve all relationships for a subject', () => {
      const playerRels = repo.getRelationshipsForSubject('player');
      assert.strictEqual(playerRels.length, 3);
      expect(playerRels.map(r => r.targetId)).toEqual(
        expect.arrayContaining(['old_mattock', 'mira_barrelbottom', 'lell_sparrow'])
      );
    });

    it('should retrieve all relationships targeting an entity', () => {
      const aboutPlayer = repo.getRelationshipsAbout('player');
      assert.strictEqual(aboutPlayer.length, 1);
      assert.strictEqual(aboutPlayer[0].subjectId, 'old_mattock');
    });

    it('should retrieve all relationships between scene participants', () => {
      const participants = ['player', 'old_mattock', 'mira_barrelbottom'];
      const sceneRels = repo.getSceneRelationships(participants);
      // player→mattock, player→mira, mattock→player, mattock→mira
      assert.strictEqual(sceneRels.length, 4);
    });

    it('should return empty arrays for unknown subjects', () => {
      assert.deepStrictEqual(repo.getRelationshipsForSubject('nobody'), []);
      assert.deepStrictEqual(repo.getRelationshipsAbout('nobody'), []);
    });
  });

  // ── Memory Context for Prompts ──────────────────────────────────

  describe('getMemoryContext', () => {
    it('should return formatted memory context for prompt injection', () => {
      repo.getOrCreateRelationship('old_mattock', 'player');
      repo.promoteTier('old_mattock', 'player', 'recognized');
      repo.recordMemory('old_mattock', 'player', {
        summary: 'A stranger walked in and ordered an ale. Seemed harmless enough.',
        significance: 'trivial',
      });
      repo.recordMemory('old_mattock', 'player', {
        summary: 'They came back and asked about the river. Knows something about fishing — earned a nod.',
        significance: 'minor',
      });
      repo.adjustValence('old_mattock', 'player', 0.2);

      const context = repo.getMemoryContext('old_mattock', 'player');
      assert.ok(context.includes('recognized'));
      assert.ok(context.includes('stranger walked in'));
      assert.ok(context.includes('asked about the river'));
    });

    it('should return null when no relationship exists', () => {
      assert.strictEqual(repo.getMemoryContext('nobody', 'also_nobody'), null);
    });

    it('should include emotional valence description', () => {
      repo.getOrCreateRelationship('old_mattock', 'player');
      repo.adjustValence('old_mattock', 'player', 0.6);
      repo.recordMemory('old_mattock', 'player', { summary: 'A good encounter.' });

      const context = repo.getMemoryContext('old_mattock', 'player');
      assert.match(context, /warm|positive|favorable/i);
    });
  });

  // ── Persistence Adapter ─────────────────────────────────────────

  describe('persistence adapter', () => {
    it('should accept an optional persistence adapter', () => {
      const saved = [];
      const adapter = {
        save: (subjectId, targetId, data) => saved.push({ subjectId, targetId, data }),
        load: () => null,
        loadAll: () => [],
      };

      const persistentRepo = new RelationshipRepository({ persistenceAdapter: adapter });
      persistentRepo.getOrCreateRelationship('player', 'old_mattock');
      persistentRepo.recordMemory('player', 'old_mattock', {
        summary: 'Met in the tavern.',
      });

      assert.ok(saved.length > 0);
      assert.strictEqual(saved[saved.length - 1].subjectId, 'player');
    });

    it('should load relationships from adapter on getOrCreate', () => {
      const adapter = {
        save: () => {},
        load: (subjectId, targetId) => {
          if (subjectId === 'player' && targetId === 'old_mattock') {
            return {
              subjectId: 'player',
              targetId: 'old_mattock',
              recognitionTier: 'acquaintance',
              displayLabel: 'Old Mattock, the fisherman',
              memories: [{ summary: 'Previous session memory.', significance: 'notable', date: '2026-03-17' }],
              emotionalValence: 0.4,
              encounterCount: 3,
              lastEncounter: '2026-03-17',
              createdAt: '2026-03-16',
            };
          }
          return null;
        },
        loadAll: () => [],
      };

      const persistentRepo = new RelationshipRepository({ persistenceAdapter: adapter });
      const rel = persistentRepo.getOrCreateRelationship('player', 'old_mattock');
      assert.strictEqual(rel.recognitionTier, 'acquaintance');
      assert.strictEqual(rel.memories.length, 1);
      assert.strictEqual(rel.emotionalValence, 0.4);
    });
  });

  // ── Pre-seeding ─────────────────────────────────────────────────

  describe('pre-seeding NPC-to-NPC relationships', () => {
    it('should accept pre-seeded relationships for NPCs who already know each other', () => {
      repo.seedRelationship({
        subjectId: 'old_mattock',
        targetId: 'mira_barrelbottom',
        recognitionTier: 'familiar',
        displayLabel: 'Mira',
        emotionalValence: 0.5,
        memories: [{
          summary: 'Known her for years. She runs the tavern where I drink every night.',
          significance: 'notable',
          date: '2026-01-01',
        }],
      });

      const rel = repo.getRelationship('old_mattock', 'mira_barrelbottom');
      assert.strictEqual(rel.recognitionTier, 'familiar');
      assert.strictEqual(rel.displayLabel, 'Mira');
      assert.strictEqual(rel.memories.length, 1);
    });

    it('should not overwrite dynamically-evolved relationships', () => {
      // Dynamic relationship established during play
      repo.getOrCreateRelationship('old_mattock', 'player');
      repo.promoteTier('old_mattock', 'player', 'recognized');
      repo.recordMemory('old_mattock', 'player', {
        summary: 'Met this adventurer at the bar.',
      });

      // Seeding should not overwrite existing dynamic data
      repo.seedRelationship({
        subjectId: 'old_mattock',
        targetId: 'player',
        recognitionTier: 'stranger',
        emotionalValence: 0,
        memories: [],
      });

      const rel = repo.getRelationship('old_mattock', 'player');
      assert.strictEqual(rel.recognitionTier, 'recognized'); // not overwritten
      assert.strictEqual(rel.memories.length, 1); // not cleared
    });
  });

  // ── Clear / Reset ───────────────────────────────────────────────

  describe('clearAll', () => {
    it('should remove all in-memory relationships', () => {
      repo.getOrCreateRelationship('player', 'old_mattock');
      repo.getOrCreateRelationship('player', 'mira_barrelbottom');
      repo.clearAll();
      assert.strictEqual(repo.getRelationship('player', 'old_mattock'), null);
      assert.deepStrictEqual(repo.getRelationshipsForSubject('player'), []);
    });
  });

  // ── Opinion field ───────────────────────────────────────────────

  describe('opinion field', () => {
    it('should store opinion text via seedRelationship', () => {
      repo.seedRelationship({
        subjectId: 'mira_barrelbottom',
        targetId: 'fen_colby',
        recognitionTier: 'familiar',
        opinion: 'Part of the furniture. Sharper than people think.',
      });
      const rel = repo.getRelationship('mira_barrelbottom', 'fen_colby');
      assert.strictEqual(rel.opinion, 'Part of the furniture. Sharper than people think.');
    });

    it('should default opinion to null if not provided', () => {
      repo.seedRelationship({
        subjectId: 'mira_barrelbottom',
        targetId: 'player',
        recognitionTier: 'stranger',
      });
      const rel = repo.getRelationship('mira_barrelbottom', 'player');
      assert.strictEqual(rel.opinion, null);
    });

    it('should allow updating opinion via setOpinion()', () => {
      repo.seedRelationship({
        subjectId: 'fen_colby',
        targetId: 'mira_barrelbottom',
        recognitionTier: 'familiar',
        opinion: 'She tolerates me.',
      });
      repo.setOpinion('fen_colby', 'mira_barrelbottom', 'She saved my life.');
      const rel = repo.getRelationship('fen_colby', 'mira_barrelbottom');
      assert.strictEqual(rel.opinion, 'She saved my life.');
    });

    it('should include opinion text in getMemoryContext output', () => {
      repo.seedRelationship({
        subjectId: 'fen_colby',
        targetId: 'mira_barrelbottom',
        recognitionTier: 'familiar',
        opinion: 'Tolerates me because I am mostly harmless.',
        emotionalValence: 0.3,
      });
      const ctx = repo.getMemoryContext('fen_colby', 'mira_barrelbottom');
      assert.ok(ctx.includes('Tolerates me because I am mostly harmless.'));
      assert.ok(ctx.includes('Recognition: familiar'));
      assert.ok(ctx.includes('mildly favorable'));
    });

    it('should work without opinion in getMemoryContext', () => {
      repo.seedRelationship({
        subjectId: 'player',
        targetId: 'mira_barrelbottom',
        recognitionTier: 'stranger',
        emotionalValence: 0,
      });
      const ctx = repo.getMemoryContext('player', 'mira_barrelbottom');
      assert.ok(ctx.includes('Recognition: stranger'));
      assert.ok(!ctx.includes('null'));
    });
  });

  // ── seedFromPersonality ─────────────────────────────────────────

  describe('seedFromPersonality', () => {
    const miraPersonality = {
      templateKey: 'mira_barrelbottom',
      consciousnessContext: {
        opinionsAbout: {
          fen_colby: 'Part of the furniture. Sharper than people think.',
          lell_sparrow: 'Best entertainment in three towns.',
        },
      },
    };

    it('should seed relationships from opinionsAbout data', () => {
      repo.seedFromPersonality(miraPersonality);
      const rel = repo.getRelationship('mira_barrelbottom', 'fen_colby');
      assert.notStrictEqual(rel, null);
      assert.strictEqual(rel.opinion, 'Part of the furniture. Sharper than people think.');
      assert.strictEqual(rel.recognitionTier, 'familiar');
    });

    it('should seed all opinion targets', () => {
      repo.seedFromPersonality(miraPersonality);
      const lellRel = repo.getRelationship('mira_barrelbottom', 'lell_sparrow');
      assert.notStrictEqual(lellRel, null);
      assert.strictEqual(lellRel.opinion, 'Best entertainment in three towns.');
    });

    it('should not overwrite existing relationships', () => {
      // Pre-existing dynamic relationship
      repo.getOrCreateRelationship('mira_barrelbottom', 'fen_colby');
      repo.promoteTier('mira_barrelbottom', 'fen_colby', 'recognized');
      repo.recordMemory('mira_barrelbottom', 'fen_colby', {
        summary: 'Helped close up after a fight.',
        significance: 'notable',
      });

      repo.seedFromPersonality(miraPersonality);
      const rel = repo.getRelationship('mira_barrelbottom', 'fen_colby');
      assert.strictEqual(rel.recognitionTier, 'recognized'); // not overwritten to familiar
      assert.strictEqual(rel.opinion, null); // seed was skipped — original null preserved
    });

    it('should handle personality with no opinionsAbout', () => {
      const minimal = { templateKey: 'town_guard', consciousnessContext: {} };
      repo.seedFromPersonality(minimal);
      assert.deepStrictEqual(repo.getRelationshipsForSubject('town_guard'), []);
    });

    it('should handle personality with null consciousnessContext', () => {
      const minimal = { templateKey: 'town_guard' };
      repo.seedFromPersonality(minimal);
      assert.deepStrictEqual(repo.getRelationshipsForSubject('town_guard'), []);
    });
  });

  // ── buildRelationshipContext ─────────────────────────────────────

  describe('buildRelationshipContext', () => {
    it('should build unified context for scene-present NPCs', () => {
      repo.seedRelationship({
        subjectId: 'mira_barrelbottom',
        targetId: 'fen_colby',
        recognitionTier: 'familiar',
        opinion: 'Part of the furniture.',
        emotionalValence: 0.3,
      });
      const ctx = repo.buildRelationshipContext(
        'mira_barrelbottom',
        [{ id: 'fen_colby', templateKey: 'fen_colby', name: 'Fen Colby' }]
      );
      assert.ok(ctx.includes('About Fen Colby:'));
      assert.ok(ctx.includes('Part of the furniture.'));
      assert.ok(ctx.includes('familiar'));
    });

    it('should return empty string if no relationships with scene participants', () => {
      const ctx = repo.buildRelationshipContext(
        'mira_barrelbottom',
        [{ id: 'player', templateKey: 'player', name: 'Aldric' }]
      );
      assert.strictEqual(ctx, '');
    });

    it('should use display name from name resolver if provided', () => {
      repo.seedRelationship({
        subjectId: 'player',
        targetId: 'mira_barrelbottom',
        recognitionTier: 'stranger',
        displayLabel: 'the halfling innkeeper',
        opinion: null,
        emotionalValence: 0.1,
      });
      const ctx = repo.buildRelationshipContext(
        'player',
        [{ id: 'mira', templateKey: 'mira_barrelbottom', name: 'Mira Barrelbottom' }]
      );
      assert.ok(ctx.includes('About the halfling innkeeper:'));
    });

    it('should combine opinion + structured data for each participant', () => {
      repo.seedRelationship({
        subjectId: 'fen_colby',
        targetId: 'mira_barrelbottom',
        recognitionTier: 'familiar',
        opinion: 'She tolerates me.',
        emotionalValence: 0.3,
        memories: [{ summary: 'She let me sleep in the stable.', significance: 'notable', date: '2025-01-01' }],
      });
      const ctx = repo.buildRelationshipContext(
        'fen_colby',
        [{ id: 'mira', templateKey: 'mira_barrelbottom', name: 'Mira Barrelbottom' }]
      );
      assert.ok(ctx.includes('She tolerates me.'));
      assert.ok(ctx.includes('Recognition: familiar'));
      assert.ok(ctx.includes('She let me sleep in the stable.'));
    });
  });
});
