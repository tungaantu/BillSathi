import {
  sqliteTable,
  integer,
  text,
  real,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
const id = () => integer('id').primaryKey({ autoIncrement: true });
const firm = () =>
  integer('firm_id')
    .notNull()
    .references(() => firms.id);
const money = (name: string) => integer(name).notNull().default(0);
const name = () => text('name').notNull();
const deleted = () => text('deleted_at');
export const firms = sqliteTable('firms', {
  id: id(),
  name: name(),
  phone: text('phone').notNull().default(''),
  category: text('category').notNull().default('other'),
  stateCode: text('state_code').notNull(),
  gstin: text('gstin').notNull().default(''),
  pan: text('pan').notNull().default(''),
  address: text('address').notNull().default(''),
  email: text('email').notNull().default(''),
  bankName: text('bank_name').notNull().default(''),
  accountNumber: text('account_number').notNull().default(''),
  ifsc: text('ifsc').notNull().default(''),
  upiId: text('upi_id').notNull().default(''),
  logo: text('logo'),
  signature: text('signature'),
  demo: integer('demo', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(''),
  deletedAt: deleted(),
});
export const settings = sqliteTable(
  'settings',
  { firmId: firm(), key: text('key').notNull(), value: text('value').notNull() },
  (t) => [primaryKey({ columns: [t.firmId, t.key] })],
);
export const states = sqliteTable('states', {
  code: text('code').primaryKey(),
  name: name(),
  hindi: text('hindi').notNull(),
});
export const partyGroups = sqliteTable('party_groups', {
  id: id(),
  firmId: firm(),
  name: name(),
  deletedAt: deleted(),
});
export const parties = sqliteTable(
  'parties',
  {
    id: id(),
    firmId: firm(),
    groupId: integer('group_id').references(() => partyGroups.id),
    name: name(),
    phone: text('phone'),
    email: text('email'),
    gstType: text('gst_type').default('consumer'),
    gstin: text('gstin'),
    stateCode: text('state_code'),
    billingAddress: text('billing_address'),
    shippingAddress: text('shipping_address'),
    openingBalance: money('opening_balance'),
    openingDate: text('opening_date'),
    creditLimit: integer('credit_limit'),
    customFields: text('custom_fields').default('{}'),
    active: integer('active', { mode: 'boolean' }).default(true),
    deletedAt: deleted(),
  },
  (t) => [index('parties_firm_name').on(t.firmId, t.name)],
);
export const itemCategories = sqliteTable('item_categories', {
  id: id(),
  firmId: firm(),
  name: name(),
  deletedAt: deleted(),
});
export const units = sqliteTable('units', {
  id: id(),
  name: name(),
  symbol: text('symbol').notNull().unique(),
  standard: integer('standard', { mode: 'boolean' }).notNull().default(true),
});
export const unitConversions = sqliteTable('unit_conversions', {
  id: id(),
  firmId: firm(),
  fromUnit: integer('from_unit')
    .notNull()
    .references(() => units.id),
  toUnit: integer('to_unit')
    .notNull()
    .references(() => units.id),
  factor: real('factor').notNull(),
});
export const taxRates = sqliteTable(
  'tax_rates',
  {
    id: id(),
    name: name(),
    kind: text('kind').notNull(),
    rateBps: integer('rate_bps').notNull(),
    exempt: integer('exempt', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [uniqueIndex('tax_kind_rate').on(t.kind, t.rateBps, t.exempt)],
);
export const items = sqliteTable(
  'items',
  {
    id: id(),
    firmId: firm(),
    categoryId: integer('category_id').references(() => itemCategories.id),
    name: name(),
    type: text('type').notNull().default('product'),
    code: text('code'),
    barcode: text('barcode'),
    hsn: text('hsn'),
    unitId: integer('unit_id').references(() => units.id),
    secondaryUnitId: integer('secondary_unit_id').references(() => units.id),
    taxRateId: integer('tax_rate_id').references(() => taxRates.id),
    cessBps: integer('cess_bps').notNull().default(0),
    salePrice: money('sale_price'),
    purchasePrice: money('purchase_price'),
    wholesalePrice: money('wholesale_price'),
    mrp: money('mrp'),
    inclusive: integer('inclusive', { mode: 'boolean' }).default(false),
    discountBps: integer('discount_bps').default(0),
    wholesaleQty: real('wholesale_qty').default(0),
    minStock: real('min_stock').default(0),
    location: text('location'),
    image: text('image'),
    customFields: text('custom_fields').default('{}'),
    deletedAt: deleted(),
  },
  (t) => [
    index('items_firm_name').on(t.firmId, t.name),
    uniqueIndex('items_firm_code').on(t.firmId, t.code),
  ],
);
export const godowns = sqliteTable('godowns', {
  id: id(),
  firmId: firm(),
  name: name(),
  address: text('address'),
  deletedAt: deleted(),
});
export const paymentAccounts = sqliteTable('payment_accounts', {
  id: id(),
  firmId: firm(),
  name: name(),
  type: text('type').notNull(),
  bankName: text('bank_name'),
  accountNumber: text('account_number'),
  ifsc: text('ifsc'),
  upiId: text('upi_id'),
  openingBalance: money('opening_balance'),
  openingDate: text('opening_date'),
  printOnInvoice: integer('print_on_invoice', { mode: 'boolean' }).default(false),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  deletedAt: deleted(),
});
export const expenseCategories = sqliteTable('expense_categories', {
  id: id(),
  firmId: firm(),
  name: name(),
  kind: text('kind').notNull().default('expense'),
  deletedAt: deleted(),
});
export const txns = sqliteTable(
  'txns',
  {
    id: id(),
    firmId: firm(),
    type: text('type').notNull(),
    partyId: integer('party_id').references(() => parties.id),
    prefix: text('prefix').notNull().default(''),
    number: integer('number').notNull(),
    date: text('date').notNull(),
    dueDate: text('due_date'),
    placeOfSupply: text('place_of_supply'),
    status: text('status').notNull().default('draft'),
    refTxnId: integer('ref_txn_id'),
    godownId: integer('godown_id').references(() => godowns.id),
    expenseCategoryId: integer('expense_category_id').references(() => expenseCategories.id),
    subtotal: money('subtotal'),
    discount: money('discount'),
    taxable: money('taxable'),
    cgst: money('cgst'),
    sgst: money('sgst'),
    igst: money('igst'),
    cess: money('cess'),
    charges: money('charges'),
    roundOff: money('round_off'),
    total: money('total'),
    reverseCharge: integer('reverse_charge', { mode: 'boolean' }).default(false),
    itcEligible: integer('itc_eligible', { mode: 'boolean' }).default(true),
    description: text('description'),
    terms: text('terms'),
    metadata: text('metadata').notNull().default('{}'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: deleted(),
  },
  (t) => [
    uniqueIndex('txn_number').on(t.firmId, t.type, t.prefix, t.number),
    index('txn_firm_date').on(t.firmId, t.date),
    index('txn_party').on(t.partyId),
  ],
);
export const txnLines = sqliteTable('txn_lines', {
  id: id(),
  txnId: integer('txn_id')
    .notNull()
    .references(() => txns.id),
  itemId: integer('item_id').references(() => items.id),
  name: name(),
  hsn: text('hsn'),
  qty: real('qty').notNull(),
  freeQty: real('free_qty').default(0),
  unitId: integer('unit_id').references(() => units.id),
  price: money('price'),
  inclusive: integer('inclusive', { mode: 'boolean' }).default(false),
  discount: money('discount'),
  discountBps: integer('discount_bps').default(0),
  taxBps: integer('tax_bps').default(0),
  cessBps: integer('cess_bps').default(0),
  taxable: money('taxable'),
  cgst: money('cgst'),
  sgst: money('sgst'),
  igst: money('igst'),
  cess: money('cess'),
  total: money('total'),
  position: integer('position').default(0),
});
export const batches = sqliteTable('batches', {
  id: id(),
  firmId: firm(),
  itemId: integer('item_id')
    .notNull()
    .references(() => items.id),
  number: text('number').notNull(),
  mfgDate: text('mfg_date'),
  expDate: text('exp_date'),
  mrp: money('mrp'),
  deletedAt: deleted(),
});
export const serials = sqliteTable(
  'serials',
  {
    id: id(),
    firmId: firm(),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id),
    serial: text('serial').notNull(),
    status: text('status').notNull().default('available'),
    txnLineId: integer('txn_line_id').references(() => txnLines.id),
    deletedAt: deleted(),
  },
  (t) => [uniqueIndex('serial_firm').on(t.firmId, t.serial)],
);
export const stockLedger = sqliteTable(
  'stock_ledger',
  {
    id: id(),
    firmId: firm(),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id),
    godownId: integer('godown_id').references(() => godowns.id),
    batchId: integer('batch_id').references(() => batches.id),
    txnId: integer('txn_id').references(() => txns.id),
    txnLineId: integer('txn_line_id').references(() => txnLines.id),
    date: text('date').notNull(),
    qty: real('qty').notNull(),
    value: money('value'),
    reason: text('reason'),
    transferId: integer('transfer_id'),
    deletedAt: deleted(),
  },
  (t) => [index('stock_item').on(t.firmId, t.itemId)],
);
export const txnPayments = sqliteTable('txn_payments', {
  id: id(),
  txnId: integer('txn_id')
    .notNull()
    .references(() => txns.id),
  accountId: integer('account_id')
    .notNull()
    .references(() => paymentAccounts.id),
  amount: money('amount'),
  direction: integer('direction').notNull(),
  reference: text('reference'),
  reversed: integer('reversed', { mode: 'boolean' }).notNull().default(false),
  postingDate: text('posting_date'),
});
export const paymentLinks = sqliteTable('payment_links', {
  id: id(),
  paymentTxnId: integer('payment_txn_id')
    .notNull()
    .references(() => txns.id),
  invoiceTxnId: integer('invoice_txn_id')
    .notNull()
    .references(() => txns.id),
  amount: money('amount'),
});
export const cheques = sqliteTable('cheques', {
  id: id(),
  firmId: firm(),
  txnId: integer('txn_id').references(() => txns.id),
  paymentId: integer('payment_id').references(() => txnPayments.id),
  settledAccountId: integer('settled_account_id').references(() => paymentAccounts.id),
  actionDate: text('action_date'),
  accountId: integer('account_id').references(() => paymentAccounts.id),
  number: text('number').notNull(),
  bank: text('bank'),
  date: text('date').notNull(),
  amount: money('amount'),
  direction: text('direction').notNull(),
  status: text('status').default('open'),
  deletedAt: deleted(),
});
export const loans = sqliteTable('loans', {
  id: id(),
  firmId: firm(),
  partyId: integer('party_id').references(() => parties.id),
  accountId: integer('account_id').references(() => paymentAccounts.id),
  name: name(),
  principal: money('principal'),
  interestBps: integer('interest_bps').default(0),
  emi: money('emi'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  deletedAt: deleted(),
});
export const additionalCharges = sqliteTable('additional_charges', {
  id: id(),
  firmId: firm(),
  txnId: integer('txn_id').references(() => txns.id),
  name: name(),
  amount: money('amount'),
  taxBps: integer('tax_bps').default(0),
  taxable: money('taxable'),
  cgst: money('cgst'),
  sgst: money('sgst'),
  igst: money('igst'),
  cess: money('cess'),
});
export const auditLog = sqliteTable('audit_log', {
  id: id(),
  firmId: firm(),
  entity: text('entity').notNull(),
  entityId: integer('entity_id'),
  action: text('action').notNull(),
  before: text('before'),
  after: text('after'),
  at: text('at').notNull(),
  actor: text('actor').notNull().default('owner'),
});
export const attachments = sqliteTable('attachments', {
  id: id(),
  firmId: firm(),
  txnId: integer('txn_id').references(() => txns.id),
  entityType: text('entity_type'),
  entityId: integer('entity_id'),
  path: text('path').notNull(),
  mime: text('mime'),
  name: name(),
  deletedAt: deleted(),
});

export * from './customer-schema';
export * from './inventory-schema';
