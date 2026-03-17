/**
 * Database — Thin SQLite wrapper using better-sqlite3
 * 
 * Owns schema creation, provides a singleton db instance per path.
 * All tables use TEXT primary keys (UUIDs) for portability.
 */
import Database from 'better-sqlite3';

let db = null;

/**
 * Initialize the database connection and create tables.
 * @param {string} [dbPath=':memory:'] - Path to SQLite file, or ':memory:' for in-memory
 * @returns {Database} better-sqlite3 instance
 */
export function initDatabase(dbPath = ':memory:') {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables(db);
  return db;
}

/**
 * Get the current database instance. Throws if not initialized.
 */
export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Close the database connection.
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Create all tables if they don't exist.
 */
function createTables(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      displayName TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      name TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      className TEXT NOT NULL DEFAULT 'Fighter',
      speciesId TEXT,
      baseStats TEXT NOT NULL DEFAULT '{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}',
      speciesAsi TEXT NOT NULL DEFAULT '[]',
      levelChoices TEXT NOT NULL DEFAULT '[]',
      inventory TEXT NOT NULL DEFAULT '[]',
      currency TEXT NOT NULL DEFAULT '{"cp":0,"sp":0,"gp":0,"pp":0}',
      maxHp INTEGER NOT NULL DEFAULT 10,
      currentHp INTEGER NOT NULL DEFAULT 10,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      createdBy TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'lobby',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (createdBy) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_characters_userId ON characters(userId);
    CREATE INDEX IF NOT EXISTS idx_sessions_createdBy ON sessions(createdBy);
  `);
}
