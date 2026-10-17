import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseExcludedUsernames, excludedUsernamesClause } from '../../src/lib/exclusions.js';
import { parseStockExclusions } from '../../src/lib/gacha.js';

describe('exclusions akun khusus (stok & klasemen kolektor)', () => {
  it('parseExcludedUsernames: trim, lowercase, buang kosong; default yogaa', () => {
    assert.deepEqual(parseExcludedUsernames('Yogaa, MinnzCloud ,, '), ['yogaa', 'minnzcloud']);
    assert.deepEqual(parseExcludedUsernames(''), []);
    const prev = process.env.STOCK_EXCLUDE_USERNAMES;
    delete process.env.STOCK_EXCLUDE_USERNAMES;
    assert.deepEqual(parseExcludedUsernames(), ['yogaa']);
    if (prev === undefined) delete process.env.STOCK_EXCLUDE_USERNAMES;
    else process.env.STOCK_EXCLUDE_USERNAMES = prev;
  });

  it('parseStockExclusions di gacha.js tetap jalan (re-export nama lama)', () => {
    assert.equal(parseStockExclusions, parseExcludedUsernames);
    assert.deepEqual(parseStockExclusions('Yogaa, Admin,,'), ['yogaa', 'admin']);
  });

  it('excludedUsernamesClause: WHERE/AND, kolom custom, kosong tanpa filter', () => {
    const w = excludedUsernamesClause(['yogaa', 'minnzcloud']);
    assert.equal(w.sql, ' WHERE LOWER(username) NOT IN (?,?)');
    assert.deepEqual(w.args, ['yogaa', 'minnzcloud']);

    const a = excludedUsernamesClause(['yogaa'], 's.username', 'AND');
    assert.equal(a.sql, ' AND LOWER(s.username) NOT IN (?)');
    assert.deepEqual(a.args, ['yogaa']);

    assert.deepEqual(excludedUsernamesClause([]), { sql: '', args: [] });
  });
});
