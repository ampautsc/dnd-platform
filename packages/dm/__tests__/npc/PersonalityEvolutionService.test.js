import { describe, it, expect, beforeEach } from 'vitest';
import { PersonalityEvolutionService } from '../../src/npc/PersonalityEvolutionService.js';

/**
 * PersonalityEvolutionService Requirements:
 *
 * 1. getEvolution(templateKey)
 *    a. Returns a default record for new NPCs
 *    b. Returns the same record on subsequent calls
 *    c. Returns null for falsy templateKey
 *
 * 2. advanceArc(templateKey, delta, milestone?)
 *    a. Advances arcStage by delta
 *    b. Clamps arcStage to [0.0, 1.0]
 *    c. Records optional milestone string
 *    d. Returns null for falsy templateKey
 *
 * 3. shiftDisposition(templateKey, delta, reason?)
 *    a. Shifts permanentDisposition by delta
 *    b. Clamps to [-1.0, +1.0]
 *    c. Records optional reason in personalGrowth
 *
 * 4. adjustRelationship(templateKey, entityId, delta)
 *    a. Adjusts relationship quality for an entity
 *    b. Clamps to [-1.0, +1.0]
 *    c. Starts from 0 for unknown entities
 *
 * 5. setOpinionOverride(templateKey, targetKey, opinion)
 *    a. Sets an opinion override
 *    b. Overwrites previous opinion for same target
 *
 * 6. recordEncounterSurvived(templateKey)
 *    a. Increments encountersSurvived
 *
 * 7. crystallizeEncounter(templateKey, encounterMemory, options?)
 *    a. Converts session disposition shift into permanent disposition at crystallizationRate
 *    b. Converts trust levels into relationship quality at crystallizationRate
 *    c. Carries over significant moments into personalGrowth
 *    d. Trims personalGrowth to 20 max
 *    e. Increments encountersSurvived
 *    f. Uses default rate of 0.3
 *    g. Returns null for null encounterMemory
 *
 * 8. buildEvolutionSummary(templateKey, personality?)
 *    a. Returns empty string for NPCs with no evolution
 *    b. Includes disposition direction and intensity
 *    c. Includes personal growth items
 *    d. Includes encounter count
 *    e. Includes arc progression with personality context
 *
 * 9. buildOpinionsContext(templateKey, personality, nearbyNpcKeys?)
 *    a. Returns empty string when no opinions exist
 *    b. Merges base opinions with overrides (overrides win)
 *    c. Filters to only nearby NPCs when provided
 *
 * 10. clearAll / clearEvolution — housekeeping
 */

describe('PersonalityEvolutionService', () => {
  let service;

  beforeEach(() => {
    service = new PersonalityEvolutionService();
  });

  // ── getEvolution ────────────────────────────────────────────────────────

  describe('getEvolution', () => {
    it('should return a default record for a new NPC', () => {
      const rec = service.getEvolution('bree_millhaven');
      expect(rec).toEqual(expect.objectContaining({
        templateKey: 'bree_millhaven',
        arcStage: 0.0,
        arcMilestones: [],
        permanentDisposition: 0.0,
        relationshipQuality: {},
        opinionOverrides: {},
        personalGrowth: [],
        encountersSurvived: 0,
      }));
      expect(typeof rec.createdAt).toBe('number');
      expect(typeof rec.lastUpdatedAt).toBe('number');
    });

    it('should return the same record on repeated calls', () => {
      const a = service.getEvolution('bree_millhaven');
      a.arcStage = 0.5;
      const b = service.getEvolution('bree_millhaven');
      expect(b.arcStage).toBe(0.5);
    });

    it('should return null for falsy templateKey', () => {
      expect(service.getEvolution(null)).toBeNull();
      expect(service.getEvolution('')).toBeNull();
      expect(service.getEvolution(undefined)).toBeNull();
    });
  });

  // ── advanceArc ──────────────────────────────────────────────────────────

  describe('advanceArc', () => {
    it('should advance arcStage by delta', () => {
      service.advanceArc('bree_millhaven', 0.2);
      const rec = service.getEvolution('bree_millhaven');
      expect(rec.arcStage).toBeCloseTo(0.2);
    });

    it('should clamp arcStage to [0.0, 1.0]', () => {
      service.advanceArc('bree_millhaven', 1.5);
      expect(service.getEvolution('bree_millhaven').arcStage).toBe(1.0);

      service.advanceArc('bree_millhaven', -5.0);
      expect(service.getEvolution('bree_millhaven').arcStage).toBe(0.0);
    });

    it('should record an optional milestone', () => {
      service.advanceArc('bree_millhaven', 0.1, 'Confronted the bandit leader');
      const rec = service.getEvolution('bree_millhaven');
      expect(rec.arcMilestones).toContain('Confronted the bandit leader');
    });

    it('should return null for falsy templateKey', () => {
      expect(service.advanceArc(null, 0.1)).toBeNull();
    });
  });

  // ── shiftDisposition ───────────────────────────────────────────────────

  describe('shiftDisposition', () => {
    it('should shift permanentDisposition by delta', () => {
      service.shiftDisposition('bree_millhaven', 0.3);
      expect(service.getEvolution('bree_millhaven').permanentDisposition).toBeCloseTo(0.3);
    });

    it('should clamp to [-1.0, +1.0]', () => {
      service.shiftDisposition('bree_millhaven', 2.0);
      expect(service.getEvolution('bree_millhaven').permanentDisposition).toBe(1.0);

      service.shiftDisposition('bree_millhaven', -5.0);
      expect(service.getEvolution('bree_millhaven').permanentDisposition).toBe(-1.0);
    });

    it('should record optional reason in personalGrowth', () => {
      service.shiftDisposition('bree_millhaven', 0.2, 'Party saved her farm');
      expect(service.getEvolution('bree_millhaven').personalGrowth).toContain('Party saved her farm');
    });
  });

  // ── adjustRelationship ─────────────────────────────────────────────────

  describe('adjustRelationship', () => {
    it('should start from 0 and adjust by delta', () => {
      service.adjustRelationship('bree_millhaven', 'player1', 0.5);
      expect(service.getEvolution('bree_millhaven').relationshipQuality.player1).toBeCloseTo(0.5);
    });

    it('should accumulate multiple adjustments', () => {
      service.adjustRelationship('bree_millhaven', 'player1', 0.3);
      service.adjustRelationship('bree_millhaven', 'player1', 0.2);
      expect(service.getEvolution('bree_millhaven').relationshipQuality.player1).toBeCloseTo(0.5);
    });

    it('should clamp to [-1.0, +1.0]', () => {
      service.adjustRelationship('bree_millhaven', 'player1', 2.0);
      expect(service.getEvolution('bree_millhaven').relationshipQuality.player1).toBe(1.0);
    });
  });

  // ── setOpinionOverride ─────────────────────────────────────────────────

  describe('setOpinionOverride', () => {
    it('should set an opinion override', () => {
      service.setOpinionOverride('bree_millhaven', 'hodge_fence', 'Distrusts him now');
      expect(service.getEvolution('bree_millhaven').opinionOverrides.hodge_fence)
        .toBe('Distrusts him now');
    });

    it('should overwrite previous opinion for same target', () => {
      service.setOpinionOverride('bree_millhaven', 'hodge_fence', 'Old opinion');
      service.setOpinionOverride('bree_millhaven', 'hodge_fence', 'New opinion');
      expect(service.getEvolution('bree_millhaven').opinionOverrides.hodge_fence)
        .toBe('New opinion');
    });
  });

  // ── recordEncounterSurvived ────────────────────────────────────────────

  describe('recordEncounterSurvived', () => {
    it('should increment encountersSurvived', () => {
      service.recordEncounterSurvived('bree_millhaven');
      service.recordEncounterSurvived('bree_millhaven');
      expect(service.getEvolution('bree_millhaven').encountersSurvived).toBe(2);
    });
  });

  // ── crystallizeEncounter ───────────────────────────────────────────────

  describe('crystallizeEncounter', () => {
    it('should crystallize disposition shift at default rate 0.3', () => {
      const memory = { dispositionShift: 1.0 };
      service.crystallizeEncounter('bree_millhaven', memory);
      expect(service.getEvolution('bree_millhaven').permanentDisposition).toBeCloseTo(0.3);
    });

    it('should crystallize with custom rate', () => {
      const memory = { dispositionShift: 1.0 };
      service.crystallizeEncounter('bree_millhaven', memory, { crystallizationRate: 0.5 });
      expect(service.getEvolution('bree_millhaven').permanentDisposition).toBeCloseTo(0.5);
    });

    it('should crystallize trust levels into relationship quality', () => {
      const memory = {
        trustLevels: { player1: 0.8, player2: 0.1 },
        defaultTrust: 0.3,
      };
      service.crystallizeEncounter('bree_millhaven', memory);
      const rec = service.getEvolution('bree_millhaven');
      // player1: (0.8 - 0.3) * 0.3 = 0.15
      expect(rec.relationshipQuality.player1).toBeCloseTo(0.15);
      // player2: (0.1 - 0.3) * 0.3 = -0.06
      expect(rec.relationshipQuality.player2).toBeCloseTo(-0.06);
    });

    it('should skip trust levels with negligible change (< 0.05)', () => {
      const memory = {
        trustLevels: { player1: 0.32 },
        defaultTrust: 0.3,
      };
      service.crystallizeEncounter('bree_millhaven', memory);
      const rec = service.getEvolution('bree_millhaven');
      expect(rec.relationshipQuality.player1).toBeUndefined();
    });

    it('should carry over significant moments (max 2 per encounter)', () => {
      const memory = {
        significantMoments: ['Saved the child', 'Revealed a secret', 'Extra moment'],
      };
      service.crystallizeEncounter('bree_millhaven', memory);
      const rec = service.getEvolution('bree_millhaven');
      expect(rec.personalGrowth).toEqual(['Saved the child', 'Revealed a secret']);
    });

    it('should trim personalGrowth to 20 max', () => {
      // Pre-fill with 19 items
      const rec = service.getEvolution('bree_millhaven');
      for (let i = 0; i < 19; i++) rec.personalGrowth.push(`moment ${i}`);

      const memory = { significantMoments: ['New moment A', 'New moment B'] };
      service.crystallizeEncounter('bree_millhaven', memory);
      expect(rec.personalGrowth.length).toBeLessThanOrEqual(20);
      expect(rec.personalGrowth).toContain('New moment B');
    });

    it('should increment encountersSurvived', () => {
      service.crystallizeEncounter('bree_millhaven', {});
      expect(service.getEvolution('bree_millhaven').encountersSurvived).toBe(1);
    });

    it('should return null for null encounterMemory', () => {
      expect(service.crystallizeEncounter('bree_millhaven', null)).toBeNull();
    });
  });

  // ── buildEvolutionSummary ──────────────────────────────────────────────

  describe('buildEvolutionSummary', () => {
    it('should return empty string for an NPC with no evolution', () => {
      service.getEvolution('bree_millhaven'); // create record
      expect(service.buildEvolutionSummary('bree_millhaven')).toBe('');
    });

    it('should return empty string for unknown NPC', () => {
      expect(service.buildEvolutionSummary('nobody')).toBe('');
    });

    it('should include disposition direction and intensity', () => {
      service.shiftDisposition('bree_millhaven', 0.4);
      service.recordEncounterSurvived('bree_millhaven');
      const summary = service.buildEvolutionSummary('bree_millhaven');
      expect(summary).toContain('warmer toward');
      expect(summary).toContain('notably');
    });

    it('should describe negative disposition as colder', () => {
      service.shiftDisposition('bree_millhaven', -0.7);
      service.recordEncounterSurvived('bree_millhaven');
      const summary = service.buildEvolutionSummary('bree_millhaven');
      expect(summary).toContain('colder toward');
      expect(summary).toContain('significantly');
    });

    it('should include personal growth items', () => {
      service.shiftDisposition('bree_millhaven', 0.1, 'Shared a meal');
      service.recordEncounterSurvived('bree_millhaven');
      const summary = service.buildEvolutionSummary('bree_millhaven');
      expect(summary).toContain('Shared a meal');
    });

    it('should include encounter count when > 1', () => {
      service.recordEncounterSurvived('bree_millhaven');
      service.recordEncounterSurvived('bree_millhaven');
      service.shiftDisposition('bree_millhaven', 0.1);
      const summary = service.buildEvolutionSummary('bree_millhaven');
      expect(summary).toContain('2 encounters');
    });

    it('should include arc progression with personality context', () => {
      service.advanceArc('bree_millhaven', 0.5, 'Found the clue');
      service.recordEncounterSurvived('bree_millhaven');
      const personality = {
        consciousnessContext: {
          characterArc: { summary: 'From timid farmer to village defender' },
        },
      };
      const summary = service.buildEvolutionSummary('bree_millhaven', personality);
      expect(summary).toContain('From timid farmer to village defender');
      expect(summary).toContain('50%');
      expect(summary).toContain('Found the clue');
    });
  });

  // ── buildOpinionsContext (DEPRECATED — use RelationshipRepository) ────

  describe('buildOpinionsContext (deprecated)', () => {
    it('should return empty string for no opinions', () => {
      const result = service.buildOpinionsContext('bree_millhaven', {});
      expect(result).toBe('');
    });

    it('should include base personality opinions', () => {
      const personality = {
        consciousnessContext: {
          opinionsAbout: {
            hodge_fence: 'A shady dealer but sometimes useful',
          },
        },
      };
      const result = service.buildOpinionsContext('bree_millhaven', personality);
      expect(result).toContain('hodge_fence');
      expect(result).toContain('shady dealer');
    });

    it('should merge overrides over base opinions', () => {
      service.setOpinionOverride('bree_millhaven', 'hodge_fence', 'Now fully trusts him');
      const personality = {
        consciousnessContext: {
          opinionsAbout: {
            hodge_fence: 'Old opinion — shady.',
          },
        },
      };
      const result = service.buildOpinionsContext('bree_millhaven', personality);
      expect(result).toContain('Now fully trusts him');
      expect(result).not.toContain('shady');
    });

    it('should filter to only nearby NPCs when provided', () => {
      const personality = {
        consciousnessContext: {
          opinionsAbout: {
            hodge_fence: 'Shady.',
            aldovar_crennick: 'Reliable leader.',
          },
        },
      };
      const result = service.buildOpinionsContext('bree_millhaven', personality, ['hodge_fence']);
      expect(result).toContain('hodge_fence');
      expect(result).not.toContain('aldovar_crennick');
    });
  });

  // ── Housekeeping ──────────────────────────────────────────────────────

  describe('clearAll / clearEvolution', () => {
    it('should clear all evolution records', () => {
      service.getEvolution('bree_millhaven');
      service.getEvolution('aldovar_crennick');
      service.clearAll();
      // After clear, getEvolution returns fresh records
      expect(service.getEvolution('bree_millhaven').encountersSurvived).toBe(0);
    });

    it('should clear a single NPC evolution', () => {
      service.advanceArc('bree_millhaven', 0.5);
      service.advanceArc('aldovar_crennick', 0.3);
      service.clearEvolution('bree_millhaven');
      expect(service.getEvolution('bree_millhaven').arcStage).toBe(0);
      expect(service.getEvolution('aldovar_crennick').arcStage).toBeCloseTo(0.3);
    });
  });
});
