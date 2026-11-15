import type { DatabaseContext } from '../db';
import { repositories } from '../db/repositories';
import type { AuditFilter, AuditRow } from '../../shared/safety-api';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export function auditList(context: DatabaseContext, firm: number, filter: AuditFilter): AuditRow[] {
  repositories(context).get(firm);
  const where = ['firm_id = ?'];
  const params: (string | number)[] = [firm];
  if (filter.from && DATE.test(filter.from)) {
    where.push('substr(at, 1, 10) >= ?');
    params.push(filter.from);
  }
  if (filter.to && DATE.test(filter.to)) {
    where.push('substr(at, 1, 10) <= ?');
    params.push(filter.to);
  }
  if (filter.entity) {
    where.push('entity = ?');
    params.push(filter.entity);
  }
  if (filter.action) {
    where.push('action = ?');
    params.push(filter.action);
  }
  const limit = Math.min(1000, Math.max(1, Math.floor(filter.limit ?? 200)));
  return context.sqlite
    .prepare(`SELECT * FROM audit_log WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ${limit}`)
    .all(...params)
    .map((r) => ({
      id: Number(r.id),
      at: String(r.at),
      action: String(r.action),
      entity: String(r.entity),
      entityId: r.entity_id === null ? null : Number(r.entity_id),
      before: r.before === null ? null : String(r.before),
      after: r.after === null ? null : String(r.after),
      actor: String(r.actor),
    }));
}
export function auditEntities(context: DatabaseContext, firm: number): string[] {
  repositories(context).get(firm);
  return context.sqlite
    .prepare('SELECT DISTINCT entity FROM audit_log WHERE firm_id = ? ORDER BY entity')
    .all(firm)
    .map((r) => String(r.entity));
}
