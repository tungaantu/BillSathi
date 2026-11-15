import initSqlJs from 'sql.js';
import { drizzle } from 'drizzle-orm/sql-js';
import { migrate } from 'drizzle-orm/sql-js/migrator';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { STATES, TAX_RATES, UNITS } from '../../shared/constants';
import * as schema from './schema';
export async function openDatabase(directory: string) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'billsathi.db');
  const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
  let raw = new SQL.Database(existsSync(path) ? readFileSync(path) : undefined);
  raw.run('PRAGMA foreign_keys = ON');
  const persist = () => {
    writeFileSync(path + '.tmp', raw.export());
    renameSync(path + '.tmp', path);
    raw.run('PRAGMA foreign_keys = ON');
  };
  let db = drizzle(raw, { schema });
  let activeTransaction = false,
    savepointNumber = 0;
  const sqlite = {
    prepare(sql: string) {
      return {
        get(...params: (string | number | null)[]) {
          const statement = raw.prepare(sql);
          try {
            statement.bind(params);
            return statement.step() ? statement.getAsObject() : undefined;
          } finally {
            statement.free();
          }
        },
        all(...params: (string | number | null)[]) {
          const statement = raw.prepare(sql);
          const rows: Record<string, unknown>[] = [];
          try {
            statement.bind(params);
            // Column names read once (getAsObject re-reads them for every row — slow on big reports).
            const names = statement.getColumnNames();
            while (statement.step()) {
              const values = statement.get();
              const row: Record<string, unknown> = {};
              for (let i = 0; i < names.length; i++) row[names[i]] = values[i];
              rows.push(row);
            }
            return rows;
          } finally {
            statement.free();
          }
        },
      };
    },
    transaction<T>(fn: () => T): () => T {
      return () => {
        if (activeTransaction) {
          const point = `nested_${++savepointNumber}`;
          raw.run(`SAVEPOINT ${point}`);
          try {
            const value = fn();
            raw.run(`RELEASE SAVEPOINT ${point}`);
            return value;
          } catch (error) {
            raw.run(`ROLLBACK TO SAVEPOINT ${point}`);
            raw.run(`RELEASE SAVEPOINT ${point}`);
            throw error;
          }
        }
        // No up-front snapshot (a full copy of the database per write was the main cost of
        // saving with large books): a failure before COMMIT is undone by ROLLBACK, and if the
        // committed data cannot be written to disk we reload the last saved file, which the
        // temp-file + rename in persist() leaves untouched.
        raw.run('PRAGMA foreign_keys = ON');
        raw.run('BEGIN IMMEDIATE');
        activeTransaction = true;
        let committed = false;
        try {
          const result = fn();
          raw.run('COMMIT');
          committed = true;
          persist();
          return result;
        } catch (error) {
          if (!committed) {
            try {
              raw.run('ROLLBACK');
            } catch {
              /* nothing to roll back */
            }
          } else if (existsSync(path)) {
            raw.close();
            raw = new SQL.Database(readFileSync(path));
            raw.run('PRAGMA foreign_keys = ON');
            db = drizzle(raw, { schema });
          }
          throw error;
        } finally {
          activeTransaction = false;
        }
      };
    },
    close() {
      raw.close();
    },
  };
  migrate(db, { migrationsFolder: join(__dirname, 'migrations') });
  sqlite.transaction(() => {
    for (const [name, symbol] of UNITS)
      db.insert(schema.units).values({ name, symbol }).onConflictDoNothing().run();
    for (const state of STATES)
      db.insert(schema.states)
        .values({ code: state.code, name: state.en, hindi: state.hi })
        .onConflictDoNothing()
        .run();
    for (const kind of ['GST', 'IGST'])
      for (const rateBps of TAX_RATES)
        db.insert(schema.taxRates)
          .values({ name: `${kind} ${rateBps / 100}%`, kind, rateBps })
          .onConflictDoNothing()
          .run();
    db.insert(schema.taxRates)
      .values({ name: 'Exempt', kind: 'GST', rateBps: 0, exempt: true })
      .onConflictDoNothing()
      .run();
  })();
  return {
    get db() {
      return db;
    },
    sqlite,
  };
}
export type DatabaseContext = Awaited<ReturnType<typeof openDatabase>>;
