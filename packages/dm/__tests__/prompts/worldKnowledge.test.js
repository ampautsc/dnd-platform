import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Requirements for worldKnowledge:
 *
 * 1. XML file exists at packages/dm/src/prompts/worldKnowledge.xml
 * 2. JS module exports the XML string as `worldKnowledge`
 * 3. XML contains exactly 7 top-level sections matching the approved outline:
 *    currency, social_order, physical_world, gods_and_afterlife, magic, peoples, monsters_and_wilderness
 * 4. No setting-specific content (Millhaven is in its own file)
 * 5. XML is well-formed (all opened tags are closed)
 * 6. Content is factually correct per official D&D 5e sources (PHB, Basic Rules, SRD)
 * 7. Content is filtered through commoner perspective — no game mechanics commoners wouldn't know
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const xmlPath = resolve(__dirname, '../../src/prompts/worldKnowledge.xml');

// Load the raw XML for structural tests
const rawXml = readFileSync(xmlPath, 'utf-8');

// Load the JS module export
const { worldKnowledge } = await import('../../src/prompts/worldKnowledge.js');

describe('worldKnowledge.xml — structure', () => {
  it('should export the XML string from the JS module', () => {
    assert.equal(typeof worldKnowledge, 'string');
    assert.ok(worldKnowledge.length > 0, 'worldKnowledge should not be empty');
  });

  it('should match the raw XML file content', () => {
    assert.equal(worldKnowledge, rawXml);
  });

  it('should be wrapped in a <world_knowledge> root tag', () => {
    assert.ok(rawXml.includes('<world_knowledge>'), 'missing opening <world_knowledge>');
    assert.ok(rawXml.includes('</world_knowledge>'), 'missing closing </world_knowledge>');
  });

  const requiredSections = [
    'currency',
    'social_order',
    'physical_world',
    'gods_and_afterlife',
    'magic',
    'peoples',
    'monsters_and_wilderness',
  ];

  for (const section of requiredSections) {
    it(`should contain <${section}> section`, () => {
      assert.ok(rawXml.includes(`<${section}>`), `missing opening <${section}>`);
      assert.ok(rawXml.includes(`</${section}>`), `missing closing </${section}>`);
    });
  }

  it('should have exactly 7 top-level sections', () => {
    // Extract only direct children of <world_knowledge> by finding tags that
    // appear immediately after the root open or a sibling close
    const topLevel = rawXml
      .replace(/<\/?world_knowledge>/g, '')
      .match(/<([a-z_]+)>/g)
      .map(t => t.replace(/[<>]/g, ''));
    // The 7 top-level sections each appear exactly once as opening tags;
    // subsection tags also appear but are NOT in the required list
    const requiredSet = new Set(requiredSections);
    const topLevelFound = topLevel.filter(t => requiredSet.has(t));
    assert.equal(topLevelFound.length, 7,
      `expected 7 top-level sections, found ${topLevelFound.length}: ${topLevelFound.join(', ')}`);
  });

  // Subsection structure — each parent section should contain its expected children
  const expectedSubsections = {
    currency: ['coins', 'cost_of_living', 'commerce'],
    social_order: ['hierarchy', 'governance', 'languages'],
    physical_world: ['travel', 'planes'],
    gods_and_afterlife: ['worship', 'pantheon', 'death'],
    peoples: ['humans', 'dwarves', 'elves', 'halflings', 'gnomes', 'half_elves', 'half_orcs', 'dragonborn', 'tieflings'],
    monsters_and_wilderness: ['common_threats', 'undead', 'dragons', 'greater_threats'],
  };

  for (const [parent, children] of Object.entries(expectedSubsections)) {
    for (const child of children) {
      it(`<${parent}> should contain <${child}> subsection`, () => {
        // Verify the child tag exists between the parent open/close tags
        const parentRegex = new RegExp(`<${parent}>[\\s\\S]*<${child}>[\\s\\S]*</${child}>[\\s\\S]*</${parent}>`);
        assert.ok(parentRegex.test(rawXml),
          `<${child}> should be inside <${parent}>`);
      });
    }
  }

  it('<magic> should remain flat (no subsections needed)', () => {
    const magicContent = rawXml.match(/<magic>([\s\S]*?)<\/magic>/)[1];
    const innerTags = magicContent.match(/<([a-z_]+)>/g);
    assert.equal(innerTags, null, 'magic section should have no subsection tags');
  });
});

describe('worldKnowledge.xml — removed old sections', () => {
  // These were OLD top-level sections that no longer exist.
  // Note: 'languages', 'travel', 'planes' now exist as SUBSECTIONS but not as top-level sections.
  const removedSections = [
    'calendar',
    'social_structure',
    'religion',
    'creatures',
    'adventurers',
    'death_and_afterlife',
    'daily_life',
    'setting',
  ];

  for (const section of removedSections) {
    it(`should NOT contain old <${section}> section`, () => {
      assert.ok(!rawXml.includes(`<${section}>`),
        `old section <${section}> should have been removed`);
    });
  }
});

describe('worldKnowledge.xml — no setting-specific content', () => {
  it('should not mention Millhaven', () => {
    assert.ok(!rawXml.toLowerCase().includes('millhaven'),
      'world knowledge should not reference Millhaven');
  });
});

describe('worldKnowledge.xml — currency facts (PHB Ch.5)', () => {
  it('should list all five coin types', () => {
    for (const coin of ['copper', 'silver', 'electrum', 'gold', 'platinum']) {
      assert.ok(rawXml.toLowerCase().includes(coin), `missing coin: ${coin}`);
    }
  });

  it('should include correct exchange rates', () => {
    assert.ok(rawXml.includes('10cp = 1sp'), 'missing cp→sp rate');
    assert.ok(rawXml.includes('10sp = 1gp'), 'missing sp→gp rate');
    assert.ok(rawXml.includes('10gp = 1pp'), 'missing gp→pp rate');
  });

  it('should note electrum is rare and mistrusted', () => {
    assert.ok(rawXml.toLowerCase().includes('electrum') &&
      rawXml.toLowerCase().includes('mistrusted'),
      'missing electrum distrust note');
  });

  it('should include what coins buy (PHB canonical examples)', () => {
    // PHB: "A single copper piece buys a candle, a torch, or a piece of chalk"
    assert.ok(rawXml.includes('candle') && rawXml.includes('torch'),
      'missing copper piece purchasing examples');
    // PHB: "a bedroll, 50 feet of good rope, or a goat"
    assert.ok(rawXml.includes('bedroll') && rawXml.includes('rope') && rawXml.includes('goat'),
      'missing gold piece purchasing examples');
  });

  it('should include laborer wages', () => {
    // PHB: "a laborer's work for half a day" for 1sp → 2sp/day
    assert.ok(rawXml.includes('2sp per day'), 'missing unskilled laborer wage');
  });

  it('should mention peasants barter', () => {
    // PHB: "Members of the peasantry trade in goods, bartering"
    assert.ok(rawXml.toLowerCase().includes('barter'), 'missing barter reference');
  });

  it('should include food and lodging prices', () => {
    assert.ok(rawXml.includes('ale 4cp'), 'missing ale price');
    assert.ok(rawXml.includes('bread 2cp'), 'missing bread price');
    assert.ok(rawXml.includes('cheese 1sp'), 'missing cheese price');
  });

  it('should include trade goods (livestock prices)', () => {
    assert.ok(rawXml.includes('chicken') && rawXml.includes('2cp'), 'missing chicken price');
    assert.ok(rawXml.includes('cow') && rawXml.includes('10gp'), 'missing cow price');
    assert.ok(rawXml.includes('ox') && rawXml.includes('15gp'), 'missing ox price');
  });

  it('should mention guilds regulate trade', () => {
    assert.ok(rawXml.toLowerCase().includes('guild'), 'missing guild reference');
  });
});

describe('worldKnowledge.xml — social order facts', () => {
  it('should describe the class hierarchy', () => {
    assert.ok(rawXml.includes('Noble'), 'missing nobles');
    assert.ok(rawXml.includes('merchant'), 'missing merchants');
    assert.ok(rawXml.includes('laborer'), 'missing laborers');
  });

  it('should mention law enforcement', () => {
    assert.ok(rawXml.includes('guard') || rawXml.includes('militia'),
      'missing law enforcement');
  });

  it('should mention justice practices', () => {
    assert.ok(rawXml.includes('fines') && rawXml.includes('stocks'),
      'missing justice methods');
  });

  it('should note low literacy', () => {
    assert.ok(rawXml.toLowerCase().includes('cannot read') ||
      rawXml.toLowerCase().includes('literacy'),
      'missing literacy note');
  });

  it('should include Common as the shared language (NOT "trade language")', () => {
    assert.ok(rawXml.includes('Common'), 'missing Common language');
    // Common is NOT officially a "trade language" per the PHB
    assert.ok(!rawXml.includes('trade language'),
      'Common should not be called a "trade language" — that is not canon');
  });

  it('should list racial languages', () => {
    for (const lang of ['Dwarvish', 'Elvish']) {
      assert.ok(rawXml.includes(lang), `missing language: ${lang}`);
    }
  });
});

describe('worldKnowledge.xml — physical world facts', () => {
  it('should include travel pace on foot', () => {
    assert.ok(rawXml.includes('24 miles'), 'missing foot travel pace');
  });

  it('should include mount prices from PHB', () => {
    // PHB: riding horse 75gp, donkey/mule 8gp, pony 30gp, warhorse 400gp
    assert.ok(rawXml.includes('riding horse') && rawXml.includes('75gp'),
      'missing riding horse price');
    assert.ok(rawXml.includes('warhorse') && rawXml.includes('400gp'),
      'missing warhorse price');
  });

  it('should reference the Material Plane', () => {
    assert.ok(rawXml.includes('Material Plane'), 'missing Material Plane');
  });

  it('should reference the Feywild and Shadowfell', () => {
    assert.ok(rawXml.includes('Feywild'), 'missing Feywild');
    assert.ok(rawXml.includes('Shadowfell'), 'missing Shadowfell');
  });

  it('should NOT include detailed planar cosmology', () => {
    // A commoner wouldn't know about specific Outer Planes by name
    assert.ok(!rawXml.includes('Mount Celestia'), 'commoner wouldn\'t know Mount Celestia');
    assert.ok(!rawXml.includes('Mechanus'), 'commoner wouldn\'t know Mechanus');
    assert.ok(!rawXml.includes('Limbo'), 'commoner wouldn\'t know Limbo');
    assert.ok(!rawXml.includes('Elysium'), 'commoner wouldn\'t know Elysium');
  });
});

describe('worldKnowledge.xml — gods and afterlife facts (Basic Rules Appendix B)', () => {
  it('should affirm gods are real', () => {
    assert.ok(rawXml.includes('gods are real') || rawXml.includes('Gods are real'),
      'missing "gods are real" statement');
  });

  it('should include pragmatic polytheism examples', () => {
    // Validated from Basic Rules: "pray to Sune for luck in love, make an offering to Waukeen"
    assert.ok(rawXml.includes('Chauntea') && rawXml.includes('harvest'),
      'missing Chauntea/harvest example');
    assert.ok(rawXml.includes('Waukeen') && rawXml.includes('trade'),
      'missing Waukeen/trade example');
    assert.ok(rawXml.includes('Tymora') && rawXml.includes('luck'),
      'missing Tymora/luck example');
  });

  it('should include major Forgotten Realms deities', () => {
    const deities = ['Tyr', 'Helm', 'Mystra', 'Tempus', 'Kelemvor', 'Selûne', 'Bane', 'Shar'];
    for (const deity of deities) {
      assert.ok(rawXml.includes(deity), `missing deity: ${deity}`);
    }
  });

  it('should include evil deities that are feared', () => {
    const evil = ['Bane', 'Shar', 'Cyric', 'Talos'];
    for (const deity of evil) {
      assert.ok(rawXml.includes(deity), `missing evil deity: ${deity}`);
    }
  });

  it('should include nonhuman patron deities', () => {
    assert.ok(rawXml.includes('Moradin'), 'missing Moradin (dwarves)');
    assert.ok(rawXml.includes('Corellon'), 'missing Corellon (elves)');
    assert.ok(rawXml.includes('Yondalla'), 'missing Yondalla (halflings)');
    assert.ok(rawXml.includes('Gruumsh'), 'missing Gruumsh (orcs)');
  });

  it('should NOT include alignment codes (a commoner thinks "good god" not "LG")', () => {
    // Alignment codes are game mechanics, not commoner knowledge
    const alignmentPattern = /\b[LNC][GNE]\b/;
    assert.ok(!alignmentPattern.test(rawXml),
      'should not contain alignment codes like LG, LE, CE — commoners don\'t think in those terms');
  });

  it('should mention resurrection is possible but costly', () => {
    assert.ok(rawXml.toLowerCase().includes('resurrection'),
      'missing resurrection reference');
    assert.ok(rawXml.includes('diamond'), 'missing diamond cost for resurrection');
  });
});

describe('worldKnowledge.xml — magic facts', () => {
  it('should describe magic as rare for commoners', () => {
    assert.ok(rawXml.includes('rare'), 'missing rarity note');
  });

  it('should mention the Weave and Mystra', () => {
    assert.ok(rawXml.includes('Weave'), 'missing Weave reference');
    assert.ok(rawXml.includes('Mystra'), 'missing Mystra reference');
  });

  it('should mention caster types a commoner would recognize', () => {
    assert.ok(rawXml.toLowerCase().includes('cleric'), 'missing cleric');
    assert.ok(rawXml.toLowerCase().includes('wizard'), 'missing wizard');
    assert.ok(rawXml.toLowerCase().includes('druid'), 'missing druid');
  });

  it('should NOT list the 8 schools of magic (commoners wouldn\'t know them)', () => {
    const schools = ['abjuration', 'conjuration', 'divination', 'enchantment',
      'evocation', 'illusion', 'necromancy', 'transmutation'];
    for (const school of schools) {
      assert.ok(!rawXml.toLowerCase().includes(school),
        `commoner wouldn't know the school: ${school}`);
    }
  });

  it('should include spellcasting service costs from PHB', () => {
    // PHB: "10 to 50 gold pieces" for 1st/2nd level spells
    assert.ok(rawXml.includes('10 to 50'), 'missing spellcasting service cost range');
  });

  it('should include potion of healing price', () => {
    assert.ok(rawXml.includes('50gp') && rawXml.toLowerCase().includes('potion'),
      'missing potion of healing price (50gp)');
  });
});

describe('worldKnowledge.xml — peoples facts (PHB Ch.2)', () => {
  it('should include all PHB playable races', () => {
    const races = ['Human', 'Dwarves', 'Elves', 'Halfling', 'Gnome',
      'Half-elves', 'Half-orcs', 'Dragonborn', 'Tiefling'];
    for (const race of races) {
      assert.ok(rawXml.includes(race), `missing race: ${race}`);
    }
  });

  it('should include correct lifespans from PHB', () => {
    assert.ok(rawXml.includes('350 years'), 'missing dwarf lifespan (~350)');
    assert.ok(rawXml.includes('700 years'), 'missing elf lifespan (700+)');
    assert.ok(rawXml.includes('150 years'), 'missing halfling lifespan (~150)');
    assert.ok(rawXml.includes('180 years'), 'missing half-elf lifespan (~180)');
  });

  it('should mention elf trance', () => {
    assert.ok(rawXml.includes('four hours') && rawXml.toLowerCase().includes('meditate'),
      'missing elf trance (4h meditation)');
  });

  it('should mention elf subraces at overview level', () => {
    assert.ok(rawXml.toLowerCase().includes('high elves') || rawXml.toLowerCase().includes('high elf'),
      'missing high elf mention');
    assert.ok(rawXml.toLowerCase().includes('wood elves') || rawXml.toLowerCase().includes('wood elf'),
      'missing wood elf mention');
    assert.ok(rawXml.toLowerCase().includes('drow'), 'missing drow mention');
  });

  it('should mention halfling bravery and luck', () => {
    assert.ok(rawXml.toLowerCase().includes('brave'), 'missing halfling bravery');
    assert.ok(rawXml.toLowerCase().includes('lucky'), 'missing halfling luck');
  });

  it('should mention dragonborn breath weapons', () => {
    assert.ok(rawXml.includes('breath weapon'), 'missing dragonborn breath weapon');
  });

  it('should mention tiefling fire resistance and mistrust', () => {
    assert.ok(rawXml.toLowerCase().includes('fire') && rawXml.toLowerCase().includes('tiefling'),
      'missing tiefling fire resistance');
    assert.ok(rawXml.toLowerCase().includes('mistrust'),
      'missing tiefling mistrust note');
  });
});

describe('worldKnowledge.xml — monsters and wilderness facts', () => {
  it('should include common threats a commoner would know', () => {
    const threats = ['goblin', 'kobold', 'bandit', 'orc', 'troll'];
    for (const threat of threats) {
      assert.ok(rawXml.toLowerCase().includes(threat), `missing common threat: ${threat}`);
    }
  });

  it('should include undead types commoners fear', () => {
    assert.ok(rawXml.toLowerCase().includes('skeleton'), 'missing skeletons');
    assert.ok(rawXml.toLowerCase().includes('zombie'), 'missing zombies');
    assert.ok(rawXml.toLowerCase().includes('vampire'), 'missing vampires');
  });

  it('should differentiate chromatic and metallic dragons', () => {
    assert.ok(rawXml.toLowerCase().includes('chromatic'), 'missing chromatic dragons');
    assert.ok(rawXml.toLowerCase().includes('metallic'), 'missing metallic dragons');
  });

  it('should list the 5 chromatic dragon colors', () => {
    for (const color of ['red', 'blue', 'green', 'black', 'white']) {
      assert.ok(rawXml.toLowerCase().includes(color), `missing chromatic color: ${color}`);
    }
  });

  it('should list the 5 metallic dragon types', () => {
    for (const metal of ['gold', 'silver', 'bronze', 'brass', 'copper']) {
      assert.ok(rawXml.toLowerCase().includes(metal), `missing metallic type: ${metal}`);
    }
  });

  it('should mention devils and demons as distinct', () => {
    assert.ok(rawXml.includes('Nine Hells'), 'missing Nine Hells');
    assert.ok(rawXml.includes('Abyss'), 'missing Abyss');
  });

  it('should NOT include exotic monsters commoners wouldn\'t know', () => {
    assert.ok(!rawXml.toLowerCase().includes('mind flayer'),
      'commoner wouldn\'t know mind flayers');
    assert.ok(!rawXml.toLowerCase().includes('beholder'),
      'commoner wouldn\'t know beholders');
  });

  it('should mention troll fire weakness', () => {
    assert.ok(rawXml.toLowerCase().includes('troll') && rawXml.toLowerCase().includes('burn'),
      'missing troll regeneration/fire weakness');
  });
});

describe('worldKnowledge.xml — well-formed XML', () => {
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

describe('worldKnowledge.xml — commoner perspective filter', () => {
  it('should NOT contain alignment codes', () => {
    // No LG, LE, CE, NG, NE, CG, CN, LN, TN
    const codes = rawXml.match(/\b[LNC][GNE]\b/g) || [];
    assert.equal(codes.length, 0,
      `found alignment codes: ${codes.join(', ')}`);
  });

  it('should NOT contain schools of magic', () => {
    assert.ok(!rawXml.toLowerCase().includes('abjuration'), 'remove schools of magic');
  });

  it('should NOT contain "trade language"', () => {
    assert.ok(!rawXml.toLowerCase().includes('trade language'),
      '"trade language" is not canon per PHB');
  });

  it('should NOT contain detailed outer plane names', () => {
    for (const plane of ['Mechanus', 'Arborea', 'Limbo', 'Elysium', 'Hades', 'Mount Celestia']) {
      assert.ok(!rawXml.includes(plane),
        `commoner wouldn't know the plane: ${plane}`);
    }
  });

  it('should NOT reference the Fugue Plane by name', () => {
    assert.ok(!rawXml.includes('Fugue'),
      'Fugue Plane is too specific for commoner knowledge');
  });

  it('should NOT reference the Wall of the Faithless by name', () => {
    assert.ok(!rawXml.includes('Wall of the Faithless'),
      'Wall of the Faithless is too specific for commoner knowledge');
  });

  it('should NOT contain the giant ordning by name', () => {
    assert.ok(!rawXml.includes('ordning'),
      'the giant caste system name is not commoner knowledge');
  });
});
