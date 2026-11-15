import { query, live, numberSql, partyNameSql, type ReportCtx, type Row } from './engine';

/**
 * Tax lines of posted documents of the given types in a date range, one row per item line or charge.
 * Each row carries the document fields the GST reports need (place of supply, party GSTIN, ...).
 * Lines and charges are read separately (each uses its txn_id index) and merged in date order;
 * the GSTIN saved on the bill is read once per document, not once per line.
 */
export function taxLines(ctx: ReportCtx, types: string[], from: string, to: string): Row[] {
  const inTypes = types.map(() => '?').join(', ');
  const head = `t.id txn_id, t.type, t.date, ${numberSql()} number, t.prefix, t.number raw_number, t.place_of_supply pos,
        t.reverse_charge, t.itc_eligible, t.ref_txn_id,
        o.total original_total, o.date original_date, t.total doc_total, t.party_id,
        ${partyNameSql()} party, COALESCE(p.gstin, '') party_gstin,
        COALESCE(p.gst_type, 'consumer') gst_type, COALESCE(p.state_code, '') party_state`;
  const where = `WHERE ${live()} AND t.type IN (${inTypes}) AND t.date BETWEEN ? AND ?`;
  const params = [ctx.firm, ...types, from, to];
  const lines = query(
    ctx,
    `SELECT ${head},
        x.item_id, x.name item_name, COALESCE(NULLIF(x.hsn, ''), i.hsn, '') hsn, x.qty, x.tax_bps,
        x.taxable, x.cgst, x.sgst, x.igst, x.cess, x.total, x.discount, 0 is_charge,
        COALESCE(i.type, 'product') item_type, COALESCE(u.symbol, '') unit
     FROM txns t JOIN txn_lines x ON x.txn_id = t.id
     LEFT JOIN txns o ON o.id = t.ref_txn_id
     LEFT JOIN parties p ON p.id = t.party_id
     LEFT JOIN items i ON i.id = x.item_id
     LEFT JOIN units u ON u.id = x.unit_id
     ${where} ORDER BY t.date, t.id, x.position, x.id`,
    ...params,
  );
  const charges = query(
    ctx,
    `SELECT ${head},
        NULL item_id, c.name item_name, '' hsn, 0 qty, c.tax_bps,
        c.taxable, c.cgst, c.sgst, c.igst, c.cess, c.taxable + c.cgst + c.sgst + c.igst + c.cess total,
        0 discount, 1 is_charge, 'product' item_type, '' unit
     FROM txns t JOIN additional_charges c ON c.txn_id = t.id
     LEFT JOIN txns o ON o.id = t.ref_txn_id
     LEFT JOIN parties p ON p.id = t.party_id
     ${where} ORDER BY t.date, t.id, c.id`,
    ...params,
  );
  const saved = new Map(
    query(
      ctx,
      `SELECT t.id, json_extract(t.metadata, '$.partyGstin') gstin FROM txns t ${where}`,
      ...params,
    ).map((r) => [Number(r.id), String(r.gstin ?? '')]),
  );
  // Both lists are already in (date, document) order: merge them (charges after the
  // document's lines) and fill in the GSTIN in place rather than re-sorting and copying.
  const out: Row[] = [];
  let c = 0;
  const before = (a: Row, b: Row) =>
    String(a.date) < String(b.date) || (a.date === b.date && Number(a.txn_id) <= Number(b.txn_id));
  for (const line of lines) {
    while (c < charges.length && !before(line, charges[c])) out.push(charges[c++]);
    out.push(line);
  }
  while (c < charges.length) out.push(charges[c++]);
  for (const r of out) {
    r.gstin = saved.get(Number(r.txn_id)) || String(r.party_gstin ?? '');
    delete r.party_gstin;
  }
  return out;
}
