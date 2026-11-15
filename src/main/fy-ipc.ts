import { z } from 'zod';
import type { DatabaseContext } from './db';
import { fyRepository } from './db/fy';
import { fyStarting } from '../shared/fy';

export function registerFyIpc(
  context: DatabaseContext,
  handle: (channel: string, fn: (...args: unknown[]) => unknown) => void,
) {
  const fy = fyRepository(context);
  const id = (v: unknown) => z.number().int().positive().parse(v);
  const year = (v: unknown) => z.number().int().min(2000).max(2200).parse(v);
  handle('fy:status', (f) => fy.status(id(f)));
  handle('fy:preview', (f, y) => fy.preview(id(f), fyStarting(year(y))));
  handle('fy:close', (f, y, path, reset) =>
    fy.close(id(f), year(y), z.string().min(1).max(1000).parse(path), reset === true),
  );
  handle('fy:reopen', (f) => fy.reopen(id(f)));
}
