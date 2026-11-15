/** UPI collection, YouPI-PG confirmation and bank statement matching. Keys are flat, like en.json. */
const en: Record<string, string> = {
  'nav.bankMatch': 'Match bank statement',
  'module.bankMatch': 'Check which UPI and bank payments really reached your bank account.',
  'settings.payments': 'Payments',

  /* customer-facing second screen */
  'payments.display.title': 'Pay by UPI',
  'payments.display.pay': 'Pay to',
  'payments.display.scan': 'Scan with any UPI app',
  'payments.display.waiting': 'Waiting for payment',
  'payments.display.thanks': 'Thank you. Payment received.',

  /* Collect dialog */
  'payments.collect': 'Collect via UPI',
  'payments.collect.title': 'Collect payment by UPI',
  'payments.collect.desc': 'Show this QR to the customer. Their UPI app fills in the amount.',
  'payments.collect.starting': 'Preparing the QR…',
  'payments.amount': 'Amount to collect',
  'payments.updateQr': 'Update QR',
  'payments.invoice': 'Invoice',
  'payments.customer': 'Customer',
  'payments.walkIn': 'Walk-in customer',
  'payments.payTo': 'Pay to',
  'payments.balance': 'Invoice balance',
  'payments.timeLeft': 'Time left {{time}}',
  'payments.expired': 'This QR has expired.',
  'payments.newQr': 'Make a new QR',
  'payments.secondScreen': 'Open on second screen',
  'payments.secondScreenClose': 'Close second screen',
  'payments.secondScreenOpened': 'QR is now showing on the customer screen.',
  'payments.close': 'Close',
  'payments.cancelQr': 'Cancel this QR',
  'payments.status.waiting': 'Waiting for the customer to pay…',
  'payments.status.watching': 'Watching for the bank alert through your YouPI gateway.',
  'payments.status.offline':
    'Cannot reach the YouPI gateway right now. You can still confirm by hand below.',
  'payments.status.seen': 'Payment seen (not yet confirmed by bank)',
  'payments.status.seenBody': '{{amount}} seen from bank alert · UTR {{utr}} — Record payment?',
  'payments.status.seenNoUtr': '{{amount}} seen from bank alert — Record payment?',
  'payments.status.seenNote':
    'A bank alert is not proof. The payment will show as "Seen" until your bank statement confirms it.',
  'payments.status.review':
    'The gateway wants a manual check for this payment. Record it by hand only if you can see the money in your bank.',
  'payments.status.failed': 'The gateway did not see a matching payment in time.',
  'payments.status.cancelled': 'This payment request was cancelled.',
  'payments.status.recorded': 'Payment recorded against the invoice.',
  'payments.recordSeen': 'Record payment',
  'payments.openCheckout': 'Open YouPI checkout',
  'payments.openCheckoutHelp':
    'YouPI starts watching only after its checkout page is opened. Open it once on this computer.',
  'payments.customerSaysPaid': 'Customer says paid?',
  'payments.utr': 'UTR (12-digit reference)',
  'payments.utrPlaceholder': '12 digits, for example 401537805904',
  'payments.last4': "Payer's last 4 digits (optional)",
  'payments.recordPayment': 'Record payment',
  'payments.recordedToast': 'Payment recorded against the invoice.',
  'payments.needParty': 'Choose a customer on this invoice first, then you can record the payment.',
  'payments.goSettings': 'Open payment settings',
  'payments.manualOnly': 'No payment gateway connected. You confirm each payment by hand.',
  'payments.gatewayUsed': 'YouPI gateway connected',
  'payments.error.noUpiId': 'Add your UPI ID in Settings → Payments to show a QR.',
  'payments.error.notPayable': 'This invoice has nothing left to collect.',
  'payments.error.badAmount': 'Enter an amount above zero and not more than the invoice balance.',
  'payments.error.badUtr':
    'The UTR is the 12-digit number in the customer’s UPI app, like 401537805904.',
  'payments.error.badLast4': 'Enter exactly 4 digits, or leave it empty.',
  'payments.error.noParty': 'Choose a customer on this invoice first.',
  'payments.error.overpayment': 'That is more than the invoice still owes.',
  'payments.error.duplicateUtr': 'A payment with this UTR is already recorded.',
  'payments.error.storage': 'The payment could not be saved. Please try again.',
  'payments.error.notRecordable': 'This payment request is already closed. Make a new QR.',

  /* YouPI problems, shown in plain words */
  'payments.problem.unreachable':
    'Cannot reach the YouPI gateway. Check that it is running and the address is right.',
  'payments.problem.timeout': 'The YouPI gateway took too long to answer.',
  'payments.problem.auth': 'YouPI did not accept the Merchant ID or API key.',
  'payments.problem.mismatch': 'YouPI already has this order with a different amount.',
  'payments.problem.busy': 'YouPI says this order is busy on another device.',
  'payments.problem.blocked': 'YouPI blocked this request.',
  'payments.problem.observers':
    'YouPI says no bank-alert observer is online. Open the observer app on your phone.',
  'payments.problem.rejected': 'YouPI did not accept the request.',
  'payments.problem.notFound': 'YouPI could not find that item.',
  'payments.problem.badResponse': 'YouPI sent an answer we did not understand.',
  'payments.problem.server': 'The YouPI gateway reported an internal error.',
  'payments.problem.config': 'Fill in the gateway address, Merchant ID and API key first.',
  'payments.problem.noSecureStorage':
    'Windows secure storage is not available, so keys cannot be saved safely.',
  'payments.problem.fallback': 'Using manual confirmation instead.',

  /* badges and alerts */
  'payments.badge.upi': 'UPI',
  'payments.badge.seen': 'Seen',
  'payments.badge.confirmed': 'Confirmed',
  'payments.badge.upi.tip': 'Paid by UPI. Not checked against the bank yet.',
  'payments.badge.seen.tip':
    'Payment seen in a bank alert. Not yet confirmed by the bank statement.',
  'payments.badge.confirmed.tip': 'Confirmed by the bank statement.',
  'payments.alert.seen_one': '{{count}} UPI payment seen but not confirmed',
  'payments.alert.seen_other': '{{count}} UPI payments seen but not confirmed',
  'payments.alert.seenBody':
    'A bank alert showed the money, but your bank statement has not confirmed it yet.',
  'payments.alert.waiting_one': '{{count}} payment seen by the gateway is waiting to be recorded',
  'payments.alert.waiting_other':
    '{{count}} payments seen by the gateway are waiting to be recorded',
  'payments.alert.action': 'Match bank statement',
  'payments.alert.check': 'Check now',
  'payments.alert.confirmedToast_one': '{{count}} payment confirmed by bank statement',
  'payments.alert.confirmedToast_other': '{{count}} payments confirmed by bank statement',

  /* Settings → Payments */
  'payments.settings.title': 'UPI payments',
  'payments.settings.body':
    'Show a UPI QR on invoices and collect payments from the customer’s phone.',
  'payments.settings.upiId': 'Your UPI ID',
  'payments.settings.upiIdPlaceholder': 'name@bank',
  'payments.settings.upiIdError': 'Enter a UPI ID like sharma.store@okhdfcbank',
  'payments.settings.payee': 'Name shown to the customer',
  'payments.settings.payeePlaceholder': 'Shop name',
  'payments.settings.showQr': 'Show UPI QR on invoices',
  'payments.settings.saved': 'Payment settings saved',
  'payments.settings.save': 'Save payment settings',
  'payments.youpi.title': 'Payment confirmation with YouPI (optional)',
  'payments.youpi.explain':
    'YouPI is a free, self-hosted tool that reads your bank’s credit alerts and tells BillSathi that money arrived. It is experimental, not a regulated payment gateway, and needs the YouPI server running on your computer plus its observer app on your Android phone. Without it, BillSathi still works: you confirm payments by hand.',
  'payments.youpi.enabled': 'Use YouPI to watch for payments',
  'payments.youpi.baseUrl': 'Gateway address',
  'payments.youpi.merchantId': 'Merchant ID',
  'payments.youpi.apiKey': 'API key',
  'payments.youpi.adminToken': 'Admin token (only to send bank statements)',
  'payments.youpi.saved': 'Saved securely',
  'payments.youpi.keep': 'Leave empty to keep the saved value',
  'payments.youpi.remove': 'Remove saved value',
  'payments.youpi.noStorage':
    'Windows secure storage is not available on this computer, so keys cannot be saved.',
  'payments.youpi.privacy': 'BillSathi only talks to the address above, and only when you use it.',
  'payments.youpi.test': 'Test connection',
  'payments.youpi.testing': 'Testing…',
  'payments.youpi.test.ok': 'Connected. The gateway answered and the keys were accepted.',
  'payments.youpi.test.okNoKeys':
    'The gateway answered. Add the Merchant ID and API key to finish.',
  'payments.youpi.test.green': 'Phone observer and Gmail are both online.',
  'payments.youpi.test.yellow':
    'One observer is online. Payments may take a little longer to appear.',
  'payments.youpi.test.red': 'No observer is online. Open the observer app on your phone.',
  'payments.webhook.title': 'Instant updates (advanced)',
  'payments.webhook.enabled': 'Receive YouPI notifications on this computer',
  'payments.webhook.port': 'Local port',
  'payments.webhook.secret': 'Webhook secret',
  'payments.webhook.note':
    'Listens only on this computer (127.0.0.1). YouPI must be allowed to send to a local address. Off by default; status checks work without it.',

  /* bank statement matching */
  'payments.statement.title': 'Match bank statement',
  'payments.statement.body':
    'Upload the statement you downloaded from your bank. BillSathi finds which UPI and bank payments really arrived.',
  'payments.statement.choose': 'Choose statement file',
  'payments.statement.formats': 'CSV or Excel (.xlsx) from any bank',
  'payments.statement.emptyTitle': 'No statement loaded yet',
  'payments.statement.emptyBody':
    'Download your account statement as CSV or Excel from net banking, then choose it here.',
  'payments.statement.file': '{{name}} · {{rows}} rows',
  'payments.statement.map': 'Which column is which?',
  'payments.statement.col.date': 'Date',
  'payments.statement.col.narration': 'Description / narration',
  'payments.statement.col.credit': 'Money in (credit)',
  'payments.statement.col.debit': 'Money out (debit)',
  'payments.statement.col.utr': 'Reference / UTR',
  'payments.statement.none': 'Not in my file',
  'payments.statement.preview': 'First rows of your file',
  'payments.statement.match': 'Find matches',
  'payments.statement.mapError': 'Choose the date, description and money-in columns.',
  'payments.statement.summary':
    '{{credits}} credits in the file · {{open}} payments waiting for the bank',
  'payments.statement.matched': 'Matched',
  'payments.statement.matchedBody': 'Same reference or one clear match on amount and date.',
  'payments.statement.possible': 'Possible',
  'payments.statement.possibleBody': 'Could be more than one payment. Pick the right one or skip.',
  'payments.statement.unmatched': 'Not matched',
  'payments.statement.unmatchedBody':
    'Bank credits with no recorded UPI or bank payment. These may be cash deposits or payments you have not recorded.',
  'payments.statement.reason.utr': 'Same UTR',
  'payments.statement.reason.amountDate': 'Same amount and date',
  'payments.statement.reason.ambiguous': 'More than one possible payment',
  'payments.statement.reason.amountDiffers': 'Same UTR but a different amount',
  'payments.statement.skip': 'Skip',
  'payments.statement.confirm': 'Confirm {{count}} selected',
  'payments.statement.confirmed_one': '{{count}} payment confirmed',
  'payments.statement.confirmed_other': '{{count}} payments confirmed',
  'payments.statement.nothing': 'Nothing in this list.',
  'payments.statement.push': 'Also send to YouPI',
  'payments.statement.pushDone':
    'Sent to YouPI: {{reconciled}} reconciled, {{conflicts}} need review, {{unmatched}} not matched.',
  'payments.statement.another': 'Choose another file',
  'payments.statement.pushHelp':
    'YouPI confirms its own orders from the same statement. Needs the admin token in Settings → Payments.',
  'payments.statement.pickLabel': 'Choose payment for the credit of {{amount}} on {{date}}',

  /* tours */
  'payments.tour.qr': 'Show the QR',
  'payments.tour.qrBody':
    'The customer scans this with any UPI app. The amount is already filled in. Use "Open on second screen" to show it on the customer’s side.',
  'payments.tour.status': 'Watch the status',
  'payments.tour.statusBody':
    'With YouPI connected, the screen tells you when a bank alert for this amount arrives. Without it, wait for the customer to show you the payment.',
  'payments.tour.manual': 'Confirm by hand',
  'payments.tour.manualBody':
    'Tap "Customer says paid?" and type the 12-digit UTR from their phone. The payment is recorded against this invoice.',
  'payments.tour.stmtFile': 'Load your statement',
  'payments.tour.stmtFileBody': 'Choose the CSV or Excel statement from your bank.',
  'payments.tour.stmtMap': 'Check the columns',
  'payments.tour.stmtMapBody':
    'We guess which column is the date, narration and credit. Fix them if needed.',
  'payments.tour.stmtResult': 'Confirm the matches',
  'payments.tour.stmtResultBody':
    'Tick the matches that look right and confirm. Those payments get a "Confirmed" badge.',
  'payments.tour.next': 'Next',
  'payments.tour.skip': 'Skip tips',
  'payments.tour.done': 'Got it',

  /* help tips */
  'help.payments-amount.title': 'Amount to collect',
  'help.payments-amount.body':
    'It starts as the full invoice balance. Lower it if the customer is paying only part now, then press Update QR.',
  'help.payments-amount.example': 'Invoice ₹5,000, customer pays ₹2,000 now: enter 2000',
  'help.payments-utr.title': 'UTR',
  'help.payments-utr.body':
    'UTR is the 12-digit number in the customer’s UPI app after paying. It is also called UPI reference or transaction ID. It lets you match the payment with your bank statement later.',
  'help.payments-utr.example': '401537805904',
  'help.payments-last4.title': 'Payer’s last 4 digits',
  'help.payments-last4.body':
    'Optional. The last four digits of the customer’s phone number or bank account, only to help you recognise the payment later.',
  'help.payments-last4.example': '4821',
  'help.payments-seen.title': 'Seen is not confirmed',
  'help.payments-seen.body':
    'Seen means a bank alert (SMS or email) showed this amount. Alerts can be wrong or forged, so the payment is only Confirmed after your bank statement shows it.',
  'help.payments-seen.example': 'Seen → Confirmed after you match the statement',
  'help.payments-upiid.title': 'Your UPI ID',
  'help.payments-upiid.body':
    'The ID customers pay, in the form name@bank. Find it in your UPI app under profile or QR code.',
  'help.payments-upiid.example': 'sharma.store@okhdfcbank',
  'help.payments-payee.title': 'Name shown to the customer',
  'help.payments-payee.body':
    'The customer sees this name in their UPI app before paying. Leave empty to use your shop name.',
  'help.payments-payee.example': 'Sharma General Store',
  'help.payments-showqr.title': 'UPI QR on invoices',
  'help.payments-showqr.body':
    'Prints a QR on every invoice that the customer can scan to pay the balance.',
  'help.payments-showqr.example': 'On: the QR appears next to your bank details',
  'help.payments-youpi.title': 'What is YouPI?',
  'help.payments-youpi.body':
    'YouPI is an optional, free tool you run yourself. It reads bank credit alerts from your phone and tells BillSathi a payment was seen. It is experimental and not a regulated gateway, so BillSathi never marks an invoice paid until you click Record payment.',
  'help.payments-youpi.example': 'Skip it if you prefer to confirm each payment yourself',
  'help.payments-baseurl.title': 'Gateway address',
  'help.payments-baseurl.body':
    'Where your YouPI payment service is running. On the same computer it is usually the default.',
  'help.payments-baseurl.example': 'http://localhost:6100',
  'help.payments-merchant.title': 'Merchant ID',
  'help.payments-merchant.body':
    'The merchant ID from your YouPI admin page. It tells YouPI which shop the order belongs to.',
  'help.payments-merchant.example': '00000000-0000-0000-0000-000000000001',
  'help.payments-apikey.title': 'API key',
  'help.payments-apikey.body':
    'The secret key from your YouPI admin page. It is stored encrypted on this computer and is never shown again.',
  'help.payments-apikey.example': 'A long text copied from YouPI',
  'help.payments-admintoken.title': 'Admin token',
  'help.payments-admintoken.body':
    'Only needed if you want to send a bank statement to YouPI so it can confirm its own orders. Leave empty otherwise.',
  'help.payments-admintoken.example': 'Found in your YouPI server settings',
  'help.payments-webhook.title': 'Instant updates',
  'help.payments-webhook.body':
    'YouPI can notify BillSathi the moment it sees a payment. This opens a small listener on this computer only. Most shops do not need it, because BillSathi also checks every few seconds.',
  'help.payments-webhook.example': 'Port 6390 on 127.0.0.1',
  'help.payments-statement.title': 'Bank statement matching',
  'help.payments-statement.body':
    'Compare what your bank received with the UPI and bank payments you recorded. Matching payments become Confirmed. Nothing changes until you press Confirm.',
  'help.payments-statement.example': 'Download the last month’s statement from net banking',
  'help.payments-mapping.title': 'Columns of your statement',
  'help.payments-mapping.body':
    'Banks name columns differently. Tell BillSathi which column holds the date, the description, money in, and (optionally) the reference.',
  'help.payments-mapping.example': 'Deposit Amt. = money in',
};

const hi: Record<string, string> = {
  'nav.bankMatch': 'बैंक स्टेटमेंट मिलान',
  'module.bankMatch': 'देखें कि कौन से UPI और बैंक भुगतान सच में आपके बैंक खाते में आए।',
  'settings.payments': 'भुगतान',

  'payments.display.title': 'UPI से भुगतान करें',
  'payments.display.pay': 'भुगतान प्राप्तकर्ता',
  'payments.display.scan': 'किसी भी UPI ऐप से स्कैन करें',
  'payments.display.waiting': 'भुगतान की प्रतीक्षा',
  'payments.display.thanks': 'धन्यवाद। भुगतान मिल गया।',

  'payments.collect': 'UPI से वसूलें',
  'payments.collect.title': 'UPI से भुगतान लें',
  'payments.collect.desc': 'यह QR ग्राहक को दिखाएँ। उनके UPI ऐप में रकम अपने आप भर जाएगी।',
  'payments.collect.starting': 'QR तैयार हो रहा है…',
  'payments.amount': 'वसूली की रकम',
  'payments.updateQr': 'QR बदलें',
  'payments.invoice': 'इनवॉइस',
  'payments.customer': 'ग्राहक',
  'payments.walkIn': 'काउंटर का ग्राहक',
  'payments.payTo': 'भुगतान किसे',
  'payments.balance': 'इनवॉइस का बकाया',
  'payments.timeLeft': 'बचा समय {{time}}',
  'payments.expired': 'यह QR समाप्त हो गया है।',
  'payments.newQr': 'नया QR बनाएँ',
  'payments.secondScreen': 'दूसरी स्क्रीन पर खोलें',
  'payments.secondScreenClose': 'दूसरी स्क्रीन बंद करें',
  'payments.secondScreenOpened': 'QR अब ग्राहक की स्क्रीन पर दिख रहा है।',
  'payments.close': 'बंद करें',
  'payments.cancelQr': 'यह QR रद्द करें',
  'payments.status.waiting': 'ग्राहक के भुगतान की प्रतीक्षा…',
  'payments.status.watching': 'YouPI गेटवे के ज़रिए बैंक अलर्ट पर नज़र है।',
  'payments.status.offline':
    'अभी YouPI गेटवे से संपर्क नहीं हो पा रहा। आप नीचे हाथ से पुष्टि कर सकते हैं।',
  'payments.status.seen': 'भुगतान दिखा (बैंक से अभी पुष्टि नहीं)',
  'payments.status.seenBody': 'बैंक अलर्ट में {{amount}} दिखा · UTR {{utr}} — भुगतान दर्ज करें?',
  'payments.status.seenNoUtr': 'बैंक अलर्ट में {{amount}} दिखा — भुगतान दर्ज करें?',
  'payments.status.seenNote':
    'बैंक अलर्ट कोई सबूत नहीं है। बैंक स्टेटमेंट से पुष्टि होने तक यह भुगतान "दिखा" रहेगा।',
  'payments.status.review':
    'गेटवे इस भुगतान की हाथ से जाँच चाहता है। पैसा बैंक में दिखे तभी इसे हाथ से दर्ज करें।',
  'payments.status.failed': 'गेटवे को समय पर मेल खाता भुगतान नहीं दिखा।',
  'payments.status.cancelled': 'यह भुगतान अनुरोध रद्द कर दिया गया।',
  'payments.status.recorded': 'भुगतान इनवॉइस में दर्ज हो गया।',
  'payments.recordSeen': 'भुगतान दर्ज करें',
  'payments.openCheckout': 'YouPI चेकआउट खोलें',
  'payments.openCheckoutHelp':
    'YouPI तभी नज़र रखना शुरू करता है जब उसका चेकआउट पेज खुले। इसे इसी कंप्यूटर पर एक बार खोलें।',
  'payments.customerSaysPaid': 'ग्राहक कहता है भुगतान हो गया?',
  'payments.utr': 'UTR (12 अंकों का संदर्भ)',
  'payments.utrPlaceholder': '12 अंक, जैसे 401537805904',
  'payments.last4': 'भुगतानकर्ता के आख़िरी 4 अंक (वैकल्पिक)',
  'payments.recordPayment': 'भुगतान दर्ज करें',
  'payments.recordedToast': 'भुगतान इनवॉइस में दर्ज हो गया।',
  'payments.needParty': 'पहले इस इनवॉइस में ग्राहक चुनें, फिर भुगतान दर्ज कर सकेंगे।',
  'payments.goSettings': 'भुगतान सेटिंग खोलें',
  'payments.manualOnly': 'कोई पेमेंट गेटवे जुड़ा नहीं है। हर भुगतान आप हाथ से पक्का करते हैं।',
  'payments.gatewayUsed': 'YouPI गेटवे जुड़ा है',
  'payments.error.noUpiId': 'QR दिखाने के लिए सेटिंग → भुगतान में अपनी UPI ID जोड़ें।',
  'payments.error.notPayable': 'इस इनवॉइस में वसूलने को कुछ बाकी नहीं है।',
  'payments.error.badAmount': 'शून्य से ज़्यादा और इनवॉइस के बकाया से कम या बराबर रकम डालें।',
  'payments.error.badUtr':
    'UTR ग्राहक के UPI ऐप में दिखने वाला 12 अंकों का नंबर है, जैसे 401537805904।',
  'payments.error.badLast4': 'ठीक 4 अंक डालें या खाली छोड़ दें।',
  'payments.error.noParty': 'पहले इस इनवॉइस में ग्राहक चुनें।',
  'payments.error.overpayment': 'यह इनवॉइस के बकाया से ज़्यादा है।',
  'payments.error.duplicateUtr': 'इस UTR वाला भुगतान पहले से दर्ज है।',
  'payments.error.storage': 'भुगतान सहेजा नहीं जा सका। कृपया फिर कोशिश करें।',
  'payments.error.notRecordable': 'यह भुगतान अनुरोध बंद हो चुका है। नया QR बनाएँ।',

  'payments.problem.unreachable':
    'YouPI गेटवे तक नहीं पहुँच सके। देखें कि वह चल रहा है और पता सही है।',
  'payments.problem.timeout': 'YouPI गेटवे ने जवाब देने में बहुत समय लगाया।',
  'payments.problem.auth': 'YouPI ने Merchant ID या API key स्वीकार नहीं की।',
  'payments.problem.mismatch': 'YouPI में यह ऑर्डर पहले से अलग रकम के साथ है।',
  'payments.problem.busy': 'YouPI के अनुसार यह ऑर्डर किसी दूसरे डिवाइस पर चल रहा है।',
  'payments.problem.blocked': 'YouPI ने यह अनुरोध रोक दिया।',
  'payments.problem.observers':
    'YouPI के अनुसार कोई बैंक-अलर्ट ऑब्ज़र्वर ऑनलाइन नहीं है। फ़ोन पर ऑब्ज़र्वर ऐप खोलें।',
  'payments.problem.rejected': 'YouPI ने अनुरोध स्वीकार नहीं किया।',
  'payments.problem.notFound': 'YouPI में यह चीज़ नहीं मिली।',
  'payments.problem.badResponse': 'YouPI का जवाब समझ नहीं आया।',
  'payments.problem.server': 'YouPI गेटवे में अंदरूनी गड़बड़ी बताई गई।',
  'payments.problem.config': 'पहले गेटवे का पता, Merchant ID और API key भरें।',
  'payments.problem.noSecureStorage':
    'Windows की सुरक्षित स्टोरेज उपलब्ध नहीं है, इसलिए कुंजियाँ सुरक्षित नहीं रखी जा सकतीं।',
  'payments.problem.fallback': 'इसके बदले हाथ से पुष्टि होगी।',

  'payments.badge.upi': 'UPI',
  'payments.badge.seen': 'दिखा',
  'payments.badge.confirmed': 'पुष्ट',
  'payments.badge.upi.tip': 'UPI से भुगतान। बैंक से अभी मिलान नहीं हुआ।',
  'payments.badge.seen.tip': 'बैंक अलर्ट में भुगतान दिखा। बैंक स्टेटमेंट से अभी पुष्टि नहीं।',
  'payments.badge.confirmed.tip': 'बैंक स्टेटमेंट से पुष्टि हो चुकी है।',
  'payments.alert.seen_one': '{{count}} UPI भुगतान दिखा लेकिन पुष्टि नहीं हुई',
  'payments.alert.seen_other': '{{count}} UPI भुगतान दिखे लेकिन पुष्टि नहीं हुई',
  'payments.alert.seenBody':
    'बैंक अलर्ट में पैसा दिखा, पर आपके बैंक स्टेटमेंट से अभी पुष्टि नहीं हुई।',
  'payments.alert.waiting_one': 'गेटवे ने {{count}} भुगतान देखा है, दर्ज होना बाकी है',
  'payments.alert.waiting_other': 'गेटवे ने {{count}} भुगतान देखे हैं, दर्ज होना बाकी है',
  'payments.alert.action': 'बैंक स्टेटमेंट मिलाएँ',
  'payments.alert.check': 'अभी जाँचें',
  'payments.alert.confirmedToast_one': 'बैंक स्टेटमेंट से {{count}} भुगतान की पुष्टि हुई',
  'payments.alert.confirmedToast_other': 'बैंक स्टेटमेंट से {{count}} भुगतानों की पुष्टि हुई',

  'payments.settings.title': 'UPI भुगतान',
  'payments.settings.body': 'इनवॉइस पर UPI QR दिखाएँ और ग्राहक के फ़ोन से भुगतान लें।',
  'payments.settings.upiId': 'आपकी UPI ID',
  'payments.settings.upiIdPlaceholder': 'नाम@बैंक',
  'payments.settings.upiIdError': 'UPI ID इस तरह डालें: sharma.store@okhdfcbank',
  'payments.settings.payee': 'ग्राहक को दिखने वाला नाम',
  'payments.settings.payeePlaceholder': 'दुकान का नाम',
  'payments.settings.showQr': 'इनवॉइस पर UPI QR दिखाएँ',
  'payments.settings.saved': 'भुगतान सेटिंग सहेजी गई',
  'payments.settings.save': 'भुगतान सेटिंग सहेजें',
  'payments.youpi.title': 'YouPI से भुगतान की पुष्टि (वैकल्पिक)',
  'payments.youpi.explain':
    'YouPI एक मुफ़्त, खुद चलाया जाने वाला टूल है जो आपके बैंक के क्रेडिट अलर्ट पढ़कर BillSathi को बताता है कि पैसा आया। यह प्रयोगात्मक है, कोई विनियमित पेमेंट गेटवे नहीं, और इसके लिए आपके कंप्यूटर पर YouPI सर्वर और आपके Android फ़ोन पर उसका ऑब्ज़र्वर ऐप चाहिए। इसके बिना भी BillSathi चलता है: आप भुगतान हाथ से पक्का करते हैं।',
  'payments.youpi.enabled': 'भुगतान देखने के लिए YouPI इस्तेमाल करें',
  'payments.youpi.baseUrl': 'गेटवे का पता',
  'payments.youpi.merchantId': 'Merchant ID',
  'payments.youpi.apiKey': 'API key',
  'payments.youpi.adminToken': 'एडमिन टोकन (सिर्फ़ बैंक स्टेटमेंट भेजने के लिए)',
  'payments.youpi.saved': 'सुरक्षित सहेजा गया',
  'payments.youpi.keep': 'सहेजा हुआ मान रखने के लिए खाली छोड़ें',
  'payments.youpi.remove': 'सहेजा मान हटाएँ',
  'payments.youpi.noStorage':
    'इस कंप्यूटर पर Windows की सुरक्षित स्टोरेज उपलब्ध नहीं है, इसलिए कुंजियाँ सहेजी नहीं जा सकतीं।',
  'payments.youpi.privacy':
    'BillSathi सिर्फ़ ऊपर दिए पते से बात करता है, और सिर्फ़ तब जब आप इसका इस्तेमाल करें।',
  'payments.youpi.test': 'कनेक्शन जाँचें',
  'payments.youpi.testing': 'जाँच हो रही है…',
  'payments.youpi.test.ok': 'जुड़ गया। गेटवे ने जवाब दिया और कुंजियाँ स्वीकार हुईं।',
  'payments.youpi.test.okNoKeys':
    'गेटवे ने जवाब दिया। पूरा करने के लिए Merchant ID और API key जोड़ें।',
  'payments.youpi.test.green': 'फ़ोन ऑब्ज़र्वर और Gmail दोनों ऑनलाइन हैं।',
  'payments.youpi.test.yellow':
    'एक ऑब्ज़र्वर ऑनलाइन है। भुगतान दिखने में थोड़ा ज़्यादा समय लग सकता है।',
  'payments.youpi.test.red': 'कोई ऑब्ज़र्वर ऑनलाइन नहीं है। फ़ोन पर ऑब्ज़र्वर ऐप खोलें।',
  'payments.webhook.title': 'तुरंत अपडेट (उन्नत)',
  'payments.webhook.enabled': 'इस कंप्यूटर पर YouPI की सूचनाएँ पाएँ',
  'payments.webhook.port': 'लोकल पोर्ट',
  'payments.webhook.secret': 'वेबहुक सीक्रेट',
  'payments.webhook.note':
    'सिर्फ़ इसी कंप्यूटर (127.0.0.1) पर सुनता है। YouPI को लोकल पते पर भेजने की अनुमति होनी चाहिए। डिफ़ॉल्ट रूप से बंद; इसके बिना भी स्थिति जाँच चलती है।',

  'payments.statement.title': 'बैंक स्टेटमेंट मिलान',
  'payments.statement.body':
    'बैंक से डाउनलोड किया स्टेटमेंट अपलोड करें। BillSathi बताएगा कि कौन से UPI और बैंक भुगतान सच में आए।',
  'payments.statement.choose': 'स्टेटमेंट फ़ाइल चुनें',
  'payments.statement.formats': 'किसी भी बैंक की CSV या Excel (.xlsx)',
  'payments.statement.emptyTitle': 'अभी कोई स्टेटमेंट नहीं खुला',
  'payments.statement.emptyBody':
    'नेट बैंकिंग से खाते का स्टेटमेंट CSV या Excel में डाउनलोड करें, फिर यहाँ चुनें।',
  'payments.statement.file': '{{name}} · {{rows}} पंक्तियाँ',
  'payments.statement.map': 'कौन सा कॉलम क्या है?',
  'payments.statement.col.date': 'तारीख़',
  'payments.statement.col.narration': 'विवरण / नैरेशन',
  'payments.statement.col.credit': 'आया पैसा (क्रेडिट)',
  'payments.statement.col.debit': 'गया पैसा (डेबिट)',
  'payments.statement.col.utr': 'संदर्भ / UTR',
  'payments.statement.none': 'मेरी फ़ाइल में नहीं है',
  'payments.statement.preview': 'आपकी फ़ाइल की शुरुआती पंक्तियाँ',
  'payments.statement.match': 'मिलान खोजें',
  'payments.statement.mapError': 'तारीख़, विवरण और आया-पैसा वाले कॉलम चुनें।',
  'payments.statement.summary':
    'फ़ाइल में {{credits}} क्रेडिट · {{open}} भुगतान बैंक से पुष्टि के इंतज़ार में',
  'payments.statement.matched': 'मिल गए',
  'payments.statement.matchedBody': 'वही संदर्भ नंबर, या रकम और तारीख़ पर एक साफ़ मिलान।',
  'payments.statement.possible': 'संभावित',
  'payments.statement.possibleBody': 'एक से ज़्यादा भुगतान हो सकते हैं। सही चुनें या छोड़ दें।',
  'payments.statement.unmatched': 'नहीं मिले',
  'payments.statement.unmatchedBody':
    'बैंक में आए ऐसे पैसे जिनका कोई दर्ज UPI या बैंक भुगतान नहीं है। ये नकद जमा या अनदर्ज भुगतान हो सकते हैं।',
  'payments.statement.reason.utr': 'वही UTR',
  'payments.statement.reason.amountDate': 'वही रकम और तारीख़',
  'payments.statement.reason.ambiguous': 'एक से ज़्यादा संभावित भुगतान',
  'payments.statement.reason.amountDiffers': 'वही UTR पर रकम अलग',
  'payments.statement.skip': 'छोड़ें',
  'payments.statement.confirm': 'चुने हुए {{count}} की पुष्टि करें',
  'payments.statement.confirmed_one': '{{count}} भुगतान की पुष्टि हुई',
  'payments.statement.confirmed_other': '{{count}} भुगतानों की पुष्टि हुई',
  'payments.statement.nothing': 'इस सूची में कुछ नहीं है।',
  'payments.statement.push': 'YouPI को भी भेजें',
  'payments.statement.pushDone':
    'YouPI को भेजा: {{reconciled}} मिलान हुए, {{conflicts}} की जाँच बाकी, {{unmatched}} नहीं मिले।',
  'payments.statement.another': 'दूसरी फ़ाइल चुनें',
  'payments.statement.pushHelp':
    'YouPI इसी स्टेटमेंट से अपने ऑर्डर पक्के करता है। सेटिंग → भुगतान में एडमिन टोकन चाहिए।',
  'payments.statement.pickLabel': '{{date}} को आए {{amount}} के लिए भुगतान चुनें',

  'payments.tour.qr': 'QR दिखाएँ',
  'payments.tour.qrBody':
    'ग्राहक इसे किसी भी UPI ऐप से स्कैन करता है। रकम पहले से भरी होती है। ग्राहक की तरफ़ दिखाने के लिए "दूसरी स्क्रीन पर खोलें" दबाएँ।',
  'payments.tour.status': 'स्थिति देखें',
  'payments.tour.statusBody':
    'YouPI जुड़ा हो तो इस रकम का बैंक अलर्ट आते ही यहाँ बता देगा। इसके बिना ग्राहक से भुगतान देखकर पुष्टि करें।',
  'payments.tour.manual': 'हाथ से पुष्टि करें',
  'payments.tour.manualBody':
    '"ग्राहक कहता है भुगतान हो गया?" दबाकर उनके फ़ोन का 12 अंकों का UTR डालें। भुगतान इस इनवॉइस में दर्ज हो जाएगा।',
  'payments.tour.stmtFile': 'स्टेटमेंट खोलें',
  'payments.tour.stmtFileBody': 'अपने बैंक का CSV या Excel स्टेटमेंट चुनें।',
  'payments.tour.stmtMap': 'कॉलम जाँचें',
  'payments.tour.stmtMapBody':
    'हम अंदाज़ा लगाते हैं कि कौन सा कॉलम तारीख़, विवरण और क्रेडिट है। ज़रूरत हो तो सुधारें।',
  'payments.tour.stmtResult': 'मिलान की पुष्टि करें',
  'payments.tour.stmtResultBody':
    'जो मिलान सही लगें उन पर निशान लगाकर पुष्टि करें। उन भुगतानों पर "पुष्ट" बैज लगेगा।',
  'payments.tour.next': 'आगे',
  'payments.tour.skip': 'सुझाव छोड़ें',
  'payments.tour.done': 'समझ गया',

  'help.payments-amount.title': 'वसूली की रकम',
  'help.payments-amount.body':
    'शुरू में यह पूरा इनवॉइस बकाया होता है। ग्राहक अभी कुछ ही दे रहा हो तो घटाकर "QR बदलें" दबाएँ।',
  'help.payments-amount.example': '₹5,000 का इनवॉइस, ग्राहक अभी ₹2,000 देता है: 2000 डालें',
  'help.payments-utr.title': 'UTR',
  'help.payments-utr.body':
    'UTR वह 12 अंकों का नंबर है जो भुगतान के बाद ग्राहक के UPI ऐप में दिखता है। इसे UPI रेफ़रेंस या ट्रांज़ैक्शन ID भी कहते हैं। इससे बाद में बैंक स्टेटमेंट से मिलान होता है।',
  'help.payments-utr.example': '401537805904',
  'help.payments-last4.title': 'भुगतानकर्ता के आख़िरी 4 अंक',
  'help.payments-last4.body':
    'वैकल्पिक। ग्राहक के फ़ोन नंबर या बैंक खाते के आख़िरी चार अंक, ताकि बाद में भुगतान पहचानना आसान हो।',
  'help.payments-last4.example': '4821',
  'help.payments-seen.title': 'दिखा का मतलब पुष्ट नहीं',
  'help.payments-seen.body':
    '"दिखा" का मतलब है कि किसी बैंक अलर्ट (SMS या ईमेल) में यह रकम दिखी। अलर्ट गलत या नकली भी हो सकते हैं, इसलिए बैंक स्टेटमेंट में दिखने के बाद ही भुगतान "पुष्ट" होता है।',
  'help.payments-seen.example': 'स्टेटमेंट मिलाने के बाद: दिखा → पुष्ट',
  'help.payments-upiid.title': 'आपकी UPI ID',
  'help.payments-upiid.body':
    'वह ID जिस पर ग्राहक भुगतान करते हैं, नाम@बैंक के रूप में। यह आपके UPI ऐप की प्रोफ़ाइल या QR कोड में मिलती है।',
  'help.payments-upiid.example': 'sharma.store@okhdfcbank',
  'help.payments-payee.title': 'ग्राहक को दिखने वाला नाम',
  'help.payments-payee.body':
    'भुगतान से पहले ग्राहक को अपने UPI ऐप में यही नाम दिखता है। खाली छोड़ने पर दुकान का नाम इस्तेमाल होगा।',
  'help.payments-payee.example': 'शर्मा जनरल स्टोर',
  'help.payments-showqr.title': 'इनवॉइस पर UPI QR',
  'help.payments-showqr.body':
    'हर इनवॉइस पर एक QR छापता है जिसे स्कैन करके ग्राहक बकाया चुका सकता है।',
  'help.payments-showqr.example': 'चालू: QR आपके बैंक विवरण के पास दिखेगा',
  'help.payments-youpi.title': 'YouPI क्या है?',
  'help.payments-youpi.body':
    'YouPI एक वैकल्पिक, मुफ़्त टूल है जिसे आप खुद चलाते हैं। यह आपके फ़ोन से बैंक क्रेडिट अलर्ट पढ़कर BillSathi को बताता है कि भुगतान दिखा। यह प्रयोगात्मक है और विनियमित गेटवे नहीं, इसलिए आपके "भुगतान दर्ज करें" दबाए बिना BillSathi कोई इनवॉइस चुकता नहीं करता।',
  'help.payments-youpi.example': 'हर भुगतान खुद पक्का करना हो तो इसे छोड़ दें',
  'help.payments-baseurl.title': 'गेटवे का पता',
  'help.payments-baseurl.body':
    'जहाँ आपकी YouPI पेमेंट सेवा चल रही है। उसी कंप्यूटर पर हो तो आमतौर पर डिफ़ॉल्ट ही सही है।',
  'help.payments-baseurl.example': 'http://localhost:6100',
  'help.payments-merchant.title': 'Merchant ID',
  'help.payments-merchant.body':
    'आपके YouPI एडमिन पेज की merchant ID। इससे YouPI जानता है कि ऑर्डर किस दुकान का है।',
  'help.payments-merchant.example': '00000000-0000-0000-0000-000000000001',
  'help.payments-apikey.title': 'API key',
  'help.payments-apikey.body':
    'आपके YouPI एडमिन पेज की गुप्त कुंजी। यह इस कंप्यूटर पर एन्क्रिप्ट होकर रहती है और दोबारा नहीं दिखाई जाती।',
  'help.payments-apikey.example': 'YouPI से कॉपी किया लंबा टेक्स्ट',
  'help.payments-admintoken.title': 'एडमिन टोकन',
  'help.payments-admintoken.body':
    'सिर्फ़ तब चाहिए जब आप बैंक स्टेटमेंट YouPI को भेजना चाहें ताकि वह अपने ऑर्डर पक्के कर सके। नहीं तो खाली छोड़ें।',
  'help.payments-admintoken.example': 'आपकी YouPI सर्वर सेटिंग में मिलता है',
  'help.payments-webhook.title': 'तुरंत अपडेट',
  'help.payments-webhook.body':
    'भुगतान दिखते ही YouPI BillSathi को सूचना भेज सकता है। इसके लिए सिर्फ़ इसी कंप्यूटर पर एक छोटा श्रोता खुलता है। ज़्यादातर दुकानों को इसकी ज़रूरत नहीं, क्योंकि BillSathi हर कुछ सेकंड में खुद भी जाँचता है।',
  'help.payments-webhook.example': '127.0.0.1 पर पोर्ट 6390',
  'help.payments-statement.title': 'बैंक स्टेटमेंट मिलान',
  'help.payments-statement.body':
    'बैंक में जो आया, उसे आपके दर्ज UPI और बैंक भुगतानों से मिलाएँ। मिलने वाले भुगतान "पुष्ट" हो जाते हैं। आपके "पुष्टि करें" दबाने तक कुछ नहीं बदलता।',
  'help.payments-statement.example': 'नेट बैंकिंग से पिछले महीने का स्टेटमेंट डाउनलोड करें',
  'help.payments-mapping.title': 'स्टेटमेंट के कॉलम',
  'help.payments-mapping.body':
    'हर बैंक कॉलम को अलग नाम देता है। BillSathi को बताएँ कि तारीख़, विवरण, आया-पैसा और (वैकल्पिक) संदर्भ किस कॉलम में है।',
  'help.payments-mapping.example': 'Deposit Amt. = आया पैसा',
};

export { en, hi };
export const payments = { en, hi };
