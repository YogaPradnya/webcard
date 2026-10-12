import { createClient } from '@libsql/client';
import { WAIFU_POOL } from '../src/data/waifuPool.js';
import { genCardStats } from '../src/lib/battleStats.js';

// Seed tabel card_battle_stats dari generator deterministik (aman diulang: REPLACE).
const db = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

await db.execute(`
  CREATE TABLE IF NOT EXISTS card_battle_stats (
    char_name TEXT PRIMARY KEY,
    tier TEXT NOT NULL DEFAULT 'Common',
    role TEXT NOT NULL DEFAULT 'Damage',
    hp INTEGER NOT NULL DEFAULT 60,
    basic_dmg INTEGER NOT NULL DEFAULT 10,
    skill_name TEXT NOT NULL DEFAULT '',
    skill_dmg INTEGER NOT NULL DEFAULT 20,
    cons_cost INTEGER NOT NULL DEFAULT 3,
    skill_effect TEXT NOT NULL DEFAULT 'none',
    skill_effect_val INTEGER NOT NULL DEFAULT 0,
    skill2_name TEXT NOT NULL DEFAULT '',
    skill2_dmg INTEGER NOT NULL DEFAULT 0,
    skill2_cons INTEGER NOT NULL DEFAULT 0,
    skill2_effect TEXT NOT NULL DEFAULT 'none',
    skill2_effect_val INTEGER NOT NULL DEFAULT 0
  )
`);
try { await db.execute('ALTER TABLE card_battle_stats ADD COLUMN skill_effect TEXT NOT NULL DEFAULT \'none\''); } catch {}
try { await db.execute('ALTER TABLE card_battle_stats ADD COLUMN skill_effect_val INTEGER NOT NULL DEFAULT 0'); } catch {}
try { await db.execute('ALTER TABLE card_battle_stats ADD COLUMN skill2_name TEXT NOT NULL DEFAULT \'\''); } catch {}
try { await db.execute('ALTER TABLE card_battle_stats ADD COLUMN skill2_dmg INTEGER NOT NULL DEFAULT 0'); } catch {}
try { await db.execute('ALTER TABLE card_battle_stats ADD COLUMN skill2_cons INTEGER NOT NULL DEFAULT 0'); } catch {}
try { await db.execute('ALTER TABLE card_battle_stats ADD COLUMN skill2_effect TEXT NOT NULL DEFAULT \'none\''); } catch {}
try { await db.execute('ALTER TABLE card_battle_stats ADD COLUMN skill2_effect_val INTEGER NOT NULL DEFAULT 0'); } catch {}

const counts = {};
for (const entry of WAIFU_POOL) {
  const s = genCardStats(entry);
  counts[s.role] = (counts[s.role] || 0) + 1;
  await db.execute({
    sql: `INSERT INTO card_battle_stats (char_name, tier, role, hp, basic_dmg, skill_name, skill_dmg, cons_cost, skill_effect, skill_effect_val, skill2_name, skill2_dmg, skill2_cons, skill2_effect, skill2_effect_val)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(char_name) DO UPDATE SET tier = excluded.tier, role = excluded.role,
          hp = excluded.hp, basic_dmg = excluded.basic_dmg, skill_name = excluded.skill_name,
          skill_dmg = excluded.skill_dmg, cons_cost = excluded.cons_cost,
          skill_effect = excluded.skill_effect, skill_effect_val = excluded.skill_effect_val,
          skill2_name = excluded.skill2_name, skill2_dmg = excluded.skill2_dmg,
          skill2_cons = excluded.skill2_cons, skill2_effect = excluded.skill2_effect,
          skill2_effect_val = excluded.skill2_effect_val`,
    args: [s.name, s.tier, s.role, s.hp, s.basic, s.skillName, s.skill, s.cons, s.effect, s.effectVal, s.skill2Name, s.skill2, s.cons2, s.effect2, s.effectVal2],
  });
}
console.log(`seed battle stats OK: ${WAIFU_POOL.length} kartu`, counts);
