import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

/**
 * Tries to break every security rule in the schema, on a real Postgres running in-process.
 * Each test acts as a signed-in user exactly the way Supabase's API does: the `authenticated`
 * role, with the user's id in the request's JWT claims.
 */
const here = new URL('.', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, here), 'utf8');

const ASHA = '00000000-0000-4000-8000-00000000000a';
const BEN = '00000000-0000-4000-8000-00000000000b';
const CARA = '00000000-0000-4000-8000-00000000000c';
const TRIP = '10000000-0000-4000-8000-000000000001';
const ASHA_MEMBER = '20000000-0000-4000-8000-00000000000a';
const PRIYA_MEMBER = '20000000-0000-4000-8000-00000000000d';
const PLACE = '30000000-0000-4000-8000-000000000001';
const EXPENSE = '40000000-0000-4000-8000-000000000001';
const STOP = '50000000-0000-4000-8000-000000000001';
const VAULT = '60000000-0000-4000-8000-000000000001';
const SPOT = '70000000-0000-4000-8000-000000000001';

type Row = Record<string, unknown>;
type Role = 'authenticated' | 'anon' | 'service_role';
let db: PGlite;

/** Runs one statement as a signed-in user (or as `anon` / the server) and always switches back. */
async function as(user: string | null, sql: string, params: unknown[] = [], role: Role = 'authenticated') {
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    user ? JSON.stringify({ sub: user }) : '',
  ]);
  await db.exec(`set role ${role}`);
  try {
    const result = await db.query<Row>(sql, params);
    return { rows: result.rows, count: result.affectedRows ?? 0 };
  } finally {
    await db.exec('reset role');
  }
}
const asServer = (sql: string, params: unknown[] = []) => as(null, sql, params, 'service_role');
/** Supabase's own auth service, which is what creates and deletes accounts. */
const asAuthService = (sql: string, params: unknown[] = []) => db.query<Row>(sql, params);

/** The statement must be refused outright (a privilege or a `with check`), not silently skipped. */
async function refused(run: Promise<unknown>, pattern: RegExp) {
  await assert.rejects(run, pattern);
}

const payers = (id: string, amount: number) => JSON.stringify([{ memberId: id, amountMinor: amount }]);

before(async () => {
  db = new PGlite();
  await db.exec(read('./supabase-shim.sql'));
  for (const file of readdirSync(new URL('../migrations/', here)).sort()) {
    await db.exec(read(`../migrations/${file}`));
  }
  await db.exec(`insert into auth.users (id) values ('${ASHA}'), ('${BEN}'), ('${CARA}')`);

  // Asha saves a place, plans a trip, adds herself and a friend by name, a stop and a cost.
  await as(
    ASHA,
    `insert into places (id, name, category, lat, lng, source_platform, country_code)
     values ($1, 'Fontainhas', 'sight', 15.49, 73.83, 'instagram', 'IN')`,
    [PLACE],
  );
  await as(
    ASHA,
    `insert into trips (id, name, city, day_count, currency) values ($1, 'Goa', 'Goa', 3, 'INR')`,
    [TRIP],
  );
  await as(ASHA, `insert into trip_members (id, trip_id, name, user_id) values ($1, $2, 'Asha', $3)`, [
    ASHA_MEMBER,
    TRIP,
    ASHA,
  ]);
  await as(ASHA, `insert into trip_members (id, trip_id, name) values ($1, $2, 'Priya')`, [
    PRIYA_MEMBER,
    TRIP,
  ]);
  await as(
    ASHA,
    `insert into trip_stops (id, trip_id, day, name, category, lat, lng) values ($1, $2, 1, 'Fontainhas', 'sight', 15.49, 73.83)`,
    [STOP, TRIP],
  );
  await as(
    ASHA,
    `insert into expenses (id, trip_id, title, category, spent_on, amount_minor, payers, split_mode, shares)
     values ($1, $2, 'Scooters', 'transport', '2026-12-01', 90000, $3, 'equal', $4)`,
    [
      EXPENSE,
      TRIP,
      payers(ASHA_MEMBER, 90000),
      JSON.stringify([
        { memberId: ASHA_MEMBER, amountMinor: 45000 },
        { memberId: PRIYA_MEMBER, amountMinor: 45000 },
      ]),
    ],
  );
});

describe('accounts', () => {
  it('gives every new account a profile', async () => {
    const { rows } = await asServer('select id from profiles order by id');
    assert.deepEqual(
      rows.map((r) => r.id),
      [ASHA, BEN, CARA],
    );
  });

  it('lets you read and rename only yourself', async () => {
    assert.equal((await as(ASHA, `update profiles set display_name = 'Asha'`)).count, 1);
    assert.deepEqual((await as(BEN, 'select id from profiles')).rows, [{ id: BEN }]);
  });

  it('keeps signed-out visitors out of every table', async () => {
    for (const table of [
      'profiles',
      'places',
      'vaults',
      'vault_members',
      'vault_spots',
      'trips',
      'trip_members',
      'trip_stops',
      'expenses',
      'settlements',
      'entitlements',
      'ai_usage',
    ]) {
      await refused(as(null, `select * from ${table}`, [], 'anon'), /permission denied/);
    }
    await refused(as(null, `select join_trip(gen_random_uuid())`, [], 'anon'), /permission denied/);
  });
});

describe('saved places', () => {
  it('are visible to their owner only', async () => {
    assert.equal((await as(ASHA, 'select id from places')).rows.length, 1);
    assert.equal((await as(BEN, 'select id from places')).rows.length, 0);
  });

  it('cannot be changed or deleted by anyone else', async () => {
    assert.equal((await as(BEN, `update places set name = 'Mine now'`)).count, 0);
    assert.equal((await as(BEN, 'delete from places')).count, 0);
    assert.equal((await asServer('select name from places')).rows[0].name, 'Fontainhas');
  });

  it('cannot be saved into, or handed to, another account', async () => {
    await refused(
      as(
        BEN,
        `insert into places (id, user_id, name, category, lat, lng, source_platform)
         values (gen_random_uuid(), $1, 'Planted', 'food', 0, 0, 'manual')`,
        [ASHA],
      ),
      /row-level security/,
    );
    await refused(as(ASHA, `update places set user_id = $1`, [BEN]), /permission denied/);
  });

  it('get their update time from the database, not the phone', async () => {
    await refused(as(ASHA, `update places set updated_at = '2001-01-01'`), /permission denied/);
    await as(ASHA, `update places set note = 'Go at sunset'`);
    const { rows } = await asServer(`select updated_at > now() - interval '1 minute' as fresh from places`);
    assert.equal(rows[0].fresh, true);
  });
});

describe('vaults', () => {
  it('are visible to, and changeable by, their owner only', async () => {
    await as(ASHA, `insert into vaults (id, name, emoji, place_ids) values ($1, 'Cafés to try', '☕', $2)`, [
      VAULT,
      [PLACE],
    ]);
    assert.equal((await as(ASHA, 'select id from vaults')).rows.length, 1);
    assert.equal((await as(BEN, 'select id from vaults')).rows.length, 0);
    assert.equal((await as(BEN, `update vaults set name = 'Mine now'`)).count, 0);
    assert.equal((await as(BEN, 'delete from vaults')).count, 0);
    assert.equal((await as(ASHA, `update vaults set name = 'Coffee'`)).count, 1);
  });

  it('cannot be made for, or handed to, another account', async () => {
    await refused(
      as(BEN, `insert into vaults (id, user_id, name) values (gen_random_uuid(), $1, 'Planted')`, [ASHA]),
      /row-level security/,
    );
    await refused(as(ASHA, `update vaults set user_id = $1`, [BEN]), /permission denied/);
    await refused(as(ASHA, `update vaults set updated_at = '2001-01-01'`), /permission denied/);
  });

  it('lets you like your own places', async () => {
    assert.equal((await as(ASHA, `update places set liked_at = now()`)).count, 1);
  });
});

describe('a shared vault', () => {
  const spot = (by: string, id = 'gen_random_uuid()') =>
    as(
      by,
      `insert into vault_spots (id, vault_id, name, category, lat, lng) values (${id}, $1, 'Artjuna', 'cafe', 15.6, 73.7)`,
      [VAULT],
    );
  const token = async () =>
    (await as(ASHA, 'select invite_token from vaults where id = $1', [VAULT])).rows[0].invite_token;

  it('is invisible, with its spots, to someone without the link', async () => {
    await spot(ASHA, `'${SPOT}'`);
    assert.equal((await as(BEN, 'select id from vaults')).rows.length, 0);
    assert.equal((await as(BEN, 'select id from vault_spots')).rows.length, 0);
    await refused(spot(BEN), /row-level security/);
  });

  it('cannot be joined with a made-up token, or while signed out', async () => {
    await refused(as(BEN, 'select join_vault(gen_random_uuid())'), /no longer valid/);
    await refused(as(null, 'select join_vault($1)', [await token()], 'anon'), /permission denied/);
    await refused(as(BEN, `insert into vault_members (vault_id) values ($1)`, [VAULT]), /permission denied/);
  });

  it('lets someone with the link in, to read it and add spots as themselves', async () => {
    const t = await token();
    assert.equal((await as(BEN, 'select join_vault($1) as id', [t])).rows[0].id, VAULT);
    assert.equal(
      (await as(BEN, 'select join_vault($1) as id', [t])).rows[0].id,
      VAULT,
      'joining twice is fine',
    );
    assert.equal((await as(BEN, 'select name from vaults')).rows[0].name, 'Coffee');
    assert.equal((await as(BEN, 'select id from vault_spots')).rows.length, 1);
    await spot(BEN);
    await refused(
      as(
        BEN,
        `insert into vault_spots (id, vault_id, name, category, lat, lng, added_by)
         values (gen_random_uuid(), $1, 'Framed', 'cafe', 0, 0, $2)`,
        [VAULT, ASHA],
      ),
      /row-level security/,
    );
    // The owner's own saved places stay private.
    assert.equal((await as(BEN, 'select id from places')).rows.length, 0);
  });

  it('lets people in it take spots out, but not rename, move or re-key anything', async () => {
    assert.equal((await as(BEN, `update vault_spots set deleted_at = now() where id = $1`, [SPOT])).count, 1);
    await refused(as(BEN, `update vault_spots set name = 'Renamed'`), /permission denied/);
    await refused(as(BEN, `update vault_spots set vault_id = gen_random_uuid()`), /permission denied/);
    assert.equal((await as(BEN, `update vaults set name = 'Mine now'`)).count, 0);
    assert.equal((await as(BEN, `update vaults set invite_token = gen_random_uuid()`)).count, 0);
    assert.equal((await as(BEN, 'delete from vaults')).count, 0);
  });

  it('keeps out someone who left, and the owner can remove people and cancel the link', async () => {
    assert.equal((await as(BEN, 'delete from vault_members where user_id = $1', [BEN])).count, 1);
    assert.equal((await as(BEN, 'select id from vault_spots')).rows.length, 0);
    await as(CARA, 'select join_vault($1)', [await token()]);
    assert.equal((await as(ASHA, 'delete from vault_members where user_id = $1', [CARA])).count, 1);
    const old = await token();
    await as(ASHA, 'update vaults set invite_token = gen_random_uuid() where id = $1', [VAULT]);
    await refused(as(CARA, 'select join_vault($1)', [old]), /no longer valid/);
  });
});

describe('a trip, to someone who is not on it', () => {
  it('does not exist', async () => {
    for (const table of ['trips', 'trip_members', 'trip_stops', 'expenses', 'settlements']) {
      assert.equal((await as(BEN, `select * from ${table}`)).rows.length, 0, table);
    }
  });

  it('cannot be written to', async () => {
    await refused(
      as(
        BEN,
        `insert into trip_stops (id, trip_id, day, name, category, lat, lng) values (gen_random_uuid(), $1, 1, 'X', 'food', 0, 0)`,
        [TRIP],
      ),
      /row-level security/,
    );
    await refused(
      as(
        BEN,
        `insert into expenses (id, trip_id, title, category, spent_on, amount_minor, payers, split_mode, shares)
               values (gen_random_uuid(), $1, 'Fake', 'food', '2026-12-01', 100, $2, 'equal', $2)`,
        [TRIP, payers(ASHA_MEMBER, 100)],
      ),
      /row-level security/,
    );
    assert.equal((await as(BEN, `update expenses set title = 'Hacked'`)).count, 0);
    assert.equal((await as(BEN, `delete from trip_stops`)).count, 0);
    assert.equal((await as(BEN, `update trips set name = 'Hacked'`)).count, 0);
  });

  it('cannot be joined by adding yourself', async () => {
    await refused(
      as(
        BEN,
        `insert into trip_members (id, trip_id, name, user_id) values (gen_random_uuid(), $1, 'Ben', $2)`,
        [TRIP, BEN],
      ),
      /row-level security/,
    );
    assert.equal((await as(BEN, `update trip_members set user_id = $1`, [BEN])).count, 0);
  });

  it('cannot be joined with a guessed token', async () => {
    await refused(as(BEN, `select join_trip(gen_random_uuid())`), /no longer valid/);
  });
});

describe('joining with the invite link', () => {
  it('lets Ben claim nothing he was not offered, and join as himself', async () => {
    const { rows } = await asServer('select invite_token from trips where id = $1', [TRIP]);
    const joined = await as(BEN, 'select join_trip($1) as trip', [rows[0].invite_token]);
    assert.equal(joined.rows[0].trip, TRIP);
    // Tapping the link again changes nothing.
    await as(BEN, 'select join_trip($1)', [rows[0].invite_token]);
    const members = await as(BEN, 'select name, user_id from trip_members order by name');
    assert.equal(members.rows.length, 3);
    assert.equal(members.rows.filter((m) => m.user_id === BEN).length, 1);
  });

  it('lets Cara take over the name the organiser added for her', async () => {
    const { rows } = await asServer('select invite_token from trips where id = $1', [TRIP]);
    await as(CARA, 'select join_trip($1, $2)', [rows[0].invite_token, PRIYA_MEMBER]);
    const mine = await as(CARA, 'select id from trip_members where user_id = $1', [CARA]);
    assert.deepEqual(mine.rows, [{ id: PRIYA_MEMBER }]);
  });

  it('then shows the whole trip, and fellow travellers’ names', async () => {
    assert.equal((await as(BEN, 'select id from trips')).rows.length, 1);
    assert.equal((await as(BEN, 'select id from trip_stops')).rows.length, 1);
    assert.equal((await as(BEN, 'select id from expenses')).rows.length, 1);
    assert.equal((await as(BEN, 'select id from profiles')).rows.length, 3);
    // Sharing a trip shares the trip, not the vault.
    assert.equal((await as(BEN, 'select id from places')).rows.length, 0);
  });
});

describe('someone on a trip', () => {
  it('can add stops and costs', async () => {
    await as(
      BEN,
      `insert into trip_stops (id, trip_id, day, name, category, lat, lng) values (gen_random_uuid(), $1, 2, 'Anjuna', 'nature', 15.57, 73.74)`,
      [TRIP],
    );
    assert.equal((await as(ASHA, 'select id from trip_stops')).rows.length, 2);
    assert.equal((await as(BEN, `update expenses set title = 'Scooter hire'`)).count, 1);
  });

  it('cannot add a third person’s account, only a name or themselves', async () => {
    const outsider = '00000000-0000-4000-8000-0000000000ff';
    await asAuthService(`insert into auth.users (id) values ($1)`, [outsider]);
    await refused(
      as(
        BEN,
        `insert into trip_members (id, trip_id, name, user_id) values (gen_random_uuid(), $1, 'Dragged in', $2)`,
        [TRIP, outsider],
      ),
      /row-level security/,
    );
    assert.equal(
      (
        await as(BEN, `insert into trip_members (id, trip_id, name) values (gen_random_uuid(), $1, 'Dev')`, [
          TRIP,
        ])
      ).count,
      1,
    );
  });

  it('cannot rename, unlink or remove another account’s membership', async () => {
    assert.equal(
      (await as(BEN, `update trip_members set name = 'Boss' where user_id = $1`, [ASHA])).count,
      0,
    );
    assert.equal(
      (await as(BEN, `update trip_members set deleted_at = now() where user_id = $1`, [CARA])).count,
      0,
    );
    assert.equal((await as(BEN, `delete from trip_members where user_id = $1`, [CARA])).count, 0);
  });

  it('cannot take the trip over, rename it or delete it', async () => {
    await refused(as(BEN, `update trips set owner_id = $1`, [BEN]), /permission denied/);
    assert.equal((await as(BEN, `update trips set name = 'Ben’s trip'`)).count, 0);
    assert.equal((await as(BEN, `delete from trips`)).count, 0);
  });

  it('cannot move a cost or a stop to another trip', async () => {
    await refused(as(BEN, `update expenses set trip_id = gen_random_uuid()`), /permission denied/);
    await refused(as(BEN, `update trip_stops set trip_id = gen_random_uuid()`), /permission denied/);
  });

  it('loses access on leaving', async () => {
    assert.equal(
      (await as(BEN, `update trip_members set deleted_at = now() where user_id = $1`, [BEN])).count,
      1,
    );
    assert.equal((await as(BEN, 'select id from trips')).rows.length, 0);
    assert.equal((await as(BEN, 'select id from expenses')).rows.length, 0);
  });
});

describe('money', () => {
  const insert = (amount: number, paid: string, owed: string) =>
    as(
      ASHA,
      `insert into expenses (id, trip_id, title, category, spent_on, amount_minor, payers, split_mode, shares)
       values (gen_random_uuid(), $1, 'Dinner', 'food', '2026-12-02', $2, $3, 'equal', $4)`,
      [TRIP, amount, paid, owed],
    );

  it('refuses an expense whose payers or shares do not add up', async () => {
    await refused(insert(1000, payers(ASHA_MEMBER, 900), payers(ASHA_MEMBER, 1000)), /payers_add_up/);
    await refused(insert(1000, payers(ASHA_MEMBER, 1000), payers(ASHA_MEMBER, 999)), /shares_add_up/);
    await refused(insert(1000, '[]', payers(ASHA_MEMBER, 1000)), /payers_add_up/);
  });

  it('refuses amounts that are not whole, non-negative numbers', async () => {
    const half = JSON.stringify([
      { memberId: ASHA_MEMBER, amountMinor: 999.5 },
      { memberId: PRIYA_MEMBER, amountMinor: 0.5 },
    ]);
    await refused(insert(1000, half, payers(ASHA_MEMBER, 1000)), /payers_add_up/);
    const negative = JSON.stringify([
      { memberId: ASHA_MEMBER, amountMinor: 1500 },
      { memberId: PRIYA_MEMBER, amountMinor: -500 },
    ]);
    await refused(insert(1000, payers(ASHA_MEMBER, 1000), negative), /shares_add_up/);
    await refused(
      insert(
        1000,
        JSON.stringify([{ memberId: ASHA_MEMBER, amountMinor: '1000' }]),
        payers(ASHA_MEMBER, 1000),
      ),
      /payers_add_up/,
    );
  });

  it('accepts one that balances', async () => {
    assert.equal((await insert(1000, payers(ASHA_MEMBER, 1000), payers(PRIYA_MEMBER, 1000))).count, 1);
  });

  it('only records payments between two different people on that trip', async () => {
    const pay = (from: string, to: string) =>
      as(
        ASHA,
        `insert into settlements (id, trip_id, from_member, to_member, amount_minor, paid_on) values (gen_random_uuid(), $1, $2, $3, 500, '2026-12-03')`,
        [TRIP, from, to],
      );
    assert.equal((await pay(PRIYA_MEMBER, ASHA_MEMBER)).count, 1);
    await refused(pay(ASHA_MEMBER, ASHA_MEMBER), /check/);
    await refused(pay(ASHA_MEMBER, '20000000-0000-4000-8000-0000000000ee'), /foreign key/);
  });
});

describe('plans and limits', () => {
  it('can be read by their owner and written only by the server', async () => {
    await asServer(`insert into entitlements (user_id, is_pro) values ($1, false)`, [BEN]);
    await asServer(`insert into ai_usage (user_id, month, imports) values ($1, '2026-11', 15)`, [BEN]);
    assert.equal((await as(BEN, 'select is_pro from entitlements')).rows[0].is_pro, false);
    assert.equal((await as(ASHA, 'select * from entitlements')).rows.length, 0);

    await refused(as(BEN, `update entitlements set is_pro = true`), /permission denied/);
    await refused(
      as(BEN, `insert into entitlements (user_id, is_pro) values ($1, true)`, [BEN]),
      /permission denied/,
    );
    await refused(as(BEN, `update ai_usage set imports = 0`), /permission denied/);
    await refused(as(BEN, `delete from ai_usage`), /permission denied/);
  });
});

describe('the owner', () => {
  it('can rotate the invite link, which cancels the old one', async () => {
    const before = (await asServer('select invite_token from trips where id = $1', [TRIP])).rows[0]
      .invite_token;
    assert.equal(
      (await as(ASHA, `update trips set invite_token = gen_random_uuid() where id = $1`, [TRIP])).count,
      1,
    );
    await refused(as(BEN, 'select join_trip($1)', [before]), /no longer valid/);
  });

  it('can delete the trip, and everything in it goes too', async () => {
    assert.equal((await as(ASHA, 'delete from trips where id = $1', [TRIP])).count, 1);
    for (const table of ['trip_members', 'trip_stops', 'expenses', 'settlements']) {
      assert.equal((await asServer(`select count(*)::int as n from ${table}`)).rows[0].n, 0, table);
    }
  });

  it('deleting an account removes its saves, trips and plan', async () => {
    await asAuthService('delete from auth.users where id = $1', [ASHA]);
    assert.equal((await asServer('select count(*)::int as n from places')).rows[0].n, 0);
    assert.equal((await asServer('select count(*)::int as n from vaults')).rows[0].n, 0);
    assert.equal(
      (await asServer('select count(*)::int as n from profiles where id = $1', [ASHA])).rows[0].n,
      0,
    );
  });
});
