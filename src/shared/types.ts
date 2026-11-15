import type { CATEGORIES } from './constants';
export interface Firm {
  id: number;
  name: string;
  phone: string;
  category: (typeof CATEGORIES)[number];
  stateCode: string;
  gstin: string;
  pan: string;
  address: string;
  email: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  upiId: string;
  logo: string | null;
  signature: string | null;
  demo: boolean;
}
export type FirmInput = Omit<Firm, 'id' | 'logo' | 'signature'>;
export type SettingValue = string | number | boolean;
export type Settings = Record<string, SettingValue>;
export interface DashboardData {
  receive: number;
  pay: number;
  cash: number;
  bank: number;
  chequesDue: number;
  todaySale: number;
  stock: number;
  sales: { date: string; total: number }[];
  checklist: { profile: boolean; item: boolean; party: boolean; invoice: boolean; backup: boolean };
}
export type Result<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error:
        | 'validation'
        | 'storage'
        | 'notFound'
        | 'duplicate'
        | 'negativeStock'
        | 'allocation'
        | 'linked'
        | 'overpayment'
        | 'phone'
        | 'salesValidation'
        | 'serials'
        | 'closedYear'
        | 'backupFirst';
    };
export interface Api {
  customers: import('./customer-api').CustomerApi;
  finance: import('./finance').FinanceApi;
  sales: import('./sales-api').SalesApi;
  masters: import('./master-api').MastersApi;
  safety: import('./safety-api').SafetyApi;
  reports: import('./reports').ReportsApi;
  payments: import('./payments-api').PaymentsApi;
  compliance: import('./compliance-api').ComplianceApi;
  inventory: import('./inventory-api').InventoryApi;
  fy: import('./fy').FyApi;
  firm: {
    list(): Promise<Result<Firm[]>>;
    get(id: number): Promise<Result<Firm>>;
    create(input: FirmInput): Promise<Result<Firm>>;
    update(id: number, input: FirmInput): Promise<Result<Firm>>;
    upload(id: number, kind: 'logo' | 'signature'): Promise<Result<string | null>>;
    image(id: number, kind: 'logo' | 'signature'): Promise<Result<string | null>>;
  };
  settings: {
    get(firmId: number): Promise<Result<Settings>>;
    set(firmId: number, key: string, value: SettingValue): Promise<Result<Settings>>;
  };
  units: { list(): Promise<Result<{ id: number; name: string; symbol: string }[]>> };
  dashboard: { get(firmId: number): Promise<Result<DashboardData>> };
  demo: {
    clear(firmId: number): Promise<Result<Firm>>;
    restore(firmId: number): Promise<Result<Firm>>;
  };
}
export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
