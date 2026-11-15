/** Strings for GST compliance exports (e-way bill, e-invoice, Tally). Flat keys, like en.json. */
type Messages = Record<string, string>;

export const en: Messages = {
  'compliance.title': 'GST compliance and accounting exports',
  'compliance.intro':
    'Make files for the e-way bill and e-invoice portals, or move your books into Tally. Nothing is sent anywhere: you save a file and upload it yourself.',
  'compliance.eway.open': 'E-way bill JSON',
  'compliance.einv.open': 'E-invoice JSON',
  'compliance.badge.ewb': 'E-way bill {{no}}',
  'compliance.badge.irn': 'IRN saved',
  'compliance.guide.show': 'Show guide',
  'compliance.guide.skip': 'Skip guide',
  'compliance.guide.next': 'Next',
  'compliance.guide.done': 'Got it',
  'compliance.guide.step': 'Step {{current}} of {{total}}',
  'compliance.fix': 'Fix this',
  'compliance.mustFix': 'Must fix',
  'compliance.check': 'Please check',
  'compliance.issues': 'Before you save',
  'compliance.issues.none': 'Everything needed is filled in.',
  'compliance.summary':
    'Invoice value {{total}} · taxable {{taxable}} · GST {{tax}} · {{items}} item(s)',
  'compliance.save': 'Save JSON file',
  'compliance.saved': 'File saved.',
  'compliance.cannotSave': 'Fix the items marked "Must fix" first, then save the file.',
  'compliance.checking': 'Checking the invoice…',
  'compliance.close': 'Close',
  'compliance.eway.title': 'E-way bill JSON',
  'compliance.eway.intro':
    'Fill in the transport details, save the file, then upload it on the e-way bill portal (Generate Bulk). Come back and type the e-way bill number it gives you.',
  'compliance.eway.guide1.title': 'What this makes',
  'compliance.eway.guide1.body':
    'A JSON file in the NIC e-way bill format with your invoice, both GSTINs, addresses, items and taxes already filled in.',
  'compliance.eway.guide2.title': 'Add transport details',
  'compliance.eway.guide2.body':
    'Enter the vehicle number and distance. If you do not know them yet, leave them blank and add them on the portal later.',
  'compliance.eway.guide3.title': 'Upload and note the number',
  'compliance.eway.guide3.body':
    'Upload the file at ewaybillgst.gov.in, then type the 12-digit e-way bill number here so it is saved with the invoice.',
  'compliance.eway.transporterName': 'Transporter name',
  'compliance.eway.transporterId': 'Transporter ID (GSTIN)',
  'compliance.eway.mode': 'Mode of transport',
  'compliance.eway.mode.road': 'Road',
  'compliance.eway.mode.rail': 'Rail',
  'compliance.eway.mode.air': 'Air',
  'compliance.eway.mode.ship': 'Ship',
  'compliance.eway.distance': 'Distance (km)',
  'compliance.eway.vehicleNo': 'Vehicle number',
  'compliance.eway.vehicleType': 'Vehicle type',
  'compliance.eway.vehicleType.regular': 'Regular',
  'compliance.eway.vehicleType.odc': 'Over-dimensional cargo',
  'compliance.eway.docNo': 'Transport document no.',
  'compliance.eway.docDate': 'Transport document date',
  'compliance.eway.ewbNo': 'E-way bill number from the portal',
  'compliance.eway.ewbNoSave': 'Save number',
  'compliance.eway.ewbNoSaved': 'E-way bill number saved with this invoice.',
  'compliance.eway.ewbNoInvalid': 'An e-way bill number has exactly 12 digits.',
  'compliance.einv.title': 'E-invoice JSON',
  'compliance.einv.intro':
    'Save the file, upload it on the e-invoice portal (IRP), then paste the IRN and acknowledgement details back here. They are then printed on the invoice.',
  'compliance.einv.guide1.title': 'What this makes',
  'compliance.einv.guide1.body':
    'A JSON file in the NIC e-invoice format (version 1.1) with seller, buyer, items and totals that match your invoice to the paisa.',
  'compliance.einv.guide2.title': 'Fix anything missing',
  'compliance.einv.guide2.body':
    'The list shows what the portal needs, such as the buyer GSTIN or a PIN code. Use "Fix this" to jump to the right screen.',
  'compliance.einv.guide3.title': 'Paste back the IRN',
  'compliance.einv.guide3.body':
    'After uploading, copy the IRN, acknowledgement number, date and signed QR text from the portal and paste them below.',
  'compliance.einv.supplyType': 'Type of supply',
  'compliance.einv.supply.B2B': 'B2B (business customer)',
  'compliance.einv.supply.SEZWP': 'SEZ with payment of tax',
  'compliance.einv.supply.SEZWOP': 'SEZ without payment of tax',
  'compliance.einv.ackTitle': 'After you have uploaded it',
  'compliance.einv.irn': 'IRN (64 characters)',
  'compliance.einv.ackNo': 'Acknowledgement number',
  'compliance.einv.ackDate': 'Acknowledgement date',
  'compliance.einv.signedQr': 'Signed QR code text',
  'compliance.einv.ackSave': 'Save IRN details',
  'compliance.einv.ackClear': 'Remove IRN details',
  'compliance.einv.ackSaved': 'IRN details saved. They will print on this invoice.',
  'compliance.einv.ackCleared': 'IRN details removed.',
  'compliance.einv.ackInvalid':
    'Check the IRN (64 letters and digits), the acknowledgement number (digits only) and the date (like 2026-11-10 12:30:00).',
  'compliance.bulk.title': 'E-way bill JSON for many invoices',
  'compliance.bulk.intro':
    'Pick a date range. All sale invoices of ₹50,000 or more that have everything needed go into one file.',
  'compliance.bulk.from': 'From date',
  'compliance.bulk.to': 'To date',
  'compliance.bulk.export': 'Make JSON file',
  'compliance.bulk.defaults':
    'Transport details below are used for every invoice. Leave them blank to add vehicle details on the portal.',
  'compliance.bulk.done': '{{count}} invoice(s) saved in the file.',
  'compliance.bulk.none': 'No invoice in this range could be included.',
  'compliance.bulk.skipped': 'Not included ({{count}})',
  'compliance.bulk.notes': 'Included, but please check ({{count}})',
  'compliance.tally.title': 'Export to Tally',
  'compliance.tally.intro':
    'Make Tally Prime import files for your parties, items and vouchers. Import the masters first, then the vouchers.',
  'compliance.tally.guide1.title': 'Choose what to export',
  'compliance.tally.guide1.body':
    'Masters are your parties, items and units. Vouchers are your bills and payments in the dates you choose.',
  'compliance.tally.guide2.title': 'Match your Tally ledger names',
  'compliance.tally.guide2.body':
    'Change the ledger names if your Tally company already uses different ones, for example "Sales - GST 18%".',
  'compliance.tally.guide3.title': 'Import in Tally',
  'compliance.tally.guide3.body':
    'In Tally: Gateway of Tally, Import, Masters first and then Transactions. Pick the saved XML files.',
  'compliance.tally.from': 'From date',
  'compliance.tally.to': 'To date',
  'compliance.tally.masters': 'Masters (parties, items, units, ledgers)',
  'compliance.tally.vouchers': 'Vouchers (bills and payments)',
  'compliance.tally.kinds': 'Voucher types',
  'compliance.tally.kind.sale': 'Sales',
  'compliance.tally.kind.purchase': 'Purchase',
  'compliance.tally.kind.sale_return': 'Credit Note (sale return)',
  'compliance.tally.kind.purchase_return': 'Debit Note (purchase return)',
  'compliance.tally.kind.payment_in': 'Receipt (money in)',
  'compliance.tally.kind.payment_out': 'Payment (money out)',
  'compliance.tally.opening': 'Include opening balances of parties',
  'compliance.tally.company': 'Company name in Tally',
  'compliance.tally.ledgers': 'Ledger names in Tally',
  'compliance.tally.ledger.sales': 'Sales ledger',
  'compliance.tally.ledger.purchase': 'Purchase ledger',
  'compliance.tally.ledger.outputCgst': 'Output CGST',
  'compliance.tally.ledger.outputSgst': 'Output SGST',
  'compliance.tally.ledger.outputIgst': 'Output IGST',
  'compliance.tally.ledger.outputCess': 'Output Cess',
  'compliance.tally.ledger.inputCgst': 'Input CGST',
  'compliance.tally.ledger.inputSgst': 'Input SGST',
  'compliance.tally.ledger.inputIgst': 'Input IGST',
  'compliance.tally.ledger.inputCess': 'Input Cess',
  'compliance.tally.ledger.roundOff': 'Round off',
  'compliance.tally.ledger.discount': 'Discount on payments',
  'compliance.tally.ledger.cash': 'Cash (for walk-in sales)',
  'compliance.tally.counts':
    '{{ledgers}} ledgers · {{stockItems}} stock items · {{units}} units · {{vouchers}} vouchers',
  'compliance.tally.warn.duplicateParties':
    '{{count}} parties share a name with another party. They are renamed like "Asha (2)" because Tally needs unique names.',
  'compliance.tally.export': 'Save Tally XML',
  'compliance.tally.done': 'Saved {{count}} file(s). Import the masters file first.',
  'compliance.tally.pickOne': 'Choose masters, vouchers or both.',
  'compliance.tally.pickKinds': 'Choose at least one voucher type.',
  'compliance.print.irn': 'IRN',
  'compliance.print.ackNo': 'Ack No',
  'compliance.print.ackDate': 'Ack Date',
  'compliance.issue.ewbDocType': 'E-way bills can be made only for sale invoices and sale returns.',
  'compliance.issue.einvDocType':
    'E-invoices can be made only for sale invoices and credit notes (sale returns).',
  'compliance.issue.firmGstin':
    'Your business GSTIN is missing or not valid. Enter a valid 15-character GSTIN like 29ABCDE1234F1Z5 in your business profile.',
  'compliance.issue.firmAddress':
    'Your business address is empty. Add it in your business profile.',
  'compliance.issue.firmPincode':
    'Your business address has no 6-digit PIN code. Add it to the address in your business profile, for example "12 MG Road, Bengaluru 560001".',
  'compliance.issue.partyAddress':
    'This customer has no address. Add the billing address on the customer.',
  'compliance.issue.partyPincode':
    'The customer address has no 6-digit PIN code. Add it to the address.',
  'compliance.issue.partyGstinMissing':
    'The customer has no GSTIN, so the bill will be made for an unregistered buyer (URP). Add a GSTIN if they are registered.',
  'compliance.issue.partyGstin': 'The customer GSTIN is not valid. Check it for typing mistakes.',
  'compliance.issue.itemHsn':
    'Line {{line}} ({{name}}) needs a 4 to 8 digit HSN or SAC code. Add it on the item.',
  'compliance.issue.ewbDocNo':
    'Invoice number {{number}} can only use letters, digits, / and -, up to 16 characters.',
  'compliance.issue.einvDocNo':
    'Invoice number {{number}} is not accepted by the e-invoice portal. Use at most 16 capital letters, digits, / or -, and do not start with 0. Change the invoice prefix in settings.',
  'compliance.issue.vehicleFormat':
    'The vehicle number looks wrong. Use a format like KA01AB1234 or 22BH1234AB.',
  'compliance.issue.transporterId': 'Transporter ID must be a valid 15-character GSTIN.',
  'compliance.issue.belowThreshold':
    'This invoice is below ₹50,000, so an e-way bill is usually not needed. You can still make one.',
  'compliance.issue.partB':
    'No vehicle number or transporter yet. You can add the vehicle details later on the portal.',
  'compliance.issue.transDoc':
    'For rail, air or ship, add the transport document number (RR, airway bill or bill of lading).',
  'compliance.issue.buyerGstin':
    'E-invoice is for registered business buyers. Add the customer GSTIN.',
  'compliance.issue.sameGstin': 'Seller and buyer GSTIN are the same. Check the customer GSTIN.',
  'compliance.issue.shipPincode':
    'The shipping address has no PIN code, so ship-to details will be left out of the file.',
  'compliance.issue.docDateFuture':
    'The invoice date is in the future. The portal rejects future dates.',
  'compliance.issue.creditNoteRef':
    'This credit note is not linked to an original invoice. Link it when you create the return.',
  'compliance.issue.gstRate':
    '{{name}}: GST rate {{rate}}% is not one of the rates the portal accepts.',
  'help.compliance-eway-overview.title': 'E-way bill',
  'help.compliance-eway-overview.body':
    'An e-way bill is a permit to move goods worth more than ₹50,000. This file lets you upload many details to the portal at once instead of typing them.',
  'help.compliance-eway-overview.example': 'Goods worth ₹80,000 sent by truck to another city',
  'help.compliance-eway-transporter.title': 'Transporter',
  'help.compliance-eway-transporter.body':
    'If a transport company carries the goods, enter its name and its GSTIN (transporter ID). The transporter can then add the vehicle on the portal.',
  'help.compliance-eway-transporter.example': '29ABCDE1234F1Z5',
  'help.compliance-eway-mode.title': 'Mode of transport',
  'help.compliance-eway-mode.body':
    'Choose how the goods travel. For rail, air or ship you also need the transport document number.',
  'help.compliance-eway-mode.example': 'Road for a truck or tempo',
  'help.compliance-eway-distance.title': 'Distance',
  'help.compliance-eway-distance.body':
    'Approximate distance in kilometres from your place to the delivery place. Enter 0 and the portal works it out from the PIN codes.',
  'help.compliance-eway-distance.example': '350',
  'help.compliance-eway-vehicle.title': 'Vehicle number',
  'help.compliance-eway-vehicle.body':
    'The registration number of the truck or tempo, without spaces. Leave it blank if you do not know it yet.',
  'help.compliance-eway-vehicle.example': 'KA01AB1234',
  'help.compliance-eway-vehicleType.title': 'Vehicle type',
  'help.compliance-eway-vehicleType.body':
    'Choose Regular for normal vehicles. Choose over-dimensional cargo only for very large or heavy loads that need a special permit.',
  'help.compliance-eway-vehicleType.example': 'Regular',
  'help.compliance-eway-docNo.title': 'Transport document',
  'help.compliance-eway-docNo.body':
    'The number on the lorry receipt, railway receipt, airway bill or bill of lading. Needed for rail, air and ship.',
  'help.compliance-eway-docNo.example': 'LR-4521',
  'help.compliance-eway-docDate.title': 'Transport document date',
  'help.compliance-eway-docDate.body': 'The date printed on the transport document.',
  'help.compliance-eway-docDate.example': '10-11-2026',
  'help.compliance-eway-ewbNo.title': 'E-way bill number',
  'help.compliance-eway-ewbNo.body':
    'After you upload the file, the portal gives a 12-digit number. Type it here to keep it with the invoice.',
  'help.compliance-eway-ewbNo.example': '341001234567',
  'help.compliance-einv-overview.title': 'E-invoice',
  'help.compliance-einv-overview.body':
    'Businesses above the turnover limit must register each B2B invoice on the e-invoice portal. The portal returns an IRN, a unique number for the invoice.',
  'help.compliance-einv-overview.example': 'IRN: a 64-character code',
  'help.compliance-einv-supply.title': 'Type of supply',
  'help.compliance-einv-supply.body':
    'Choose B2B for a normal sale to a registered business. Choose SEZ only when the buyer is in a Special Economic Zone.',
  'help.compliance-einv-supply.example': 'B2B',
  'help.compliance-einv-irn.title': 'IRN',
  'help.compliance-einv-irn.body':
    'Invoice Reference Number. The portal shows a 64-character code after it accepts your invoice. Copy and paste it here.',
  'help.compliance-einv-irn.example': 'a1b2c3… (64 letters and digits)',
  'help.compliance-einv-ackNo.title': 'Acknowledgement number',
  'help.compliance-einv-ackNo.body':
    'A number the portal gives together with the IRN. It contains only digits.',
  'help.compliance-einv-ackNo.example': '112010012345678',
  'help.compliance-einv-ackDate.title': 'Acknowledgement date',
  'help.compliance-einv-ackDate.body': 'The date and time the portal accepted the invoice.',
  'help.compliance-einv-ackDate.example': '2026-11-10 12:30:00',
  'help.compliance-einv-qr.title': 'Signed QR code text',
  'help.compliance-einv-qr.body':
    'A long text starting with "eyJ" that the portal gives as the signed QR code. We turn it into a QR code on the printed invoice.',
  'help.compliance-einv-qr.example': 'eyJhbGciOiJSUzI1NiIs…',
  'help.compliance-bulk-range.title': 'Date range',
  'help.compliance-bulk-range.body':
    'All sale invoices dated between these two days are checked. Only those that need an e-way bill and are complete go into the file.',
  'help.compliance-bulk-range.example': '1 April to 30 April',
  'help.compliance-tally-overview.title': 'How to import in Tally',
  'help.compliance-tally-overview.body':
    'Open your company in Tally Prime. Go to Gateway of Tally, then Import, then Masters, and pick the masters file. Repeat with Import, Transactions for the vouchers file. Import masters first.',
  'help.compliance-tally-overview.example': 'Gateway of Tally > Import > Masters',
  'help.compliance-tally-range.title': 'Date range',
  'help.compliance-tally-range.body':
    'Only vouchers dated between these days are exported. Masters are not affected by the dates.',
  'help.compliance-tally-range.example': '1 April to 31 March',
  'help.compliance-tally-masters.title': 'Masters',
  'help.compliance-tally-masters.body':
    'Parties become ledgers under Sundry Debtors or Sundry Creditors, items become stock items with HSN and GST rate, and units are created too.',
  'help.compliance-tally-masters.example': 'Asha Traders, Notebook, Nos',
  'help.compliance-tally-vouchers.title': 'Vouchers',
  'help.compliance-tally-vouchers.body':
    'Your bills and payments. Payments received with a bill become separate Receipt vouchers so party balances match.',
  'help.compliance-tally-vouchers.example': 'Sales, Purchase, Credit Note, Receipt',
  'help.compliance-tally-opening.title': 'Opening balances',
  'help.compliance-tally-opening.body':
    'Turn this on only for a new, empty Tally company. If the company already has balances, leave it off to avoid doubling them.',
  'help.compliance-tally-opening.example': 'Off for an existing company',
  'help.compliance-tally-company.title': 'Company name',
  'help.compliance-tally-company.body':
    'It must match the company name open in Tally exactly, including spaces and capital letters.',
  'help.compliance-tally-company.example': 'Asha Kirana Store',
  'help.compliance-tally-ledgers.title': 'Ledger names',
  'help.compliance-tally-ledgers.body':
    'Sales, purchase and tax entries go to these Tally ledgers. If your Tally already has ledgers with other names, type those names here. Missing ledgers are created with the masters file.',
  'help.compliance-tally-ledgers.example': 'Output CGST 9%',
};

export const hi: Messages = {
  'compliance.title': 'जीएसटी कंप्लायंस और अकाउंटिंग एक्सपोर्ट',
  'compliance.intro':
    'ई-वे बिल और ई-इनवॉइस पोर्टल के लिए फ़ाइल बनाएँ, या अपना हिसाब Tally में ले जाएँ। कुछ भी कहीं भेजा नहीं जाता: आप फ़ाइल सेव करके खुद अपलोड करते हैं।',
  'compliance.eway.open': 'ई-वे बिल JSON',
  'compliance.einv.open': 'ई-इनवॉइस JSON',
  'compliance.badge.ewb': 'ई-वे बिल {{no}}',
  'compliance.badge.irn': 'IRN सेव है',
  'compliance.guide.show': 'गाइड दिखाएँ',
  'compliance.guide.skip': 'गाइड छोड़ें',
  'compliance.guide.next': 'आगे',
  'compliance.guide.done': 'समझ गया',
  'compliance.guide.step': 'चरण {{current}} / {{total}}',
  'compliance.fix': 'ठीक करें',
  'compliance.mustFix': 'ज़रूरी सुधार',
  'compliance.check': 'कृपया जाँचें',
  'compliance.issues': 'सेव करने से पहले',
  'compliance.issues.none': 'ज़रूरी सारी जानकारी भरी है।',
  'compliance.summary':
    'बिल मूल्य {{total}} · करयोग्य {{taxable}} · जीएसटी {{tax}} · {{items}} आइटम',
  'compliance.save': 'JSON फ़ाइल सेव करें',
  'compliance.saved': 'फ़ाइल सेव हो गई।',
  'compliance.cannotSave': '"ज़रूरी सुधार" वाली बातें पहले ठीक करें, फिर फ़ाइल सेव करें।',
  'compliance.checking': 'बिल जाँचा जा रहा है…',
  'compliance.close': 'बंद करें',
  'compliance.eway.title': 'ई-वे बिल JSON',
  'compliance.eway.intro':
    'ट्रांसपोर्ट की जानकारी भरें, फ़ाइल सेव करें, फिर ई-वे बिल पोर्टल (Generate Bulk) पर अपलोड करें। वापस आकर पोर्टल से मिला ई-वे बिल नंबर लिख दें।',
  'compliance.eway.guide1.title': 'यह क्या बनाता है',
  'compliance.eway.guide1.body':
    'NIC ई-वे बिल फ़ॉर्मेट की JSON फ़ाइल, जिसमें आपका बिल, दोनों GSTIN, पते, आइटम और टैक्स पहले से भरे होते हैं।',
  'compliance.eway.guide2.title': 'ट्रांसपोर्ट की जानकारी भरें',
  'compliance.eway.guide2.body':
    'गाड़ी का नंबर और दूरी लिखें। अगर अभी पता नहीं तो खाली छोड़ें और बाद में पोर्टल पर जोड़ें।',
  'compliance.eway.guide3.title': 'अपलोड करें और नंबर लिखें',
  'compliance.eway.guide3.body':
    'ewaybillgst.gov.in पर फ़ाइल अपलोड करें, फिर 12 अंकों का ई-वे बिल नंबर यहाँ लिखें ताकि वह बिल के साथ सेव रहे।',
  'compliance.eway.transporterName': 'ट्रांसपोर्टर का नाम',
  'compliance.eway.transporterId': 'ट्रांसपोर्टर ID (GSTIN)',
  'compliance.eway.mode': 'ट्रांसपोर्ट का साधन',
  'compliance.eway.mode.road': 'सड़क',
  'compliance.eway.mode.rail': 'रेल',
  'compliance.eway.mode.air': 'हवाई',
  'compliance.eway.mode.ship': 'जहाज़',
  'compliance.eway.distance': 'दूरी (किमी)',
  'compliance.eway.vehicleNo': 'गाड़ी का नंबर',
  'compliance.eway.vehicleType': 'गाड़ी का प्रकार',
  'compliance.eway.vehicleType.regular': 'सामान्य',
  'compliance.eway.vehicleType.odc': 'ओवर-डाइमेंशनल माल',
  'compliance.eway.docNo': 'ट्रांसपोर्ट दस्तावेज़ नंबर',
  'compliance.eway.docDate': 'ट्रांसपोर्ट दस्तावेज़ की तारीख',
  'compliance.eway.ewbNo': 'पोर्टल से मिला ई-वे बिल नंबर',
  'compliance.eway.ewbNoSave': 'नंबर सेव करें',
  'compliance.eway.ewbNoSaved': 'ई-वे बिल नंबर इस बिल के साथ सेव हो गया।',
  'compliance.eway.ewbNoInvalid': 'ई-वे बिल नंबर में ठीक 12 अंक होते हैं।',
  'compliance.einv.title': 'ई-इनवॉइस JSON',
  'compliance.einv.intro':
    'फ़ाइल सेव करें, ई-इनवॉइस पोर्टल (IRP) पर अपलोड करें, फिर IRN और स्वीकृति की जानकारी यहाँ पेस्ट करें। तब वह बिल पर छपेगी।',
  'compliance.einv.guide1.title': 'यह क्या बनाता है',
  'compliance.einv.guide1.body':
    'NIC ई-इनवॉइस फ़ॉर्मेट (संस्करण 1.1) की JSON फ़ाइल, जिसमें विक्रेता, खरीदार, आइटम और कुल रकम आपके बिल से पैसे-पैसे मिलती हैं।',
  'compliance.einv.guide2.title': 'जो कमी है उसे ठीक करें',
  'compliance.einv.guide2.body':
    'सूची में दिखता है कि पोर्टल को क्या चाहिए, जैसे खरीदार का GSTIN या पिन कोड। "ठीक करें" दबाकर सही स्क्रीन पर जाएँ।',
  'compliance.einv.guide3.title': 'IRN वापस पेस्ट करें',
  'compliance.einv.guide3.body':
    'अपलोड के बाद पोर्टल से IRN, स्वीकृति नंबर, तारीख और साइन्ड QR का टेक्स्ट कॉपी करके नीचे पेस्ट करें।',
  'compliance.einv.supplyType': 'सप्लाई का प्रकार',
  'compliance.einv.supply.B2B': 'B2B (व्यापारी ग्राहक)',
  'compliance.einv.supply.SEZWP': 'SEZ, टैक्स के भुगतान के साथ',
  'compliance.einv.supply.SEZWOP': 'SEZ, बिना टैक्स भुगतान',
  'compliance.einv.ackTitle': 'अपलोड करने के बाद',
  'compliance.einv.irn': 'IRN (64 अक्षर)',
  'compliance.einv.ackNo': 'स्वीकृति नंबर',
  'compliance.einv.ackDate': 'स्वीकृति की तारीख',
  'compliance.einv.signedQr': 'साइन्ड QR कोड का टेक्स्ट',
  'compliance.einv.ackSave': 'IRN की जानकारी सेव करें',
  'compliance.einv.ackClear': 'IRN की जानकारी हटाएँ',
  'compliance.einv.ackSaved': 'IRN की जानकारी सेव हो गई। यह इस बिल पर छपेगी।',
  'compliance.einv.ackCleared': 'IRN की जानकारी हटा दी गई।',
  'compliance.einv.ackInvalid':
    'IRN (64 अक्षर/अंक), स्वीकृति नंबर (सिर्फ़ अंक) और तारीख (जैसे 2026-11-10 12:30:00) जाँचें।',
  'compliance.bulk.title': 'कई बिलों के लिए ई-वे बिल JSON',
  'compliance.bulk.intro':
    'तारीखें चुनें। ₹50,000 या अधिक के जिन बिलों में सब जानकारी पूरी है, वे एक फ़ाइल में आ जाएँगे।',
  'compliance.bulk.from': 'से तारीख',
  'compliance.bulk.to': 'तक तारीख',
  'compliance.bulk.export': 'JSON फ़ाइल बनाएँ',
  'compliance.bulk.defaults':
    'नीचे की ट्रांसपोर्ट जानकारी हर बिल पर लगेगी। गाड़ी की जानकारी पोर्टल पर जोड़ना चाहें तो खाली छोड़ें।',
  'compliance.bulk.done': 'फ़ाइल में {{count}} बिल सेव हुए।',
  'compliance.bulk.none': 'इन तारीखों में कोई बिल शामिल नहीं हो सका।',
  'compliance.bulk.skipped': 'शामिल नहीं ({{count}})',
  'compliance.bulk.notes': 'शामिल, पर कृपया जाँचें ({{count}})',
  'compliance.tally.title': 'Tally में एक्सपोर्ट',
  'compliance.tally.intro':
    'अपनी पार्टियों, आइटम और वाउचर के लिए Tally Prime इम्पोर्ट फ़ाइलें बनाएँ। पहले मास्टर, फिर वाउचर इम्पोर्ट करें।',
  'compliance.tally.guide1.title': 'चुनें क्या भेजना है',
  'compliance.tally.guide1.body':
    'मास्टर यानी पार्टी, आइटम और यूनिट। वाउचर यानी चुनी तारीखों के बिल और भुगतान।',
  'compliance.tally.guide2.title': 'Tally के लेजर नाम मिलाएँ',
  'compliance.tally.guide2.body':
    'अगर आपके Tally में लेजर के नाम अलग हैं तो यहाँ बदल लें, जैसे "Sales - GST 18%"।',
  'compliance.tally.guide3.title': 'Tally में इम्पोर्ट करें',
  'compliance.tally.guide3.body':
    'Tally में: Gateway of Tally, Import, पहले Masters फिर Transactions। सेव की हुई XML फ़ाइलें चुनें।',
  'compliance.tally.from': 'से तारीख',
  'compliance.tally.to': 'तक तारीख',
  'compliance.tally.masters': 'मास्टर (पार्टी, आइटम, यूनिट, लेजर)',
  'compliance.tally.vouchers': 'वाउचर (बिल और भुगतान)',
  'compliance.tally.kinds': 'वाउचर के प्रकार',
  'compliance.tally.kind.sale': 'बिक्री (Sales)',
  'compliance.tally.kind.purchase': 'खरीद (Purchase)',
  'compliance.tally.kind.sale_return': 'क्रेडिट नोट (बिक्री वापसी)',
  'compliance.tally.kind.purchase_return': 'डेबिट नोट (खरीद वापसी)',
  'compliance.tally.kind.payment_in': 'रसीद (पैसा आया)',
  'compliance.tally.kind.payment_out': 'भुगतान (पैसा गया)',
  'compliance.tally.opening': 'पार्टियों का ओपनिंग बैलेंस शामिल करें',
  'compliance.tally.company': 'Tally में कंपनी का नाम',
  'compliance.tally.ledgers': 'Tally में लेजर के नाम',
  'compliance.tally.ledger.sales': 'बिक्री लेजर',
  'compliance.tally.ledger.purchase': 'खरीद लेजर',
  'compliance.tally.ledger.outputCgst': 'आउटपुट CGST',
  'compliance.tally.ledger.outputSgst': 'आउटपुट SGST',
  'compliance.tally.ledger.outputIgst': 'आउटपुट IGST',
  'compliance.tally.ledger.outputCess': 'आउटपुट सेस',
  'compliance.tally.ledger.inputCgst': 'इनपुट CGST',
  'compliance.tally.ledger.inputSgst': 'इनपुट SGST',
  'compliance.tally.ledger.inputIgst': 'इनपुट IGST',
  'compliance.tally.ledger.inputCess': 'इनपुट सेस',
  'compliance.tally.ledger.roundOff': 'राउंड ऑफ़',
  'compliance.tally.ledger.discount': 'भुगतान पर छूट',
  'compliance.tally.ledger.cash': 'नकद (वॉक-इन बिक्री के लिए)',
  'compliance.tally.counts':
    '{{ledgers}} लेजर · {{stockItems}} स्टॉक आइटम · {{units}} यूनिट · {{vouchers}} वाउचर',
  'compliance.tally.warn.duplicateParties':
    '{{count}} पार्टियों के नाम दूसरी पार्टी से मिलते हैं। Tally में नाम अलग-अलग चाहिए, इसलिए उन्हें "Asha (2)" जैसा बदला गया है।',
  'compliance.tally.export': 'Tally XML सेव करें',
  'compliance.tally.done': '{{count}} फ़ाइल सेव हुईं। पहले मास्टर फ़ाइल इम्पोर्ट करें।',
  'compliance.tally.pickOne': 'मास्टर, वाउचर या दोनों चुनें।',
  'compliance.tally.pickKinds': 'कम से कम एक वाउचर प्रकार चुनें।',
  'compliance.print.irn': 'IRN',
  'compliance.print.ackNo': 'स्वीकृति सं.',
  'compliance.print.ackDate': 'स्वीकृति तिथि',
  'compliance.issue.ewbDocType': 'ई-वे बिल सिर्फ़ बिक्री बिल और बिक्री वापसी के लिए बन सकता है।',
  'compliance.issue.einvDocType':
    'ई-इनवॉइस सिर्फ़ बिक्री बिल और क्रेडिट नोट (बिक्री वापसी) के लिए बन सकता है।',
  'compliance.issue.firmGstin':
    'आपके व्यापार का GSTIN नहीं है या गलत है। बिज़नेस प्रोफ़ाइल में 29ABCDE1234F1Z5 जैसा सही 15 अक्षर का GSTIN भरें।',
  'compliance.issue.firmAddress': 'आपके व्यापार का पता खाली है। बिज़नेस प्रोफ़ाइल में जोड़ें।',
  'compliance.issue.firmPincode':
    'आपके व्यापार के पते में 6 अंकों का पिन कोड नहीं है। बिज़नेस प्रोफ़ाइल में पते के साथ जोड़ें, जैसे "12 MG Road, Bengaluru 560001"।',
  'compliance.issue.partyAddress': 'इस ग्राहक का पता नहीं है। ग्राहक में बिलिंग पता जोड़ें।',
  'compliance.issue.partyPincode': 'ग्राहक के पते में 6 अंकों का पिन कोड नहीं है। पते में जोड़ें।',
  'compliance.issue.partyGstinMissing':
    'ग्राहक का GSTIN नहीं है, इसलिए बिल अपंजीकृत खरीदार (URP) के लिए बनेगा। अगर वे पंजीकृत हैं तो GSTIN जोड़ें।',
  'compliance.issue.partyGstin': 'ग्राहक का GSTIN सही नहीं है। टाइपिंग की गलती जाँचें।',
  'compliance.issue.itemHsn':
    'लाइन {{line}} ({{name}}) के लिए 4 से 8 अंकों का HSN या SAC कोड चाहिए। आइटम में जोड़ें।',
  'compliance.issue.ewbDocNo':
    'बिल नंबर {{number}} में सिर्फ़ अक्षर, अंक, / और - हो सकते हैं, अधिकतम 16 अक्षर।',
  'compliance.issue.einvDocNo':
    'बिल नंबर {{number}} ई-इनवॉइस पोर्टल पर नहीं चलेगा। अधिकतम 16 अक्षर, केवल अंग्रेज़ी बड़े अक्षर, अंक, / या - रखें और 0 से शुरू न करें। सेटिंग्स में बिल का प्रीफ़िक्स बदलें।',
  'compliance.issue.vehicleFormat':
    'गाड़ी का नंबर गलत लग रहा है। KA01AB1234 या 22BH1234AB जैसा रखें।',
  'compliance.issue.transporterId': 'ट्रांसपोर्टर ID सही 15 अक्षर का GSTIN होना चाहिए।',
  'compliance.issue.belowThreshold':
    'यह बिल ₹50,000 से कम का है, इसलिए आमतौर पर ई-वे बिल की ज़रूरत नहीं। चाहें तो फिर भी बना सकते हैं।',
  'compliance.issue.partB':
    'अभी गाड़ी नंबर या ट्रांसपोर्टर नहीं भरा। गाड़ी की जानकारी बाद में पोर्टल पर जोड़ सकते हैं।',
  'compliance.issue.transDoc':
    'रेल, हवाई या जहाज़ के लिए ट्रांसपोर्ट दस्तावेज़ का नंबर (RR, एयरवे बिल या बिल ऑफ़ लेडिंग) जोड़ें।',
  'compliance.issue.buyerGstin':
    'ई-इनवॉइस पंजीकृत व्यापारी खरीदार के लिए होता है। ग्राहक का GSTIN जोड़ें।',
  'compliance.issue.sameGstin': 'विक्रेता और खरीदार का GSTIN एक ही है। ग्राहक का GSTIN जाँचें।',
  'compliance.issue.shipPincode':
    'शिपिंग पते में पिन कोड नहीं है, इसलिए फ़ाइल में शिप-टू की जानकारी नहीं जाएगी।',
  'compliance.issue.docDateFuture': 'बिल की तारीख भविष्य की है। पोर्टल भविष्य की तारीख नहीं मानता।',
  'compliance.issue.creditNoteRef':
    'यह क्रेडिट नोट किसी मूल बिल से जुड़ा नहीं है। वापसी बनाते समय उसे जोड़ें।',
  'compliance.issue.gstRate': '{{name}}: जीएसटी दर {{rate}}% पोर्टल की मान्य दरों में नहीं है।',
  'help.compliance-eway-overview.title': 'ई-वे बिल',
  'help.compliance-eway-overview.body':
    'ई-वे बिल ₹50,000 से अधिक का माल ले जाने की अनुमति है। यह फ़ाइल पोर्टल पर जानकारी बार-बार टाइप करने की जगह एक साथ अपलोड करने देती है।',
  'help.compliance-eway-overview.example': '₹80,000 का माल ट्रक से दूसरे शहर भेजना',
  'help.compliance-eway-transporter.title': 'ट्रांसपोर्टर',
  'help.compliance-eway-transporter.body':
    'अगर कोई ट्रांसपोर्ट कंपनी माल ले जा रही है तो उसका नाम और GSTIN (ट्रांसपोर्टर ID) लिखें। फिर वह पोर्टल पर गाड़ी जोड़ सकता है।',
  'help.compliance-eway-transporter.example': '29ABCDE1234F1Z5',
  'help.compliance-eway-mode.title': 'ट्रांसपोर्ट का साधन',
  'help.compliance-eway-mode.body':
    'चुनें कि माल कैसे जाएगा। रेल, हवाई या जहाज़ में ट्रांसपोर्ट दस्तावेज़ नंबर भी चाहिए।',
  'help.compliance-eway-mode.example': 'ट्रक या टेम्पो के लिए सड़क',
  'help.compliance-eway-distance.title': 'दूरी',
  'help.compliance-eway-distance.body':
    'आपकी जगह से डिलीवरी की जगह तक की लगभग दूरी किलोमीटर में। 0 लिखें तो पोर्टल पिन कोड से खुद निकाल लेगा।',
  'help.compliance-eway-distance.example': '350',
  'help.compliance-eway-vehicle.title': 'गाड़ी का नंबर',
  'help.compliance-eway-vehicle.body':
    'ट्रक या टेम्पो का रजिस्ट्रेशन नंबर, बिना खाली जगह के। पता न हो तो खाली छोड़ें।',
  'help.compliance-eway-vehicle.example': 'KA01AB1234',
  'help.compliance-eway-vehicleType.title': 'गाड़ी का प्रकार',
  'help.compliance-eway-vehicleType.body':
    'सामान्य गाड़ी के लिए सामान्य चुनें। ओवर-डाइमेंशनल सिर्फ़ बहुत बड़े या भारी माल के लिए चुनें जिसे विशेष परमिट चाहिए।',
  'help.compliance-eway-vehicleType.example': 'सामान्य',
  'help.compliance-eway-docNo.title': 'ट्रांसपोर्ट दस्तावेज़',
  'help.compliance-eway-docNo.body':
    'लॉरी रसीद, रेलवे रसीद, एयरवे बिल या बिल ऑफ़ लेडिंग का नंबर। रेल, हवाई और जहाज़ के लिए ज़रूरी है।',
  'help.compliance-eway-docNo.example': 'LR-4521',
  'help.compliance-eway-docDate.title': 'ट्रांसपोर्ट दस्तावेज़ की तारीख',
  'help.compliance-eway-docDate.body': 'ट्रांसपोर्ट दस्तावेज़ पर छपी तारीख।',
  'help.compliance-eway-docDate.example': '10-11-2026',
  'help.compliance-eway-ewbNo.title': 'ई-वे बिल नंबर',
  'help.compliance-eway-ewbNo.body':
    'फ़ाइल अपलोड करने पर पोर्टल 12 अंकों का नंबर देता है। उसे बिल के साथ रखने के लिए यहाँ लिखें।',
  'help.compliance-eway-ewbNo.example': '341001234567',
  'help.compliance-einv-overview.title': 'ई-इनवॉइस',
  'help.compliance-einv-overview.body':
    'तय टर्नओवर से ऊपर के व्यापारियों को हर B2B बिल ई-इनवॉइस पोर्टल पर दर्ज करना होता है। पोर्टल बिल के लिए IRN नाम का अनोखा नंबर देता है।',
  'help.compliance-einv-overview.example': 'IRN: 64 अक्षर का कोड',
  'help.compliance-einv-supply.title': 'सप्लाई का प्रकार',
  'help.compliance-einv-supply.body':
    'पंजीकृत व्यापारी को सामान्य बिक्री के लिए B2B चुनें। SEZ तभी चुनें जब खरीदार विशेष आर्थिक क्षेत्र में हो।',
  'help.compliance-einv-supply.example': 'B2B',
  'help.compliance-einv-irn.title': 'IRN',
  'help.compliance-einv-irn.body':
    'इनवॉइस रेफ़रेंस नंबर। बिल स्वीकार होने पर पोर्टल 64 अक्षर का कोड दिखाता है। उसे कॉपी करके यहाँ पेस्ट करें।',
  'help.compliance-einv-irn.example': 'a1b2c3… (64 अक्षर और अंक)',
  'help.compliance-einv-ackNo.title': 'स्वीकृति नंबर',
  'help.compliance-einv-ackNo.body':
    'IRN के साथ पोर्टल जो नंबर देता है। इसमें सिर्फ़ अंक होते हैं।',
  'help.compliance-einv-ackNo.example': '112010012345678',
  'help.compliance-einv-ackDate.title': 'स्वीकृति की तारीख',
  'help.compliance-einv-ackDate.body': 'जिस तारीख और समय पोर्टल ने बिल स्वीकार किया।',
  'help.compliance-einv-ackDate.example': '2026-11-10 12:30:00',
  'help.compliance-einv-qr.title': 'साइन्ड QR कोड का टेक्स्ट',
  'help.compliance-einv-qr.body':
    '"eyJ" से शुरू होने वाला लंबा टेक्स्ट जो पोर्टल साइन्ड QR कोड के रूप में देता है। हम उसे छपे बिल पर QR कोड बना देते हैं।',
  'help.compliance-einv-qr.example': 'eyJhbGciOiJSUzI1NiIs…',
  'help.compliance-bulk-range.title': 'तारीखें',
  'help.compliance-bulk-range.body':
    'इन दो तारीखों के बीच के सभी बिक्री बिल जाँचे जाते हैं। जिन्हें ई-वे बिल चाहिए और जो पूरे हैं, सिर्फ़ वही फ़ाइल में जाते हैं।',
  'help.compliance-bulk-range.example': '1 अप्रैल से 30 अप्रैल',
  'help.compliance-tally-overview.title': 'Tally में इम्पोर्ट कैसे करें',
  'help.compliance-tally-overview.body':
    'Tally Prime में अपनी कंपनी खोलें। Gateway of Tally, फिर Import, फिर Masters में जाकर मास्टर फ़ाइल चुनें। वाउचर फ़ाइल के लिए Import, Transactions में यही दोहराएँ। पहले मास्टर इम्पोर्ट करें।',
  'help.compliance-tally-overview.example': 'Gateway of Tally > Import > Masters',
  'help.compliance-tally-range.title': 'तारीखें',
  'help.compliance-tally-range.body':
    'सिर्फ़ इन दो तारीखों के बीच के वाउचर एक्सपोर्ट होते हैं। मास्टर पर तारीख का असर नहीं पड़ता।',
  'help.compliance-tally-range.example': '1 अप्रैल से 31 मार्च',
  'help.compliance-tally-masters.title': 'मास्टर',
  'help.compliance-tally-masters.body':
    'पार्टी Sundry Debtors या Sundry Creditors के लेजर बनती हैं, आइटम HSN और जीएसटी दर वाले स्टॉक आइटम बनते हैं, और यूनिट भी बनती हैं।',
  'help.compliance-tally-masters.example': 'आशा ट्रेडर्स, कॉपी, Nos',
  'help.compliance-tally-vouchers.title': 'वाउचर',
  'help.compliance-tally-vouchers.body':
    'आपके बिल और भुगतान। बिल के साथ मिला पैसा अलग रसीद वाउचर बनता है ताकि पार्टी का बैलेंस मेल खाए।',
  'help.compliance-tally-vouchers.example': 'Sales, Purchase, Credit Note, Receipt',
  'help.compliance-tally-opening.title': 'ओपनिंग बैलेंस',
  'help.compliance-tally-opening.body':
    'इसे सिर्फ़ नई, खाली Tally कंपनी के लिए चालू करें। अगर कंपनी में पहले से बैलेंस हैं तो बंद रखें, वरना दोगुने हो जाएँगे।',
  'help.compliance-tally-opening.example': 'पुरानी कंपनी के लिए बंद',
  'help.compliance-tally-company.title': 'कंपनी का नाम',
  'help.compliance-tally-company.body':
    'यह Tally में खुली कंपनी के नाम से बिल्कुल मिलना चाहिए, खाली जगह और अक्षरों के साथ।',
  'help.compliance-tally-company.example': 'आशा किराना स्टोर',
  'help.compliance-tally-ledgers.title': 'लेजर के नाम',
  'help.compliance-tally-ledgers.body':
    'बिक्री, खरीद और टैक्स की एंट्री इन Tally लेजर में जाती हैं। अगर आपके Tally में दूसरे नाम के लेजर हैं तो वही नाम यहाँ लिखें। जो लेजर नहीं हैं वे मास्टर फ़ाइल से बन जाते हैं।',
  'help.compliance-tally-ledgers.example': 'Output CGST 9%',
};
