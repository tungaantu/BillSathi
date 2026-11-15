import type { BatchStock, ExpiryStatus, TransferInput } from './inventory';
import type { Result } from './types';

export interface Godown {
  id: number;
  name: string;
  address: string;
  /** The default "Main store" — cannot be deleted. */
  main: boolean;
  /** Number of items with stock here. */
  items: number;
  qty: number;
}
export interface GodownStock {
  itemId: number;
  item: string;
  godownId: number;
  qty: number;
}
export interface ExpiryRow {
  batchId: number;
  itemId: number;
  item: string;
  number: string;
  expDate: string | null;
  mfgDate: string | null;
  mrp: number | null;
  qty: number;
  status: ExpiryStatus;
}
export interface SerialHistory {
  serial: string;
  item: string;
  inStock: boolean;
  events: {
    txnId: number;
    type: string;
    prefix: string;
    number: number;
    date: string;
    direction: number;
    party: string;
  }[];
}
export interface StockTransfer extends TransferInput {
  id: number;
  number: number;
  from: string;
  to: string;
}
export interface LabelRequest {
  items: { itemId: number; copies: number }[];
  /** a4-65 | a4-48 | a4-40 | a4-24 | roll-50x25 | roll-38x25 */
  layout: string;
  fields: { name: boolean; price: boolean; mrp: boolean; code: boolean; firm: boolean };
}
export interface InventoryApi {
  godowns(firm: number): Promise<Result<Godown[]>>;
  saveGodown(
    firm: number,
    id: number | null,
    input: { name: string; address: string },
  ): Promise<Result<number>>;
  deleteGodown(firm: number, id: number): Promise<Result<void>>;
  godownStock(firm: number, godownId: number | null): Promise<Result<GodownStock[]>>;
  batches(firm: number, itemId: number, godownId?: number | null): Promise<Result<BatchStock[]>>;
  expiry(firm: number): Promise<Result<ExpiryRow[]>>;
  serials(
    firm: number,
    itemId: number,
    inStock?: boolean,
  ): Promise<Result<{ id: number; serial: string; inStock: boolean }[]>>;
  serialHistory(firm: number, query: string): Promise<Result<SerialHistory[]>>;
  /** Today's POS takings by payment method. */
  posDay(
    firm: number,
  ): Promise<Result<{ bills: number; total: number; cash: number; upi: number; card: number }>>;
  transfers(firm: number): Promise<Result<StockTransfer[]>>;
  saveTransfer(firm: number, input: TransferInput): Promise<Result<number>>;
  deleteTransfer(firm: number, id: number): Promise<Result<void>>;
  /** Builds a printable labels page; returns the saved PDF path (or '' when printed). */
  labels(firm: number, request: LabelRequest, mode: 'pdf' | 'print'): Promise<Result<string>>;
  printTransfer(firm: number, id: number, mode: 'pdf' | 'print'): Promise<Result<string>>;
}
