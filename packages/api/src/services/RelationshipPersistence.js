/**
 * RelationshipPersistence — SQLite persistence adapter for RelationshipRepository.
 *
 * Implements the adapter interface expected by RelationshipRepository:
 *   - save(subjectId, targetId, data) → upsert a relationship
 *   - load(subjectId, targetId)       → retrieve one or null
 *   - loadAll()                       → retrieve all relationships
 *
 * JSON fields (memories) are serialized/deserialized transparently.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {{ save, load, loadAll }}
 */
export function createRelationshipPersistence(db) {
  const upsertStmt = db.prepare(`
    INSERT INTO relationships (subjectId, targetId, recognitionTier, displayLabel, memories, emotionalValence, encounterCount, lastEncounter, createdAt)
    VALUES (@subjectId, @targetId, @recognitionTier, @displayLabel, @memories, @emotionalValence, @encounterCount, @lastEncounter, @createdAt)
    ON CONFLICT(subjectId, targetId) DO UPDATE SET
      recognitionTier = @recognitionTier,
      displayLabel = @displayLabel,
      memories = @memories,
      emotionalValence = @emotionalValence,
      encounterCount = @encounterCount,
      lastEncounter = @lastEncounter
  `);

  const loadStmt = db.prepare(
    'SELECT * FROM relationships WHERE subjectId = ? AND targetId = ?'
  );

  const loadAllStmt = db.prepare('SELECT * FROM relationships');

  function deserialize(row) {
    if (!row) return null;
    return {
      subjectId: row.subjectId,
      targetId: row.targetId,
      recognitionTier: row.recognitionTier,
      displayLabel: row.displayLabel,
      memories: JSON.parse(row.memories || '[]'),
      emotionalValence: row.emotionalValence,
      encounterCount: row.encounterCount,
      lastEncounter: row.lastEncounter,
      createdAt: row.createdAt,
    };
  }

  return {
    save(subjectId, targetId, data) {
      upsertStmt.run({
        subjectId,
        targetId,
        recognitionTier: data.recognitionTier || 'stranger',
        displayLabel: data.displayLabel || null,
        memories: JSON.stringify(data.memories || []),
        emotionalValence: data.emotionalValence || 0,
        encounterCount: data.encounterCount || 0,
        lastEncounter: data.lastEncounter || null,
        createdAt: data.createdAt || new Date().toISOString(),
      });
    },

    load(subjectId, targetId) {
      return deserialize(loadStmt.get(subjectId, targetId));
    },

    loadAll() {
      return loadAllStmt.all().map(deserialize);
    },
  };
}
