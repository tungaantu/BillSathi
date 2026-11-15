import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import type { ReactNode } from 'react';
import { useShowMore } from './ShowMore';
export function Table<T>({
  data,
  columns,
  empty,
}: {
  data: T[];
  columns: ColumnDef<T>[];
  empty: ReactNode;
}) {
  const { visible, more } = useShowMore(data);
  const table = useReactTable({ data: visible, columns, getCoreRowModel: getCoreRowModel() });
  if (!data.length) return empty;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {more}
    </div>
  );
}
