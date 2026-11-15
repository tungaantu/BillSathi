import type { Result } from './types';
import type {
  Account,
  DocumentType,
  Receipt,
  SaleDocument,
  SaleSummary,
  SavedDocument,
} from './sales';
export interface SalesApi {
  list(firm: number, type?: string, deleted?: boolean): Promise<Result<SaleSummary[]>>;
  get(firm: number, id: number): Promise<Result<SavedDocument>>;
  next(firm: number, type: string, prefix: string): Promise<Result<number>>;
  available(
    firm: number,
    type: string,
    prefix: string,
    number: number,
    except: number | null,
  ): Promise<Result<boolean>>;
  save(firm: number, id: number | null, doc: SaleDocument): Promise<Result<SavedDocument>>;
  receipt(firm: number, receipt: Receipt, id?: number): Promise<Result<number>>;
  getReceipt(firm: number, id: number): Promise<Result<Receipt>>;
  action(
    firm: number,
    id: number,
    action: 'delete' | 'restore' | 'cancel' | 'reopen' | 'close',
  ): Promise<Result<void>>;
  convert(
    firm: number,
    id: number,
    type: DocumentType,
    quantities?: number[],
  ): Promise<Result<SavedDocument>>;
  categories(
    firm: number,
    kind: 'expense' | 'other_income',
  ): Promise<Result<{ id: number; name: string }[]>>;
  category(firm: number, kind: 'expense' | 'other_income', name: string): Promise<Result<number>>;
  accounts(firm: number): Promise<Result<Account[]>>;
  attach(firm: number): Promise<Result<{ id: number; name: string } | null>>;
  attachment(firm: number, id: number): Promise<Result<void>>;
  preview(firm: number, id: number, theme?: string): Promise<Result<string>>;
  output(
    firm: number,
    id: number,
    action: 'pdf' | 'print' | 'thermal' | 'whatsapp' | 'email',
    theme?: string,
  ): Promise<Result<string | null>>;
}
