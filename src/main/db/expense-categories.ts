import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { DatabaseContext } from './index';
import * as s from './schema';
import { salesRead } from './sales-read';
export function expenseCategories(context: DatabaseContext) {
  const { db, repo } = salesRead(context);
  function categories(firm: number, kind: 'expense' | 'other_income') {
    repo.get(firm);
    return db
      .select()
      .from(s.expenseCategories)
      .where(
        and(
          eq(s.expenseCategories.firmId, firm),
          eq(s.expenseCategories.kind, kind),
          isNull(s.expenseCategories.deletedAt),
        ),
      )
      .all();
  }
  function category(firm: number, kind: 'expense' | 'other_income', name: string) {
    return context.sqlite.transaction(() => {
      const label = z.string().trim().min(1).max(120).parse(name);
      const existing = categories(firm, kind).find(
        (c) => c.name.toLowerCase() === label.toLowerCase(),
      );
      if (existing) return existing.id;
      const row = db
        .insert(s.expenseCategories)
        .values({ firmId: firm, kind, name: label })
        .returning()
        .get();
      repo.audit(firm, 'expense_categories', row.id, 'create', null, row);
      return row.id;
    })();
  }
  return { categories, category };
}
