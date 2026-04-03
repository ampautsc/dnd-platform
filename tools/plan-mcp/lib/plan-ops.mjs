import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, normalize, extname, basename } from 'node:path';

/**
 * Validates that a filename is safe and within the plans directory.
 * Returns the resolved absolute path or an error.
 * 
 * @param {string} plansDir - Absolute path to the plans directory
 * @param {string} filename - The filename to validate
 * @returns {{ valid: true, resolvedPath: string } | { valid: false, error: string }}
 */
export function validatePlanPath(plansDir, filename) {
  if (!filename || typeof filename !== 'string') {
    return { valid: false, error: 'Filename is required and must be a non-empty string' };
  }

  // Must be .md
  if (extname(filename) !== '.md') {
    return { valid: false, error: 'Plan files must have a .md extension' };
  }

  // No path traversal
  const normalizedFilename = normalize(filename);
  if (normalizedFilename.includes('..') || normalizedFilename.includes('/') || normalizedFilename.includes('\\')) {
    return { valid: false, error: 'Filename must not contain path separators or traversal sequences' };
  }

  // Must be a simple filename (no directories)
  if (basename(normalizedFilename) !== normalizedFilename) {
    return { valid: false, error: 'Filename must be a simple name, not a path' };
  }

  const resolvedPath = resolve(plansDir, normalizedFilename);

  // Double-check resolved path is within plansDir
  if (!resolvedPath.startsWith(resolve(plansDir))) {
    return { valid: false, error: 'Resolved path escapes the plans directory' };
  }

  return { valid: true, resolvedPath };
}

/**
 * Lists all .md files in the plans directory.
 * 
 * @param {string} plansDir - Absolute path to the plans directory
 * @returns {Promise<string[]>} Array of plan filenames
 */
export async function listPlans(plansDir) {
  await ensurePlansDir(plansDir);
  const entries = await readdir(plansDir, { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && extname(e.name) === '.md' && e.name !== 'README.md')
    .map(e => e.name)
    .sort();
}

/**
 * Reads a plan file.
 * 
 * @param {string} plansDir - Absolute path to the plans directory
 * @param {string} filename - The plan filename
 * @returns {Promise<string>} The plan content
 */
export async function readPlan(plansDir, filename) {
  const validation = validatePlanPath(plansDir, filename);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  return readFile(validation.resolvedPath, 'utf-8');
}

/**
 * Writes a plan file. Creates the plans directory if needed.
 * 
 * @param {string} plansDir - Absolute path to the plans directory
 * @param {string} filename - The plan filename
 * @param {string} content - The plan content
 * @returns {Promise<string>} The resolved path that was written
 */
export async function writePlan(plansDir, filename, content) {
  const validation = validatePlanPath(plansDir, filename);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  
  if (!content || typeof content !== 'string') {
    throw new Error('Plan content is required and must be a non-empty string');
  }

  await ensurePlansDir(plansDir);
  await writeFile(validation.resolvedPath, content, 'utf-8');
  return validation.resolvedPath;
}

/**
 * Ensures the plans directory exists.
 * 
 * @param {string} plansDir - Absolute path to the plans directory
 */
async function ensurePlansDir(plansDir) {
  try {
    await stat(plansDir);
  } catch {
    await mkdir(plansDir, { recursive: true });
  }
}
