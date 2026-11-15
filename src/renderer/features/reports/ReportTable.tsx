import { useMemo, useRef, useState } from 'react';
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslation } from 'react-i18next';
import { formatCell } from '../../../shared/report-format';
import type { ReportResult, ReportRow } from '../../../shared/reports';
import { useApp, useNavigation } from '../../app/state';

export function ReportTable({ result }: { result: ReportResult }) {
  const { t, i18n } = useTranslation(),
    { settings } = useApp(),
    { navigate } = useNavigation();
  const [sorting, setSorting] = useState<SortingState>([]);
  const parent = useRef<HTMLDivElement>(null);
  const columns = useMemo<ColumnDef<ReportRow>[]>(
    () => result.columns.map((c) => ({ id: c.key, accessorKey: c.key })),
    [result.columns],
  );
  const table = useReactTable({
    data: result.rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const rows = table.getRowModel().rows;
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parent.current,
    estimateSize: () => 44,
    overscan: 12,
  });
  const tr = (key: string) => (i18n.exists(key) ? t(key) : undefined);
  const cell = (row: ReportRow, c: ReportResult['columns'][number]) =>
    row[c.key] === 'reports.total' ? t('reports.total') : formatCell(row[c.key], c, tr, settings);
  const visible = virtual.getVirtualItems();
  return (
    <div
      className="report-table-scroll"
      ref={parent}
      data-tour="report-table"
      role="region"
      aria-label={t(`reports.name.${result.id}`)}
      tabIndex={0}
    >
      <table className="report-table">
        <thead>
          <tr>
            {result.columns.map((c) => (
              <th
                key={c.key}
                aria-sort={
                  table.getColumn(c.key)?.getIsSorted() === 'asc'
                    ? 'ascending'
                    : table.getColumn(c.key)?.getIsSorted() === 'desc'
                      ? 'descending'
                      : 'none'
                }
              >
                <button onClick={table.getColumn(c.key)?.getToggleSortingHandler()}>
                  {t(c.label)}{' '}
                  {table.getColumn(c.key)?.getIsSorted() === 'asc'
                    ? '↑'
                    : table.getColumn(c.key)?.getIsSorted() === 'desc'
                      ? '↓'
                      : '↕'}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.length > 0 && (
            <tr aria-hidden="true">
              <td
                colSpan={columns.length}
                style={{ height: visible[0].start, padding: 0, border: 0 }}
              />
            </tr>
          )}
          {visible.map((v) => {
            const row = rows[v.index].original;
            return (
              <tr
                key={rows[v.index].id}
                onClick={row._link ? () => navigate(String(row._link)) : undefined}
                className={`${row._bold ? 'report-strong' : ''} ${row._link ? 'report-linked' : ''}`}
              >
                {result.columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={
                      ['money', 'int', 'qty', 'percent', 'rate'].includes(c.type)
                        ? 'report-number'
                        : ''
                    }
                    style={i === 0 && row._indent ? { paddingLeft: 28 } : undefined}
                  >
                    {i === 0 && row._link ? (
                      <button
                        className="report-row-link"
                        onClick={() => navigate(String(row._link))}
                      >
                        {cell(row, c)}
                      </button>
                    ) : (
                      cell(row, c)
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
          {visible.length > 0 && (
            <tr aria-hidden="true">
              <td
                colSpan={columns.length}
                style={{
                  height: virtual.getTotalSize() - visible[visible.length - 1].end,
                  padding: 0,
                  border: 0,
                }}
              />
            </tr>
          )}
        </tbody>
        {result.totals && (
          <tfoot>
            <tr>
              {result.columns.map((c) => (
                <td className="report-number" key={c.key}>
                  {cell(result.totals!, c)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
