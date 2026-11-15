import type { DatabaseContext } from './index';
import { repositories } from './repositories';
import { isLocked } from '../../shared/fy';

/**
 * Year lock: after a financial year is closed, nothing dated in it may be created, edited,
 * cancelled, deleted or restored. Throws `closedYear` (shown as a plain message).
 */
export function yearLock(context: DatabaseContext) {
  const repo = repositories(context);
  return function assertOpen(firm: number, ...dates: (string | null | undefined)[]) {
    const closed = String(repo.getSettings(firm).booksClosedThrough ?? '');
    if (closed && dates.some((d) => isLocked(d, closed))) throw new Error('closedYear');
  };
}
