import type { DatabaseContext } from '../db';
import type { DashboardData } from '../../shared/types';
export function dashboard({ sqlite }: DatabaseContext, firmId: number): DashboardData {
  const value = (sql: string): number =>
    (sqlite.prepare(sql).get(firmId) as { value: number }).value;
  const balance = (sign: number) =>
    value(
      `SELECT COALESCE(SUM(${sign === 1 ? 'balance' : '-balance'}),0) value FROM party_balances WHERE firm_id=? AND balance ${sign === 1 ? '>' : '<'} 0`,
    );
  const exists = (table: string) =>
    value(`SELECT COUNT(*) value FROM ${table} WHERE firm_id=? AND deleted_at IS NULL`) > 0;
  const profile = sqlite
    .prepare('SELECT name, phone, state_code FROM firms WHERE id=?')
    .get(firmId) as { name: string; phone: string; state_code: string } | undefined;
  if (!profile) throw new Error('notFound');
  return {
    receive: balance(1),
    pay: balance(-1),
    cash: value(
      "SELECT COALESCE(SUM(balance),0) value FROM account_balances WHERE firm_id=? AND type='cash'",
    ),
    bank: value(
      "SELECT COALESCE(SUM(balance),0) value FROM account_balances WHERE firm_id=? AND type IN ('bank','upi','card')",
    ),
    chequesDue: value(
      "SELECT COUNT(*) value FROM cheques c JOIN txns t ON t.id=c.txn_id WHERE c.firm_id=? AND c.deleted_at IS NULL AND c.status='open' AND t.status='posted' AND t.deleted_at IS NULL AND c.date BETWEEN date('now','localtime') AND date('now','localtime','+3 days')",
    ),
    todaySale: value(
      "SELECT COALESCE(SUM(total),0) value FROM txns WHERE firm_id=? AND type='sale' AND status='posted' AND deleted_at IS NULL AND date=date('now','localtime')",
    ),
    stock: value('SELECT COALESCE(SUM(value),0) value FROM stock_balances WHERE firm_id=?'),
    sales: sqlite
      .prepare(
        "SELECT date, SUM(total) total FROM txns WHERE firm_id=? AND type='sale' AND status='posted' AND deleted_at IS NULL AND date>=date('now','localtime','-30 days') GROUP BY date ORDER BY date",
      )
      .all(firmId) as DashboardData['sales'],
    checklist: {
      profile: Boolean(profile.name && profile.phone && profile.state_code),
      item: exists('items'),
      party: exists('parties'),
      invoice:
        value(
          "SELECT COUNT(*) value FROM txns WHERE firm_id=? AND type='sale' AND status='posted' AND deleted_at IS NULL",
        ) > 0,
      backup:
        value(
          "SELECT COUNT(*) value FROM settings WHERE firm_id=? AND key='backup.lastSuccess' AND length(value)>2",
        ) > 0,
    },
  };
}
