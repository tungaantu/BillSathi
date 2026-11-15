import { z } from 'zod';
import type { DatabaseContext } from './db';
import { masterRepository } from './db/masters';
import { masterFiles } from './services/master-files';
import type { Adjustment, ItemInput, PartyInput } from '../shared/masters';
import type { ImportSheet } from '../shared/master-import';
export function registerMasterIpc(
  context: DatabaseContext,
  handle: (channel: string, fn: (...args: unknown[]) => unknown) => void,
) {
  const repo = masterRepository(context),
    files = masterFiles(context);
  const id = (v: unknown) => z.number().int().positive().parse(v),
    nullable = (v: unknown) => (v === null ? null : id(v));
  const kind = (v: unknown) => z.enum(['parties', 'items']).parse(v);
  const lookup = (v: unknown) => z.enum(['groups', 'categories', 'units']).parse(v);
  handle('masters:parties', (f) => repo.parties(id(f)));
  handle('masters:items', (f) => repo.items(id(f)));
  handle('masters:saveParty', (f, i, v) => repo.saveParty(id(f), nullable(i), v as PartyInput));
  handle('masters:saveItem', (f, i, v) => repo.saveItem(id(f), nullable(i), v as ItemInput));
  handle('masters:bulkUpdate', (f, v) => repo.bulkUpdate(id(f), v));
  handle('masters:remove', (f, k, i, restore) =>
    repo.remove(id(f), kind(k), id(i), z.boolean().parse(restore ?? false)),
  );
  handle('masters:ledger', (f, i, from, to) =>
    repo.ledger(id(f), id(i), z.string().max(10).parse(from), z.string().max(10).parse(to)),
  );
  handle('masters:movements', (f, i) => repo.movements(id(f), id(i)));
  handle('masters:adjust', (f, i, v) => repo.adjust(id(f), id(i), v as Adjustment));
  handle('masters:lookups', (f) => repo.lookups(id(f)));
  handle('masters:saveLookup', (f, k, i, name, symbol) =>
    repo.saveLookup(
      id(f),
      lookup(k),
      nullable(i),
      z.string().parse(name),
      symbol === undefined ? undefined : z.string().parse(symbol),
    ),
  );
  handle('masters:deleteLookup', (f, k, i) => repo.deleteLookup(id(f), lookup(k), id(i)));
  handle('masters:saveConversion', (f, i, from, to, factor) =>
    repo.saveConversion(id(f), nullable(i), id(from), id(to), z.number().parse(factor)),
  );
  handle('masters:deleteConversion', (f, i) => repo.deleteConversion(id(f), id(i)));
  handle('masters:code', (f) => repo.code(id(f)));
  handle('masters:readImport', () => files.readImport());
  handle('masters:preview', (f, k, sheet, mapping) =>
    files.preview(id(f), kind(k), sheet as ImportSheet, mapping as Record<string, string>),
  );
  handle('masters:import', (f, k, sheet, mapping) =>
    files.importRows(id(f), kind(k), sheet as ImportSheet, mapping as Record<string, string>),
  );
  handle('masters:export', (f, k, sample) =>
    files.exportRows(id(f), kind(k), z.boolean().parse(sample ?? false)),
  );
}
