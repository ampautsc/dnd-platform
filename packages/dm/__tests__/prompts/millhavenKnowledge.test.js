import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Requirements for millhavenKnowledge:
 *
 * 1. XML file exists at packages/dm/src/prompts/millhavenKnowledge.xml
 * 2. JS module exports the XML string as `millhavenKnowledge`
 * 3. XML contains all required setting sections for Millhaven
 * 4. Content is consistent with packages/content/src/towns/data/millhaven.json
 * 5. XML is well-formed (all opened tags are closed)
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const xmlPath = resolve(__dirname, '../../src/prompts/millhavenKnowledge.xml');

// Load the raw XML for structural tests
const rawXml = readFileSync(xmlPath, 'utf-8');

// Load the JS module export
const { millhavenKnowledge } = await import('../../src/prompts/millhavenKnowledge.js');

describe('millhavenKnowledge.xml — structure', () => {
  it('should export the XML string from the JS module', () => {
    assert.equal(typeof millhavenKnowledge, 'string');
    assert.ok(millhavenKnowledge.length > 0, 'millhavenKnowledge should not be empty');
  });

  it('should match the raw XML file content', () => {
    assert.equal(millhavenKnowledge, rawXml);
  });

  it('should be wrapped in a <setting name="millhaven"> root tag', () => {
    assert.ok(rawXml.includes('<setting name="millhaven">'), 'missing opening <setting name="millhaven">');
    assert.ok(rawXml.includes('</setting>'), 'missing closing </setting>');
  });

  const requiredSections = [
    'overview',
    'geography',
    'factions',
    'economy',
    'social_norms',
    'local_religion',
  ];

  for (const section of requiredSections) {
    it(`should contain <${section}> section`, () => {
      assert.ok(rawXml.includes(`<${section}>`), `missing opening <${section}>`);
      assert.ok(rawXml.includes(`</${section}>`), `missing closing </${section}>`);
    });
  }
});

describe('millhavenKnowledge.xml — content accuracy', () => {
  it('should reference Millhaven population (~1,200)', () => {
    assert.ok(rawXml.includes('1,200') || rawXml.includes('1200'),
      'Millhaven population should be ~1200');
  });

  it('should reference the Stoneback River', () => {
    assert.ok(rawXml.includes('Stoneback River'), 'missing Stoneback River');
  });

  it('should reference the King\'s Road', () => {
    assert.ok(rawXml.includes("King's Road") || rawXml.includes("King\u2019s Road"),
      "missing King's Road");
  });

  it('should reference the Temple of the Allmother', () => {
    assert.ok(rawXml.includes('Allmother'), 'missing Temple of the Allmother');
  });

  it('should reference the Darkwood Forest', () => {
    assert.ok(rawXml.includes('Darkwood Forest'), 'missing Darkwood Forest');
  });

  it('should reference Tenthday market', () => {
    assert.ok(rawXml.includes('Tenthday'), 'missing Tenthday reference');
  });

  it('should reference faction leaders', () => {
    assert.ok(rawXml.includes('Aldovar Crennick'), 'missing Town Council leader');
    assert.ok(rawXml.includes('Edric Vane'), 'missing Guard Captain');
    assert.ok(rawXml.includes('Brother Aldwin'), 'missing temple tender');
  });

  it('should reference social gathering spots', () => {
    assert.ok(rawXml.includes('Bottoms Up') || rawXml.includes('Tipsy Gnome'),
      'missing social gathering spots (taverns)');
  });
});

describe('millhavenKnowledge.xml — well-formed XML', () => {
  it('should have matching open/close tags for all sections', () => {
    const openTags = rawXml.match(/<([a-z_]+)(?:\s[^>]*)?>/g) || [];
    const closeTags = rawXml.match(/<\/([a-z_]+)>/g) || [];

    const openCounts = {};
    for (const tag of openTags) {
      const name = tag.match(/<([a-z_]+)/)[1];
      openCounts[name] = (openCounts[name] || 0) + 1;
    }

    const closeCounts = {};
    for (const tag of closeTags) {
      const name = tag.match(/<\/([a-z_]+)/)[1];
      closeCounts[name] = (closeCounts[name] || 0) + 1;
    }

    for (const [name, count] of Object.entries(openCounts)) {
      assert.equal(closeCounts[name], count,
        `tag <${name}> opened ${count} times but closed ${closeCounts[name] || 0} times`);
    }
  });
});
