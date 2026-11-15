import type { Result } from '../shared/types';
import type { ReportsApi } from '../shared/reports';

type Invoke = <T>(channel: string, ...args: unknown[]) => Promise<Result<T>>;
export const reportsApi = (invoke: Invoke): ReportsApi => ({
  run: (f, id, filters) => invoke('reports:run', f, id, filters),
  exportExcel: (f, id, filters) => invoke('reports:exportExcel', f, id, filters),
  exportPdf: (f, id, filters) => invoke('reports:exportPdf', f, id, filters),
  print: (f, id, filters) => invoke('reports:print', f, id, filters),
  gstr1Json: (f, filters) => invoke('reports:gstr1Json', f, filters),
  gstr1Excel: (f, filters) => invoke('reports:gstr1Excel', f, filters),
  insights: (f, range) => invoke('reports:insights', f, range),
});
