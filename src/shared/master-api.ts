import type { Result } from './types';
import type {
  Adjustment,
  Item,
  ItemInput,
  LedgerRow,
  LookupKind,
  Lookups,
  Movement,
  Named,
  Party,
  PartyInput,
} from './masters';
import type { ImportKind, ImportPreview, ImportSheet } from './master-import';
export interface MastersApi {
  parties(firm: number): Promise<Result<Party[]>>;
  saveParty(firm: number, id: number | null, input: PartyInput): Promise<Result<Party>>;
  items(firm: number): Promise<Result<Item[]>>;
  saveItem(firm: number, id: number | null, input: ItemInput): Promise<Result<Item>>;
  bulkUpdate(firm: number, rows: import('./masters').ItemPatch[]): Promise<Result<number>>;
  remove(
    firm: number,
    kind: 'parties' | 'items',
    id: number,
    restore?: boolean,
  ): Promise<Result<void>>;
  ledger(firm: number, id: number, from: string, to: string): Promise<Result<LedgerRow[]>>;
  movements(firm: number, id: number): Promise<Result<Movement[]>>;
  adjust(firm: number, id: number, input: Adjustment): Promise<Result<void>>;
  lookups(firm: number): Promise<Result<Lookups>>;
  saveLookup(
    firm: number,
    kind: LookupKind,
    id: number | null,
    name: string,
    symbol?: string,
  ): Promise<Result<Named>>;
  deleteLookup(firm: number, kind: LookupKind, id: number): Promise<Result<void>>;
  saveConversion(
    firm: number,
    id: number | null,
    from: number,
    to: number,
    factor: number,
  ): Promise<Result<void>>;
  deleteConversion(firm: number, id: number): Promise<Result<void>>;
  code(firm: number): Promise<Result<string>>;
  readImport(): Promise<Result<ImportSheet | null>>;
  preview(
    firm: number,
    kind: ImportKind,
    sheet: ImportSheet,
    mapping: Record<string, string>,
  ): Promise<Result<ImportPreview>>;
  import(
    firm: number,
    kind: ImportKind,
    sheet: ImportSheet,
    mapping: Record<string, string>,
  ): Promise<Result<{ imported: number; skipped: number }>>;
  export(firm: number, kind: ImportKind, sample?: boolean): Promise<Result<boolean>>;
}
