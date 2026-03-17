/**
 * CharacterService — Character CRUD operations
 * 
 * Pure service layer on top of SQLite. Receives db as a dependency.
 * JSON fields are stored as TEXT in SQLite, parsed on read.
 */
import { v4 as uuidv4 } from 'uuid';

const JSON_FIELDS = ['baseStats', 'speciesAsi', 'levelChoices', 'inventory', 'currency'];

/**
 * Parse JSON columns from a raw database row.
 */
function parseRow(row) {
  if (!row) return null;
  const parsed = { ...row };
  for (const field of JSON_FIELDS) {
    if (typeof parsed[field] === 'string') {
      parsed[field] = JSON.parse(parsed[field]);
    }
  }
  return parsed;
}

/**
 * Create a CharacterService bound to a database instance.
 * @param {import('better-sqlite3').Database} db
 */
export function createCharacterService(db) {
  const insertStmt = db.prepare(`
    INSERT INTO characters (id, userId, name, level, className, speciesId, baseStats, speciesAsi, levelChoices, inventory, currency, maxHp, currentHp)
    VALUES (@id, @userId, @name, @level, @className, @speciesId, @baseStats, @speciesAsi, @levelChoices, @inventory, @currency, @maxHp, @currentHp)
  `);

  const getByIdStmt = db.prepare('SELECT * FROM characters WHERE id = ?');
  const getAllByUserStmt = db.prepare('SELECT * FROM characters WHERE userId = ?');
  const removeStmt = db.prepare('DELETE FROM characters WHERE id = ?');

  return {
    /**
     * Create a new character.
     * @param {string} userId - Owner's user ID
     * @param {Object} data - Character data
     * @returns {Object} Created character with generated id
     */
    create(userId, data) {
      if (!data.name) {
        throw new Error('Character name is required');
      }

      const id = uuidv4();
      const row = {
        id,
        userId,
        name: data.name,
        level: data.level ?? 1,
        className: data.className ?? 'Fighter',
        speciesId: data.speciesId ?? null,
        baseStats: JSON.stringify(data.baseStats ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }),
        speciesAsi: JSON.stringify(data.speciesAsi ?? []),
        levelChoices: JSON.stringify(data.levelChoices ?? []),
        inventory: JSON.stringify(data.inventory ?? []),
        currency: JSON.stringify(data.currency ?? { cp: 0, sp: 0, gp: 0, pp: 0 }),
        maxHp: data.maxHp ?? 10,
        currentHp: data.currentHp ?? 10,
      };

      insertStmt.run(row);
      return parseRow(getByIdStmt.get(id));
    },

    /**
     * Get a character by ID.
     * @param {string} id
     * @returns {Object|null}
     */
    getById(id) {
      return parseRow(getByIdStmt.get(id));
    },

    /**
     * Get all characters belonging to a user.
     * @param {string} userId
     * @returns {Object[]}
     */
    getAllByUser(userId) {
      return getAllByUserStmt.all(userId).map(parseRow);
    },

    /**
     * Update a character's fields. Only updates fields present in `data`.
     * @param {string} id
     * @param {Object} data - Fields to update
     * @returns {Object|null} Updated character, or null if not found
     */
    update(id, data) {
      const existing = getByIdStmt.get(id);
      if (!existing) return null;

      const updates = {};
      const allowedFields = ['name', 'level', 'className', 'speciesId', 'maxHp', 'currentHp',
        ...JSON_FIELDS];

      for (const field of allowedFields) {
        if (data[field] !== undefined) {
          updates[field] = JSON_FIELDS.includes(field) ? JSON.stringify(data[field]) : data[field];
        }
      }

      if (Object.keys(updates).length === 0) {
        return parseRow(existing);
      }

      const setClauses = Object.keys(updates).map(k => `${k} = @${k}`);
      setClauses.push("updatedAt = datetime('now')");

      const updateSql = `UPDATE characters SET ${setClauses.join(', ')} WHERE id = @id`;
      db.prepare(updateSql).run({ ...updates, id });

      return parseRow(getByIdStmt.get(id));
    },

    /**
     * Delete a character by ID.
     * @param {string} id
     * @returns {boolean} true if deleted, false if not found
     */
    remove(id) {
      const result = removeStmt.run(id);
      return result.changes > 0;
    },
  };
}
