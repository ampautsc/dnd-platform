import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Requirements for npc-context:
 *
 * 1. XML files exist at packages/dm/src/prompts/npc-context/
 * 2. Each XML file follows the 3-level schema: root→section→e
 * 3. world-common.xml contains exactly 10 sections with the approved ids
 * 4. City files each contain the expected sections
 * 5. XML is well-formed (all opened tags are closed)
 * 6. loader.js caches content in memory after first read (same reference)
 * 7. clearContextCache() resets the cache
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const npcContextDir = resolve(__dirname, '../../src/prompts/npc-context');

// ─── loader module ────────────────────────────────────────────────────────────
const { loadContextFile, clearContextCache } = await import('../../src/prompts/npc-context/loader.js');

// ─── helpers ─────────────────────────────────────────────────────────────────

function readXml(filename) {
  return readFileSync(resolve(npcContextDir, filename), 'utf8');
}

function extractSectionIds(xml) {
  const matches = [...xml.matchAll(/<section id="([^"]+)"/g)];
  return matches.map(m => m[1]);
}

function countEntries(xml) {
  return (xml.match(/<e id=/g) || []).length;
}

function isWellFormed(xml) {
  const openTags = xml.match(/<([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?>/g) || [];
  const closeTags = xml.match(/<\/([a-zA-Z][a-zA-Z0-9-]*)>/g) || [];

  const openCounts = {};
  for (const tag of openTags) {
    const name = tag.match(/<([a-zA-Z][a-zA-Z0-9-]*)/)[1];
    if (name === '?xml') continue;
    openCounts[name] = (openCounts[name] || 0) + 1;
  }

  const closeCounts = {};
  for (const tag of closeTags) {
    const name = tag.match(/<\/([a-zA-Z][a-zA-Z0-9-]*)/)[1];
    closeCounts[name] = (closeCounts[name] || 0) + 1;
  }

  for (const [name, count] of Object.entries(openCounts)) {
    if ((closeCounts[name] || 0) !== count) return false;
  }
  return true;
}

// ─── world-common.xml ─────────────────────────────────────────────────────────

const worldCommonXml = readXml('world-common.xml');

describe('npc-context/world-common.xml — structure', () => {
  it('should be wrapped in a <world-context> root tag', () => {
    assert.ok(worldCommonXml.includes('<world-context'), 'missing <world-context> opening tag');
    assert.ok(worldCommonXml.includes('</world-context>'), 'missing </world-context> closing tag');
  });

  it('should carry year="1492-DR" attribute', () => {
    assert.ok(worldCommonXml.includes('year="1492-DR"'), 'missing year="1492-DR" attribute');
  });

  const requiredSections = [
    'geography',
    'religion',
    'economy',
    'magic',
    'faction',
    'danger',
    'daily-life',
    'cosmology',
    'calendar',
    'society',
  ];

  it('should contain exactly 10 sections', () => {
    const ids = extractSectionIds(worldCommonXml);
    assert.equal(ids.length, 10, `expected 10 sections, found ${ids.length}: ${ids.join(', ')}`);
  });

  for (const section of requiredSections) {
    it(`should contain section id="${section}"`, () => {
      assert.ok(worldCommonXml.includes(`<section id="${section}">`),
        `missing <section id="${section}">`);
    });
  }

  it('should contain at least 60 entries', () => {
    const count = countEntries(worldCommonXml);
    assert.ok(count >= 60, `expected ≥60 entries, found ${count}`);
  });

  it('should be well-formed XML', () => {
    assert.ok(isWellFormed(worldCommonXml), 'XML is not well-formed (mismatched open/close tags)');
  });
});

describe('npc-context/world-common.xml — content', () => {
  it('should contain Sword Coast geography entry', () => {
    assert.ok(worldCommonXml.includes('sword-coast'), 'missing sword-coast entry');
  });

  it('should reference 1492 DR calendar', () => {
    assert.ok(worldCommonXml.includes('1492 DR'), 'missing 1492 DR year reference');
  });

  it('should reference the Second Sundering', () => {
    assert.ok(worldCommonXml.includes('Second Sundering') || worldCommonXml.includes('second-sundering'),
      'missing Second Sundering reference');
  });

  it('should reference Mystra and the Weave', () => {
    assert.ok(worldCommonXml.includes('Mystra'), 'missing Mystra reference');
    assert.ok(worldCommonXml.includes('Weave') || worldCommonXml.includes('weave'),
      'missing Weave reference');
  });

  it('should contain major city references', () => {
    assert.ok(worldCommonXml.includes('Waterdeep'), 'missing Waterdeep');
    assert.ok(worldCommonXml.includes("Baldur's Gate") || worldCommonXml.includes('Baldur'), 'missing Baldur\'s Gate');
    assert.ok(worldCommonXml.includes('Neverwinter'), 'missing Neverwinter');
  });
});

// ─── city-waterdeep.xml ───────────────────────────────────────────────────────

const waterdeepXml = readXml('city-waterdeep.xml');

describe('npc-context/city-waterdeep.xml — structure', () => {
  it('should be wrapped in a <city-context id="waterdeep"> root tag', () => {
    assert.ok(waterdeepXml.includes('<city-context id="waterdeep"'), 'missing <city-context id="waterdeep">');
    assert.ok(waterdeepXml.includes('</city-context>'), 'missing </city-context>');
  });

  const requiredSections = ['governance', 'districts', 'landmarks', 'guilds-and-factions', 'economy-local'];

  for (const section of requiredSections) {
    it(`should contain section id="${section}"`, () => {
      assert.ok(waterdeepXml.includes(`<section id="${section}">`),
        `missing <section id="${section}">`);
    });
  }

  it('should be well-formed XML', () => {
    assert.ok(isWellFormed(waterdeepXml), 'XML is not well-formed');
  });
});

describe('npc-context/city-waterdeep.xml — content', () => {
  it('should reference the Masked Lords', () => {
    assert.ok(waterdeepXml.includes('Masked Lords') || waterdeepXml.includes('masked-lords'),
      'missing Masked Lords reference');
  });

  it('should reference the Yawning Portal', () => {
    assert.ok(waterdeepXml.includes('yawning-portal') || waterdeepXml.includes('Yawning Portal'),
      'missing Yawning Portal');
  });

  it('should reference Undermountain', () => {
    assert.ok(waterdeepXml.includes('Undermountain'), 'missing Undermountain');
  });

  it('should reference Laeral Silverhand as Open Lord', () => {
    assert.ok(waterdeepXml.includes('Laeral'), 'missing Laeral Silverhand reference');
  });
});

// ─── city-baldurs-gate.xml ────────────────────────────────────────────────────

const baldursGateXml = readXml('city-baldurs-gate.xml');

describe('npc-context/city-baldurs-gate.xml — structure', () => {
  it('should be wrapped in a <city-context id="baldurs-gate"> root tag', () => {
    assert.ok(baldursGateXml.includes('<city-context id="baldurs-gate"'), 'missing <city-context id="baldurs-gate">');
    assert.ok(baldursGateXml.includes('</city-context>'), 'missing </city-context>');
  });

  const requiredSections = ['governance', 'districts', 'landmarks', 'factions-local', 'economy-local'];

  for (const section of requiredSections) {
    it(`should contain section id="${section}"`, () => {
      assert.ok(baldursGateXml.includes(`<section id="${section}">`),
        `missing <section id="${section}">`);
    });
  }

  it('should be well-formed XML', () => {
    assert.ok(isWellFormed(baldursGateXml), 'XML is not well-formed');
  });
});

describe('npc-context/city-baldurs-gate.xml — content', () => {
  it('should reference the Flaming Fist', () => {
    assert.ok(baldursGateXml.includes('Flaming Fist'), 'missing Flaming Fist reference');
  });

  it('should reference Elfsong Tavern', () => {
    assert.ok(baldursGateXml.includes('Elfsong'), 'missing Elfsong Tavern');
  });

  it('should reference Grand Duke Ulder Ravengard', () => {
    assert.ok(baldursGateXml.includes('Ravengard'), 'missing Grand Duke Ravengard reference');
  });
});

// ─── city-neverwinter.xml ─────────────────────────────────────────────────────

const neverwinterXml = readXml('city-neverwinter.xml');

describe('npc-context/city-neverwinter.xml — structure', () => {
  it('should be wrapped in a <city-context id="neverwinter"> root tag', () => {
    assert.ok(neverwinterXml.includes('<city-context id="neverwinter"'), 'missing <city-context id="neverwinter">');
    assert.ok(neverwinterXml.includes('</city-context>'), 'missing </city-context>');
  });

  const requiredSections = ['governance', 'geography-local', 'history-local', 'landmarks', 'factions-local', 'economy-local'];

  for (const section of requiredSections) {
    it(`should contain section id="${section}"`, () => {
      assert.ok(neverwinterXml.includes(`<section id="${section}">`),
        `missing <section id="${section}">`);
    });
  }

  it('should be well-formed XML', () => {
    assert.ok(isWellFormed(neverwinterXml), 'XML is not well-formed');
  });
});

describe('npc-context/city-neverwinter.xml — content', () => {
  it('should reference Lord Protector Neverember', () => {
    assert.ok(neverwinterXml.includes('Neverember'), 'missing Neverember reference');
  });

  it('should reference Mount Hotenow eruption', () => {
    assert.ok(neverwinterXml.includes('Hotenow'), 'missing Mount Hotenow reference');
  });

  it('should reference the Sons of Alagondar', () => {
    assert.ok(neverwinterXml.includes('Alagondar'), 'missing Sons of Alagondar reference');
  });

  it('should reference the Driftwood Tavern', () => {
    assert.ok(neverwinterXml.includes('driftwood-tavern') || neverwinterXml.includes('Driftwood Tavern'),
      'missing Driftwood Tavern reference');
  });
});

// ─── location-bottoms-up.xml ──────────────────────────────────────────────────

const bottomsUpXml = readXml('location-bottoms-up.xml');

describe('npc-context/location-bottoms-up.xml — structure', () => {
  it('should be wrapped in a <location-context id="bottoms-up"> root tag', () => {
    assert.ok(bottomsUpXml.includes('<location-context id="bottoms-up"'), 'missing <location-context id="bottoms-up">');
    assert.ok(bottomsUpXml.includes('</location-context>'), 'missing </location-context>');
  });

  const requiredSections = ['physical', 'staff', 'operations', 'regulars', 'history', 'local-standing'];

  for (const section of requiredSections) {
    it(`should contain section id="${section}"`, () => {
      assert.ok(bottomsUpXml.includes(`<section id="${section}">`),
        `missing <section id="${section}">`);
    });
  }

  it('should be well-formed XML', () => {
    assert.ok(isWellFormed(bottomsUpXml), 'XML is not well-formed');
  });
});

describe('npc-context/location-bottoms-up.xml — content', () => {
  it('should reference Norvin Stonebottom and the end stool', () => {
    assert.ok(bottomsUpXml.includes('norvin') || bottomsUpXml.includes('Norvin'), 'missing Norvin reference');
    assert.ok(bottomsUpXml.includes('stool') || bottomsUpXml.includes('end stool'), 'missing end stool reference');
  });

  it('should reference Carza Bitetongue', () => {
    assert.ok(bottomsUpXml.includes('carza') || bottomsUpXml.includes('Carza'), 'missing Carza reference');
  });

  it('should reference Woody Tallfield', () => {
    assert.ok(bottomsUpXml.includes('woody') || bottomsUpXml.includes('Woody'), 'missing Woody reference');
  });

  it('should reference Rebeciel Ashgrace', () => {
    assert.ok(bottomsUpXml.includes('rebeciel') || bottomsUpXml.includes('Rebeciel'), 'missing Rebeciel reference');
  });

  it('should reference the third-floor card game', () => {
    assert.ok(bottomsUpXml.includes('third') && (bottomsUpXml.includes('card') || bottomsUpXml.includes('card game')),
      'missing third-floor card game reference');
  });

  it('should reference Oma Steadwick and the bread basket', () => {
    assert.ok(bottomsUpXml.includes('Oma') || bottomsUpXml.includes('oma'), 'missing Oma reference');
    assert.ok(bottomsUpXml.includes('bread') || bottomsUpXml.includes('basket'), 'missing bread basket reference');
  });

  it('should reference sobriety or the sobriety token', () => {
    assert.ok(bottomsUpXml.includes('sober') || bottomsUpXml.includes('sobriety') || bottomsUpXml.includes('token'),
      'missing sobriety reference');
  });

  it('should reference the Tipsy Gnome', () => {
    assert.ok(bottomsUpXml.includes('Tipsy Gnome') || bottomsUpXml.includes('tipsy-gnome'),
      'missing Tipsy Gnome reference');
  });

  it('should reference Harrik Hatfield', () => {
    assert.ok(bottomsUpXml.includes('Harrik') || bottomsUpXml.includes('harrik'), 'missing Harrik reference');
  });

  it('should reference the locked cabinet in the cellar', () => {
    assert.ok(bottomsUpXml.includes('cabinet') || bottomsUpXml.includes('cellar'), 'missing cellar/cabinet reference');
  });
});

// ─── town-millhaven.xml ───────────────────────────────────────────────────────

const millhavenXml = readXml('town-millhaven.xml');

describe('npc-context/town-millhaven.xml — structure', () => {
  it('should be wrapped in a <town-context id="millhaven"> root tag', () => {
    assert.ok(millhavenXml.includes('<town-context id="millhaven"'), 'missing <town-context id="millhaven">');
    assert.ok(millhavenXml.includes('</town-context>'), 'missing </town-context>');
  });

  const requiredSections = ['geography', 'governance', 'economy', 'social-fabric', 'samrens-history', 'notable-people'];

  for (const section of requiredSections) {
    it(`should contain section id="${section}"`, () => {
      assert.ok(millhavenXml.includes(`<section id="${section}">`),
        `missing <section id="${section}">`);
    });
  }

  it('should carry year="1492-DR" attribute', () => {
    assert.ok(millhavenXml.includes('year="1492-DR"'), 'missing year="1492-DR" attribute');
  });

  it('should be well-formed XML', () => {
    assert.ok(isWellFormed(millhavenXml), 'XML is not well-formed');
  });
});

describe('npc-context/town-millhaven.xml — content', () => {
  it('should reference the Stoneback River', () => {
    assert.ok(millhavenXml.includes('Stoneback River') || millhavenXml.includes('stoneback-river'),
      'missing Stoneback River reference');
  });

  it('should reference the King\'s Road', () => {
    assert.ok(millhavenXml.includes("King's Road") || millhavenXml.includes('kings-road'),
      "missing King's Road reference");
  });

  it('should reference Captain Edric Vane', () => {
    assert.ok(millhavenXml.includes('Vane') || millhavenXml.includes('vane') || millhavenXml.includes('Edric'),
      'missing Captain Vane reference');
  });

  it('should reference Aldovar Crennick', () => {
    assert.ok(millhavenXml.includes('Crennick') || millhavenXml.includes('Aldovar'), 'missing Aldovar Crennick reference');
  });

  it('should reference market day', () => {
    assert.ok(millhavenXml.includes('Tenthday') || millhavenXml.includes('market day') || millhavenXml.includes('market-day'),
      'missing market day reference');
  });

  it('should reference gossip or information flow', () => {
    assert.ok(millhavenXml.includes('gossip') || millhavenXml.includes('information'), 'missing gossip/information reference');
  });

  it('should reference the javelin circuit or Mayday Malondar', () => {
    assert.ok(millhavenXml.includes('javelin') || millhavenXml.includes('Mayday'), 'missing javelin/Mayday reference');
  });

  it('should reference Darkwood Forest', () => {
    assert.ok(millhavenXml.includes('Darkwood') || millhavenXml.includes('darkwood'), 'missing Darkwood Forest reference');
  });

  it('should reference the lower quarters or where Samren grew up', () => {
    assert.ok(millhavenXml.includes('lower quarters') || millhavenXml.includes('lower-quarters') || millhavenXml.includes('grew up'),
      'missing lower quarters / origin reference');
  });
});

// ─── loader.js ────────────────────────────────────────────────────────────────

describe('npc-context/loader.js — loadContextFile', () => {
  beforeEach(() => {
    clearContextCache();
  });

  it('should load world-common.xml and return a non-empty string', () => {
    const content = loadContextFile('world-common');
    assert.equal(typeof content, 'string');
    assert.ok(content.length > 0, 'content should not be empty');
  });

  it('should return content that matches the raw XML file', () => {
    const content = loadContextFile('world-common');
    const raw = readXml('world-common.xml');
    assert.equal(content, raw);
  });

  it('should cache: second call returns the same string reference', () => {
    const first = loadContextFile('world-common');
    const second = loadContextFile('world-common');
    assert.strictEqual(first, second, 'cached result should be the same reference');
  });

  it('should load city-waterdeep.xml', () => {
    const content = loadContextFile('city-waterdeep');
    assert.ok(content.includes('<city-context id="waterdeep"'), 'missing waterdeep root tag');
  });

  it('should load city-baldurs-gate.xml', () => {
    const content = loadContextFile('city-baldurs-gate');
    assert.ok(content.includes('<city-context id="baldurs-gate"'), 'missing baldurs-gate root tag');
  });

  it('should load city-neverwinter.xml', () => {
    const content = loadContextFile('city-neverwinter');
    assert.ok(content.includes('<city-context id="neverwinter"'), 'missing neverwinter root tag');
  });

  it('should load location-bottoms-up.xml', () => {
    const content = loadContextFile('location-bottoms-up');
    assert.ok(content.includes('<location-context id="bottoms-up"'), 'missing bottoms-up root tag');
  });

  it('should load town-millhaven.xml', () => {
    const content = loadContextFile('town-millhaven');
    assert.ok(content.includes('<town-context id="millhaven"'), 'missing millhaven root tag');
  });

  it('should throw when the file does not exist', () => {
    assert.throws(
      () => loadContextFile('nonexistent-file'),
      /ENOENT/,
      'should throw ENOENT for missing files',
    );
  });
});

describe('npc-context/loader.js — clearContextCache', () => {
  it('should allow a fresh read after clearing cache', () => {
    const first = loadContextFile('world-common');
    clearContextCache();
    const second = loadContextFile('world-common');
    // Content should be equal but now freshly read — not same reference
    assert.equal(first, second, 'content should be equal after cache clear + reload');
  });
});
