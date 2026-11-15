import {
  Home,
  Users,
  Package,
  ShoppingBag,
  ShoppingCart,
  Landmark,
  BarChart3,
  HardDriveDownload,
  Trash2,
  History,
  ShieldCheck,
  Wrench,
  Boxes,
  Settings,
  CircleHelp,
  type LucideIcon,
} from 'lucide-react';
export interface Route {
  id: string;
  group?: string;
  icon: LucideIcon;
  setting?: string;
}
export const routes: Route[] = [
  { id: 'home', icon: Home },
  { id: 'parties', icon: Users },
  { id: 'items', icon: Package },
  ...[
    'invoices',
    'recurring',
    'reminders',
    'estimates',
    'proforma',
    'paymentIn',
    'saleOrders',
    'challans',
    'saleReturns',
    'pos',
  ].map((id) => ({
    id,
    group: 'sale',
    icon: ShoppingBag,
    setting: (
      {
        estimates: 'estimate',
        proforma: 'proforma',
        saleOrders: 'orders',
        challans: 'challan',
      } as Record<string, string>
    )[id],
  })),
  ...(
    [
      ['godowns', 'godowns'],
      ['stockTransfers', 'godowns'],
      ['batchExpiry', 'batches'],
      ['serialLookup', 'serials'],
      ['barcodeLabels', undefined],
    ] as const
  ).map(([id, setting]) => ({ id, group: 'inventory', icon: Boxes, setting })),
  ...['bills', 'paymentOut', 'expenses', 'purchaseOrders', 'purchaseReturns', 'otherIncome'].map(
    (id) => ({
      id,
      group: 'purchase',
      icon: ShoppingCart,
      setting:
        id === 'otherIncome' ? 'otherIncome' : id === 'purchaseOrders' ? 'orders' : undefined,
    }),
  ),
  ...['bankAccounts', 'cashHand', 'cheques', 'loans', 'bankMatch'].map((id) => ({
    id,
    group: 'cashbank',
    icon: Landmark,
  })),
  { id: 'reports', icon: BarChart3 },
  { id: 'backup', icon: HardDriveDownload },
  { id: 'recycleBin', icon: Trash2 },
  { id: 'auditTrail', icon: History },
  { id: 'verifyData', icon: ShieldCheck },
  { id: 'utilities', icon: Wrench },
  { id: 'closeYear', icon: Wrench },
  { id: 'bulkItems', icon: Wrench },
  { id: 'settings', icon: Settings },
  { id: 'help', icon: CircleHelp },
  { id: 'profile', icon: Settings },
];
export const groups = [
  { id: 'inventory', icon: Boxes },
  { id: 'sale', icon: ShoppingBag },
  { id: 'purchase', icon: ShoppingCart },
  { id: 'cashbank', icon: Landmark },
];
