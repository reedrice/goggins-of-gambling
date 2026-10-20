#!/usr/bin/env node
/**
 * scripts/our-chance.mjs — fill "Our chance" on picks (HANDOFF §56).
 *   node scripts/our-chance.mjs [file=data/picks.json] [--dry-run]
 * Uses the SAME blend as the site (js/our-chance.js): ESPN history + no-vig Vegas
 * (data/vegas-lines.json + vegas-manual.json) + the Polymarket price. For every pick / leg
 * with a market_id it writes:
 *   our_chance (0-100), market_chance (the price), our_chance_why ("History 7 of 10 · ...")
 * and sets hit_prob = our_chance (singles) or the product of the legs' our_chance
 * (multi-leg, different games only). Logged to pick-history by capture-closing for
 * calibration (scripts/learn.mjs). Network failures leave a pick unchanged.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
const read = f => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { return null; } };

export async function applyOurChance(doc) {
  globalThis.Vegas = req(path.join(ROOT, 'js/vegas.js'));
  globalThis.Vegas.set([read('data/vegas-lines.json'), read('data/vegas-manual.json')].filter(Boolean));
  globalThis.Viz = req(path.join(ROOT, 'js/viz.js'));
  const OC = req(path.join(ROOT, 'js/our-chance.js'));
  let n = 0;
  const one = async (l, pk) => {
    if (!l.market_id || !(l.price > 0 && l.price < 100)) return null;
    const r = await OC.estimate({ marketId: l.market_id, side: l.market_side || 'yes', market: l.price, text: l.side || l.desc || pk.side, player: l.player || null }).catch(() => null);
    if (!r) return null;
    l.our_chance = r.pct; l.market_chance = Math.round(l.price); l.our_chance_why = r.line; n++;
    return r.pct;
  };
  for (const list of Object.values(doc.sections || {})) for (const pk of Array.isArray(list) ? list : []) {
    if (Array.isArray(pk.legs) && pk.legs.length) {
      const ps = []; for (const l of pk.legs) ps.push(await one(l, pk));
      if (ps.every(p => p != null) && pk.same_game !== true) pk.hit_prob = Math.round(ps.reduce((a, p) => a * p / 100, 1) * 1000) / 10;
    } else if (await one(pk, pk) != null) pk.hit_prob = pk.our_chance;
  }
  return n;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(ROOT, 'data/picks.json'));
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const n = await applyOurChance(d);
  if (!process.argv.includes('--dry-run')) fs.writeFileSync(file, JSON.stringify(d, null, 2) + '\n');
  console.log(`Our chance set on ${n} pick(s)/leg(s) in ${path.relative(ROOT, file)}${process.argv.includes('--dry-run') ? ' (dry run)' : ''}.`);
  process.exit(0);
}
