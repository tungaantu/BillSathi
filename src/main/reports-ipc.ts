import { z } from 'zod';
import type { DatabaseContext } from './db';
import { reportOutput } from './reports-output';
import { reportService } from './services/reports';
import type { ReportFilters } from '../shared/reports';

type Handle = (channel: string, fn: (...args: unknown[]) => unknown) => void;
const id = (v: unknown) => z.number().int().positive().parse(v);
const name = (v: unknown) =>
  z
    .string()
    .regex(/^[A-Za-z0-9]{1,40}$/)
    .parse(v);

export function registerReportsIpc(context: DatabaseContext, handle: Handle) {
  const service = reportService(context),
    output = reportOutput(context);
  const filters = (v: unknown) => v as ReportFilters;
  handle('reports:run', (f, report, v) => service.run(id(f), name(report), filters(v)));
  handle('reports:exportExcel', (f, report, v) =>
    output.exportExcel(id(f), name(report), filters(v)),
  );
  handle('reports:exportPdf', (f, report, v) => output.exportPdf(id(f), name(report), filters(v)));
  handle('reports:print', (f, report, v) => output.print(id(f), name(report), filters(v)));
  handle('reports:gstr1Json', (f, v) => output.gstr1(id(f), filters(v), 'json'));
  handle('reports:gstr1Excel', (f, v) => output.gstr1(id(f), filters(v), 'xlsx'));
  handle('reports:insights', (f, range) =>
    service.insights(id(f), z.enum(['week', 'month', 'year']).parse(range)),
  );
}
