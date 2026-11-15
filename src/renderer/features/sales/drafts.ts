import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SaleDocument } from '../../../shared/sales';
export interface Draft {
  original?: SaleDocument;
  key: string;
  firmId: number;
  id: number | null;
  doc: SaleDocument;
  updatedAt: string;
}
export const useDrafts = create(
  persist<{
    tabs: Draft[];
    put: (draft: Draft) => void;
    remove: (key: string) => void;
  }>(
    (set) => ({
      tabs: [],
      put: (draft) =>
        set((s) => ({
          tabs: s.tabs.some((d) => d.key === draft.key)
            ? s.tabs.map((d) => (d.key === draft.key ? draft : d))
            : [...s.tabs, draft],
        })),
      remove: (key) => set((s) => ({ tabs: s.tabs.filter((d) => d.key !== key) })),
    }),
    { name: 'billsathi-sales-drafts-v1' },
  ),
);
export const salesRoute = (type: string) =>
  (
    ({
      sale: 'invoices',
      payment_in: 'paymentIn',
      payment_out: 'paymentOut',
      estimate: 'estimates',
      sale_return: 'saleReturns',
      sale_order: 'saleOrders',
      delivery_challan: 'challans',
      challan_return: 'challans',
      proforma: 'proforma',
      purchase: 'bills',
      purchase_return: 'purchaseReturns',
      purchase_order: 'purchaseOrders',
      expense: 'expenses',
      other_income: 'otherIncome',
    }) as Record<string, string>
  )[type] ?? 'invoices';
export const routeType = (route: string) =>
  (
    ({
      invoices: 'sale',
      estimates: 'estimate',
      saleReturns: 'sale_return',
      saleOrders: 'sale_order',
      challans: 'delivery_challan',
      proforma: 'proforma',
      bills: 'purchase',
      purchaseReturns: 'purchase_return',
      purchaseOrders: 'purchase_order',
      expenses: 'expense',
      otherIncome: 'other_income',
    }) as const
  )[route.split('/')[0] as 'invoices'] ?? 'sale';
