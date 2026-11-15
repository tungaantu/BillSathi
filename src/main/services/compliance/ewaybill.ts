import { totals } from '../../../shared/sales';
import { displayDocumentNumber } from '../../../shared/numbering';
import { validateGSTIN } from '../../../shared/gstin';
import { sumPaise } from '../../../shared/money';
import {
  EWB_THRESHOLD_PAISE,
  isValidVehicle,
  normalizeVehicle,
  type CheckResult,
  type ComplianceIssue,
  type Transport,
} from '../../../shared/compliance-api';
import {
  dmy,
  extractPincode,
  extractPlace,
  gstinState,
  hasErrors,
  hsnDigits,
  isHsn,
  issue,
  rupees,
  splitAddress,
  type ComplianceSource,
} from './common';
import { uqcFor } from './uqc';

/**
 * NIC e-Way Bill *bulk generation* JSON (upload at ewaybillgst.gov.in -> Generate Bulk).
 * File shape: `{ "version": EWB_VERSION, "billLists": [ <bill>, ... ] }`.
 *
 * Field mapping (NIC "Generate EWB" payload, which the bulk tool reuses):
 *   userGstin / supplyType O|I / subSupplyType 1=Supply 7=Sales return / docType INV|CNT
 *   docNo / docDate dd/mm/yyyy / transactionType 1=Regular
 *   from*, to*  : GSTIN ("URP" for an unregistered buyer), trade name, Addr1/Addr2, place, PIN,
 *                 fromStateCode/toStateCode = state of the GSTIN, actFromStateCode/actToStateCode =
 *                 state where goods actually leave from / are delivered to
 *   totalValue (taxable value of goods) + cgst/sgst/igst/cess values + otherValue
 *   (charges, round-off; may be negative) = totInvValue
 *   transporterId / transporterName / transMode 1 road 2 rail 3 air 4 ship / transDistance km
 *   transDocNo / transDocDate / vehicleNo / vehicleType R regular, O over-dimensional cargo
 *   itemList: productName, productDesc, hsnCode, quantity, qtyUnit (UQC), taxableAmount, rates
 * Amounts are rupee numbers with at most two decimals; PIN, state codes and HSN are numbers.
 */
export const EWB_VERSION = '1.0.0621';

export interface EwayItem {
  productName: string;
  productDesc: string;
  hsnCode: number;
  quantity: number;
  qtyUnit: string;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cessRate: number;
  cessNonAdvol: number;
  taxableAmount: number;
}
export interface EwayBill {
  userGstin: string;
  supplyType: 'O' | 'I';
  subSupplyType: number;
  subSupplyDesc: string;
  docType: 'INV' | 'CNT';
  docNo: string;
  docDate: string;
  transactionType: number;
  fromGstin: string;
  fromTrdName: string;
  fromAddr1: string;
  fromAddr2: string;
  fromPlace: string;
  fromPincode: number;
  actFromStateCode: number;
  fromStateCode: number;
  toGstin: string;
  toTrdName: string;
  toAddr1: string;
  toAddr2: string;
  toPlace: string;
  toPincode: number;
  actToStateCode: number;
  toStateCode: number;
  totalValue: number;
  cgstValue: number;
  sgstValue: number;
  igstValue: number;
  cessValue: number;
  cessNonAdvolValue: number;
  otherValue: number;
  totInvValue: number;
  transporterId: string;
  transporterName: string;
  transMode: string;
  transDistance: string;
  transDocNo: string;
  transDocDate: string;
  vehicleNo: string;
  vehicleType: 'R' | 'O';
  itemList: EwayItem[];
}
export const EWB_MODE_CODE = { road: '1', rail: '2', air: '3', ship: '4' } as const;

/** Validate the e-way bill inputs; pure so the dialog and bulk export share the same rules. */
export function checkEwayBill(src: ComplianceSource, transport: Transport): ComplianceIssue[] {
  const { firm, party, doc } = src;
  const issues: ComplianceIssue[] = [];
  const add = (...args: Parameters<typeof issue>) => issues.push(issue(...args));
  if (doc.type !== 'sale' && doc.type !== 'sale_return') add('error', 'ewbDocType', 'invoice');
  if (!validateGSTIN(firm.gstin)) add('error', 'firmGstin', 'profile');
  if (!firm.address.trim()) add('error', 'firmAddress', 'profile');
  else if (!extractPincode(firm.address)) add('error', 'firmPincode', 'profile');
  if (!party.address.trim() && !src.shippingAddress.trim()) add('error', 'partyAddress', 'party');
  else if (!extractPincode(src.shippingAddress) && !extractPincode(party.address))
    add('error', 'partyPincode', 'party');
  if (!party.gstin) add('warning', 'partyGstinMissing', 'party');
  else if (!validateGSTIN(party.gstin)) add('error', 'partyGstin', 'party');
  doc.lines.forEach((line, i) => {
    if (!isHsn(line.hsn)) add('error', 'itemHsn', 'item', { name: line.name, line: i + 1 });
  });
  const number = displayDocumentNumber(doc);
  if (!/^[A-Za-z0-9/-]{1,16}$/.test(number)) add('error', 'ewbDocNo', 'invoice', { number });
  if (!isValidVehicle(transport.vehicleNo)) add('error', 'vehicleFormat');
  if (transport.transporterId && !validateGSTIN(transport.transporterId))
    add('error', 'transporterId');
  const c = totals(doc, doc.firmState ?? firm.stateCode);
  if (c.total < EWB_THRESHOLD_PAISE) add('warning', 'belowThreshold');
  if (transport.mode === 'road') {
    if (!transport.vehicleNo.trim() && !transport.transporterId.trim()) add('warning', 'partB');
  } else if (!transport.docNo.trim()) add('warning', 'transDoc');
  return issues;
}

export function buildEwayBill(src: ComplianceSource, transport: Transport): EwayBill {
  const { firm, party, doc } = src;
  const c = totals(doc, doc.firmState ?? firm.stateCode);
  const sameState = (doc.firmState ?? firm.stateCode) === doc.placeOfSupply;
  const outward = doc.type !== 'sale_return';
  const delivery = src.shippingAddress.trim() || party.address;
  const firmSide = {
    gstin: firm.gstin,
    name: firm.name,
    address: firm.address,
    place: extractPlace(firm.address, firm.stateCode),
    pin: extractPincode(firm.address) ?? 0,
    gstState: Number(gstinState(firm.gstin) || firm.stateCode),
    actState: Number(firm.stateCode),
  };
  const partyAddress = outward ? delivery : party.address;
  const partyState = party.stateCode || doc.placeOfSupply;
  const partySide = {
    gstin: party.gstin || 'URP',
    name: party.name,
    address: partyAddress,
    place: extractPlace(partyAddress, doc.placeOfSupply),
    pin: extractPincode(partyAddress) ?? extractPincode(party.address) ?? 0,
    gstState: Number(party.gstin ? gstinState(party.gstin) : partyState),
    actState: Number(doc.placeOfSupply),
  };
  const [from, to] = outward ? [firmSide, partySide] : [partySide, firmSide];
  const [fromA1, fromA2] = splitAddress(from.address);
  const [toA1, toA2] = splitAddress(to.address);
  const itemTaxable = sumPaise(c.lines.map((l) => l.taxable));
  const tax = sumPaise([c.cgst, c.sgst, c.igst]);
  const road = transport.mode === 'road';
  const vehicle = road ? normalizeVehicle(transport.vehicleNo) : '';
  return {
    userGstin: firm.gstin,
    supplyType: outward ? 'O' : 'I',
    subSupplyType: outward ? 1 : 7,
    subSupplyDesc: '',
    docType: outward ? 'INV' : 'CNT',
    docNo: displayDocumentNumber(doc),
    docDate: dmy(doc.date),
    transactionType: 1,
    fromGstin: from.gstin,
    fromTrdName: from.name,
    fromAddr1: fromA1,
    fromAddr2: fromA2,
    fromPlace: from.place,
    fromPincode: from.pin,
    actFromStateCode: from.actState,
    fromStateCode: from.gstState,
    toGstin: to.gstin,
    toTrdName: to.name,
    toAddr1: toA1,
    toAddr2: toA2,
    toPlace: to.place,
    toPincode: to.pin,
    actToStateCode: to.actState,
    toStateCode: to.gstState,
    totalValue: rupees(itemTaxable),
    cgstValue: rupees(c.cgst),
    sgstValue: rupees(c.sgst),
    igstValue: rupees(c.igst),
    cessValue: rupees(c.cess),
    cessNonAdvolValue: 0,
    // Charges (with their own tax) and round-off are the balance of the invoice value.
    otherValue: rupees(c.total - itemTaxable - tax - c.cess),
    totInvValue: rupees(c.total),
    transporterId: transport.transporterId.trim().toUpperCase(),
    transporterName: transport.transporterName.trim(),
    transMode: EWB_MODE_CODE[transport.mode],
    transDistance: String(transport.distanceKm),
    transDocNo: transport.docNo.trim(),
    transDocDate: transport.docDate ? dmy(transport.docDate) : '',
    vehicleNo: vehicle,
    vehicleType: transport.vehicleType === 'odc' ? 'O' : 'R',
    itemList: doc.lines.map((line, i) => {
      const unit = line.unitId ? src.units[line.unitId] : undefined;
      return {
        productName: line.name.slice(0, 100),
        productDesc: line.name.slice(0, 100),
        hsnCode: Number(hsnDigits(line.hsn)) || 0,
        quantity: Number(line.qty) + Number(line.freeQty),
        qtyUnit: uqcFor(unit?.symbol || unit?.name),
        cgstRate: sameState ? line.taxBps / 200 : 0,
        sgstRate: sameState ? line.taxBps / 200 : 0,
        igstRate: sameState ? 0 : line.taxBps / 100,
        cessRate: line.cessBps / 100,
        cessNonAdvol: 0,
        taxableAmount: rupees(c.lines[i].taxable),
      };
    }),
  };
}

export const ewayFile = (bills: EwayBill[]) => ({ version: EWB_VERSION, billLists: bills });

export function ewayCheck(
  src: ComplianceSource,
  transport: Transport,
): CheckResult & {
  bill: EwayBill | null;
} {
  const issues = checkEwayBill(src, transport);
  const c = totals(src.doc, src.doc.firmState ?? src.firm.stateCode);
  return {
    issues,
    bill: hasErrors(issues) ? null : buildEwayBill(src, transport),
    summary: {
      total: c.total,
      taxable: c.taxable,
      tax: sumPaise([c.cgst, c.sgst, c.igst, c.cess]),
      items: src.doc.lines.length,
    },
    record: {},
  };
}
