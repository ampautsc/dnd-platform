/**
 * Build Calculator Engine
 * 
 * Computes all derived stats from: baseStats + speciesAsi + levelChoices + items + species
 * 
 * The build MUST be populated (species, levelChoices.feat, items) before calling.
 * Returns an object with all computed fields the frontend expects.
 */

export function mod(score) {
  return Math.floor((score - 10) / 2);
}

export function proficiencyBonus(level) {
  return Math.ceil(level / 4) + 1;
}

/**
 * Compute all derived stats for a build.
 * @param {Object} build - Mongoose document (populated) or plain object
 * @returns {Object} computed stats
 */
export function computeBuildStats(build) {
  const base = build.baseStats || { str: 8, dex: 14, con: 14, int: 8, wis: 12, cha: 16 };
  const level = build.level || 8;
  const species = build.species || {};
  const items = build.items || [];

  // â”€â”€ 1. Final Ability Scores â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const finalStats = {
    str: base.str || 8,
    dex: base.dex || 14,
    con: base.con || 14,
    int: base.int || 8,
    wis: base.wis || 12,
    cha: base.cha || 16
  };

  // Apply species ASI choices
  for (const asi of (build.speciesAsi || [])) {
    const stat = asi.stat.toLowerCase();
    finalStats[stat] = Math.min(20, finalStats[stat] + asi.bonus);
  }

  // Apply level choices (feats + ASIs)
  const feats = []; // populated feat documents
  const levelChoices = (build.levelChoices || []).slice().sort((a, b) => a.level - b.level);

  for (const choice of levelChoices) {
    if (choice.type === 'feat' && choice.feat) {
      const feat = choice.feat;
      feats.push(feat);
      // Half-feat stat bonus
      if (feat.isHalfFeat && choice.halfFeatStat) {
        const stat = choice.halfFeatStat.toLowerCase();
        finalStats[stat] = Math.min(20, finalStats[stat] + 1);
      }
    } else if (choice.type === 'asi' && choice.asiIncreases) {
      for (const inc of choice.asiIncreases) {
        const stat = inc.stat.toLowerCase();
        finalStats[stat] = Math.min(20, finalStats[stat] + inc.bonus);
      }
    }
  }

  // â”€â”€ 2. Modifiers & Proficiency â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const chaMod = mod(finalStats.cha);
  const dexMod = mod(finalStats.dex);
  const conMod = mod(finalStats.con);
  const profBonus = proficiencyBonus(level);

  // â”€â”€ 3. Spell DC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let spellDcBonus = 0;
  for (const item of items) {
    if (item.spellDcBonus) spellDcBonus += item.spellDcBonus;
  }
  const spellDc = 8 + profBonus + chaMod + spellDcBonus;

  // â”€â”€ 4. Armor Class â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const armorFeat = feats.find(f => f.grantsArmorProficiency);
  const hasArmorProf = !!armorFeat;
  const hasBracers = items.some(i => i.name === 'Bracers of Defense');
  const naturalAC = species.naturalArmorAC;

  let finalAc;

  if (hasArmorProf) {
    // Medium armor (half plate) + shield
    finalAc = 15 + Math.min(dexMod, 2) + 2;
    // Note: Can't use Bracers with armor
  } else if (naturalAC) {
    // Species natural armor
    if (species.name === 'Tortle') {
      finalAc = 17; // Tortle: flat 17, DEX doesn't apply
    } else {
      finalAc = naturalAC + dexMod;
    }
    // Bracers of Defense work with natural armor (not wearing armor)
    if (hasBracers) finalAc += 2;
  } else {
    // No armor feat, no natural armor
    if (hasBracers) {
      // Bracers of Defense require NO armor â€” intentionally unarmored
      finalAc = 10 + dexMod + 2;
    } else {
      // Bard has light armor proficiency â†’ leather armor (AC 11 + DEX)
      finalAc = 11 + dexMod;
    }
  }

  // Item AC bonuses (Cloak of Protection, etc.)
  for (const item of items) {
    if (item.name !== 'Bracers of Defense' && item.acBonus) {
      finalAc += item.acBonus;
    }
  }

  // â”€â”€ 5. CON Saves & Concentration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const hasWarCaster = feats.some(f => f.grantsAdvConSaves);
  const hasResilientCon = feats.some(f => f.grantsProfConSaves);

  let conSaveBonus = conMod;
  if (hasResilientCon) conSaveBonus += profBonus;
  for (const item of items) {
    if (item.saveBonus) conSaveBonus += item.saveBonus;
  }

  let conSaveType = 'none';
  if (hasWarCaster && hasResilientCon) conSaveType = 'both';
  else if (hasWarCaster) conSaveType = 'advantage';
  else if (hasResilientCon) conSaveType = 'proficiency';

  // Concentration hold % against DC 10
  const needed = Math.max(1, 10 - conSaveBonus);
  const failChance = Math.max(0, Math.min(1, (needed - 1) / 20));
  let concentrationHoldPct;
  if (hasWarCaster) {
    // Round to 1 decimal to avoid displaying misleading 100%
    concentrationHoldPct = Math.round((1 - failChance * failChance) * 1000) / 10;
  } else {
    concentrationHoldPct = Math.round((1 - failChance) * 1000) / 10;
  }
  concentrationHoldPct = Math.min(99.9, concentrationHoldPct);

  // â”€â”€ 6. Feat Progression Text â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const featProgression = levelChoices
    .map(c => {
      if (c.type === 'feat' && c.feat) {
        const name = c.feat.name || 'Unknown Feat';
        const statNote = c.halfFeatStat ? ` +1 ${c.halfFeatStat}` : '';
        return `Lv${c.level}: ${name}${statNote}`;
      } else if (c.type === 'asi') {
        const desc = (c.asiIncreases || []).map(i => `${i.stat} +${i.bonus}`).join(', ');
        return `Lv${c.level}: ASI (${desc})`;
      }
      return `Lv${c.level}: ???`;
    })
    .join(' â†’ ');

  // â”€â”€ 7. Overall Score â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const r = build.ratings || {};
  const overallScore = Math.round(
    ((r.combat || 0) + (r.social || 0) + (r.fun || 0) + (r.durability || 0)) / 4 * 10
  ) / 10;

  return {
    // Ability scores
    stats: { ...finalStats },
    finalStats: { ...finalStats },
    finalCha: finalStats.cha,

    // Core combat stats
    spellDc,
    finalAc,
    proficiencyBonus: profBonus,

    // Concentration
    conSaveBonus,
    conSaveType,
    concentrationHoldPct,

    // Modifiers
    chaMod,
    dexMod,
    conMod,

    // Derived text
    featProgression,

    // Extracted feats (for frontend display)
    feats,

    // Rating
    overallScore,
  };
}

