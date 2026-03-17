/**
 * Content Proxy Routes — thin REST wrappers over @dnd-platform/content
 * 
 * GET /api/content/spells       — all spells
 * GET /api/content/spells/:id   — single spell
 * GET /api/content/creatures    — all creatures
 * GET /api/content/creatures/:key — single creature by templateKey
 * GET /api/content/items        — all items
 * GET /api/content/items/:id    — single item
 * GET /api/content/species      — all species
 * GET /api/content/species/:id  — single species
 */
import { Router } from 'express';
import { SPELLS, getSpell } from '@dnd-platform/content/spells';
import { getCreature, listCreatures, createCreature } from '@dnd-platform/content/creatures';
import { getAllItems, getItem } from '@dnd-platform/content/items';
import { getSpecies, getAllSpeciesSlugs } from '@dnd-platform/content/species';

export function createContentRoutes() {
  const router = Router();

  // Spells
  router.get('/spells', (_req, res) => {
    res.json({ spells: Object.values(SPELLS) });
  });

  router.get('/spells/:id', (req, res) => {
    try {
      const spell = getSpell(req.params.id);
      res.json({ spell });
    } catch {
      return res.status(404).json({ error: 'Spell not found' });
    }
  });

  // Creatures
  router.get('/creatures', (_req, res) => {
    const keys = listCreatures();
    const creatures = keys.map(k => getCreature(k)).filter(Boolean);
    res.json({ creatures });
  });

  router.get('/creatures/:key', (req, res) => {
    const creature = getCreature(req.params.key);
    if (!creature) return res.status(404).json({ error: 'Creature not found' });
    res.json({ creature });
  });

  // Items
  router.get('/items', (_req, res) => {
    res.json({ items: getAllItems() });
  });

  router.get('/items/:id', (req, res) => {
    const item = getItem(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json({ item });
  });

  // Species
  router.get('/species', (_req, res) => {
    const slugs = getAllSpeciesSlugs();
    const allSpecies = slugs.map(s => getSpecies(s)).filter(Boolean);
    res.json({ species: allSpecies });
  });

  router.get('/species/:id', (req, res) => {
    const species = getSpecies(req.params.id);
    if (!species) return res.status(404).json({ error: 'Species not found' });
    res.json({ species });
  });

  return router;
}
