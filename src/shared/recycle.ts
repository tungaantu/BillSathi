/** Pure recycle-bin rules. */
export const RECYCLE_DAYS = 30;
const DAY = 86_400_000;
/** Soft-deleted rows with deleted_at before this ISO time are purged for good. */
export const purgeCutoff = (now: Date) =>
  new Date(now.getTime() - RECYCLE_DAYS * DAY).toISOString();
export function daysLeft(deletedAt: string, now: Date): number {
  const age = (now.getTime() - Date.parse(deletedAt)) / DAY;
  return Math.max(0, Math.ceil(RECYCLE_DAYS - age));
}
export interface SeriesRow {
  id: number;
  firmId: number;
  type: string;
  prefix: string;
  number: number;
  deletedAt: string | null;
}
/** A deleted document can come back only if no live document has taken its number. */
export function restoreClash(target: SeriesRow, all: SeriesRow[]): SeriesRow | null {
  return (
    all.find(
      (r) =>
        r.id !== target.id &&
        !r.deletedAt &&
        r.firmId === target.firmId &&
        r.type === target.type &&
        r.prefix === target.prefix &&
        r.number === target.number,
    ) ?? null
  );
}
