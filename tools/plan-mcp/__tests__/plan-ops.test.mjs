import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { validatePlanPath, listPlans, readPlan, writePlan } from '../lib/plan-ops.mjs';
import { generatePlanTemplate } from '../lib/template.mjs';

// ============================================================
// validatePlanPath
// ============================================================
describe('validatePlanPath', () => {
  const plansDir = '/fake/plans';

  it('should accept a simple .md filename', () => {
    const result = validatePlanPath(plansDir, 'my-plan.md');
    assert.equal(result.valid, true);
    assert.ok(result.resolvedPath.endsWith('my-plan.md'));
  });

  it('should reject files without .md extension', () => {
    const result = validatePlanPath(plansDir, 'my-plan.txt');
    assert.equal(result.valid, false);
    assert.match(result.error, /\.md extension/);
  });

  it('should reject empty filename', () => {
    const result = validatePlanPath(plansDir, '');
    assert.equal(result.valid, false);
    assert.match(result.error, /required/);
  });

  it('should reject null filename', () => {
    const result = validatePlanPath(plansDir, null);
    assert.equal(result.valid, false);
  });

  it('should reject path traversal with ..', () => {
    const result = validatePlanPath(plansDir, '../../../etc/passwd.md');
    assert.equal(result.valid, false);
    assert.match(result.error, /traversal|separator/);
  });

  it('should reject filenames with forward slashes', () => {
    const result = validatePlanPath(plansDir, 'sub/dir/plan.md');
    assert.equal(result.valid, false);
    assert.match(result.error, /separator|traversal/);
  });

  it('should reject filenames with backslashes', () => {
    const result = validatePlanPath(plansDir, 'sub\\dir\\plan.md');
    assert.equal(result.valid, false);
    assert.match(result.error, /separator|traversal/);
  });

  it('should accept filenames with hyphens and underscores', () => {
    const result = validatePlanPath(plansDir, 'combat-engine_v2.md');
    assert.equal(result.valid, true);
  });

  it('should ensure resolved path is within plansDir', () => {
    const result = validatePlanPath(plansDir, 'legit-plan.md');
    assert.equal(result.valid, true);
    assert.ok(result.resolvedPath.includes('plans'));
  });
});

// ============================================================
// listPlans — filesystem operations against temp dir
// ============================================================
describe('listPlans', () => {
  let tempDir;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'plan-test-'));
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should return empty array for empty directory', async () => {
    const plans = await listPlans(tempDir);
    assert.deepEqual(plans, []);
  });

  it('should list .md files excluding README.md', async () => {
    await writeFile(join(tempDir, 'README.md'), '# Plans');
    await writeFile(join(tempDir, 'combat-plan.md'), '# Combat Plan');
    await writeFile(join(tempDir, 'api-plan.md'), '# API Plan');
    await writeFile(join(tempDir, 'notes.txt'), 'not a plan');

    const plans = await listPlans(tempDir);
    assert.deepEqual(plans, ['api-plan.md', 'combat-plan.md']);
  });

  it('should create directory if it does not exist', async () => {
    const nonExistent = join(tempDir, 'sub', 'plans');
    const plans = await listPlans(nonExistent);
    assert.deepEqual(plans, []);
  });
});

// ============================================================
// readPlan
// ============================================================
describe('readPlan', () => {
  let tempDir;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'plan-read-'));
    await writeFile(join(tempDir, 'existing.md'), '# Existing Plan\n\nContent here.');
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should read an existing plan file', async () => {
    const content = await readPlan(tempDir, 'existing.md');
    assert.equal(content, '# Existing Plan\n\nContent here.');
  });

  it('should throw for non-existent plan', async () => {
    await assert.rejects(
      () => readPlan(tempDir, 'nope.md'),
      { code: 'ENOENT' }
    );
  });

  it('should throw for invalid filename', async () => {
    await assert.rejects(
      () => readPlan(tempDir, '../escape.md'),
      /traversal|separator/
    );
  });
});

// ============================================================
// writePlan
// ============================================================
describe('writePlan', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'plan-write-'));
  });

  it('should create a new plan file', async () => {
    const path = await writePlan(tempDir, 'new-plan.md', '# New Plan');
    const content = await readFile(path, 'utf-8');
    assert.equal(content, '# New Plan');
  });

  it('should overwrite an existing plan file', async () => {
    await writePlan(tempDir, 'plan.md', '# Version 1');
    await writePlan(tempDir, 'plan.md', '# Version 2');
    const content = await readFile(join(tempDir, 'plan.md'), 'utf-8');
    assert.equal(content, '# Version 2');
  });

  it('should reject empty content', async () => {
    await assert.rejects(
      () => writePlan(tempDir, 'plan.md', ''),
      /content is required/
    );
  });

  it('should reject path traversal', async () => {
    await assert.rejects(
      () => writePlan(tempDir, '../escape.md', '# Evil'),
      /traversal|separator/
    );
  });

  it('should reject non-.md files', async () => {
    await assert.rejects(
      () => writePlan(tempDir, 'plan.js', 'console.log("hi")'),
      /\.md extension/
    );
  });
});

// ============================================================
// generatePlanTemplate
// ============================================================
describe('generatePlanTemplate', () => {
  it('should generate a plan with title and all sections', () => {
    const plan = generatePlanTemplate('Combat Engine Refactor');
    assert.match(plan, /^# Combat Engine Refactor/);
    assert.match(plan, /## Objective/);
    assert.match(plan, /## Success Criteria/);
    assert.match(plan, /## Scope/);
    assert.match(plan, /## Phases/);
    assert.match(plan, /## Tasks/);
    assert.match(plan, /## Testing Strategy/);
    assert.match(plan, /Status: Draft/);
  });

  it('should include provided content for a section', () => {
    const plan = generatePlanTemplate('My Plan', {
      objective: 'Build the thing because reasons.',
    });
    assert.match(plan, /Build the thing because reasons\./);
    // Other sections should still have placeholder comments
    assert.match(plan, /<!-- How do we know this is done/);
  });

  it('should include HTML comments as guidance for empty sections', () => {
    const plan = generatePlanTemplate('Empty Plan');
    assert.match(plan, /<!-- What is being built and why/);
  });

  it('should throw for empty title', () => {
    assert.throws(() => generatePlanTemplate(''), /title is required/);
  });

  it('should throw for non-string title', () => {
    assert.throws(() => generatePlanTemplate(42), /title is required/);
  });

  it('should include scope subsections', () => {
    const plan = generatePlanTemplate('Scoped Plan');
    assert.match(plan, /### In Scope/);
    assert.match(plan, /### Out of Scope/);
  });

  it('should include created date', () => {
    const plan = generatePlanTemplate('Dated Plan');
    const today = new Date().toISOString().split('T')[0];
    assert.match(plan, new RegExp(`Created: ${today}`));
  });
});
