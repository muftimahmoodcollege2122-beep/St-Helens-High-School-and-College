const crypto = require('crypto');
const router = require('express').Router();
const { readDB, writeDB } = require('../db');

// ── JazzCash (Mobile Wallet / Page Redirection API) ──────────────────────────
// Docs: https://developer.jazzcash.com.pk — sandbox vs live base URL differs.
// Required env vars once you have merchant credentials:
//   JAZZCASH_MERCHANT_ID, JAZZCASH_PASSWORD, JAZZCASH_HASH_KEY,
//   JAZZCASH_RETURN_URL, JAZZCASH_ENV ('sandbox' | 'live')
const JC_URLS = {
  sandbox: 'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/',
  live:    'https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/',
};

function jazzCashConfigured() {
  return !!(process.env.JAZZCASH_MERCHANT_ID && process.env.JAZZCASH_PASSWORD && process.env.JAZZCASH_HASH_KEY);
}

function jazzCashSortedHash(params) {
  // JazzCash requires: sort all pp_ params alphabetically, concatenate
  // values with '&', prepend the Integrity Salt (hash key), HMAC-SHA256.
  const keys = Object.keys(params).filter(k => k.startsWith('pp_') && params[k] !== '').sort();
  const str = keys.map(k => params[k]).join('&');
  const hash = crypto.createHmac('sha256', process.env.JAZZCASH_HASH_KEY)
    .update(`${process.env.JAZZCASH_HASH_KEY}&${str}`).digest('hex');
  return hash;
}

router.post('/jazzcash/initiate', async (req, res) => {
  try {
    if (!jazzCashConfigured()) {
      return res.status(503).json({ success:false, message:'JazzCash not configured yet. Set JAZZCASH_MERCHANT_ID, JAZZCASH_PASSWORD, JAZZCASH_HASH_KEY env vars on the server, then this will activate automatically — no code changes needed.' });
    }
    const { feeId, amount, phone } = req.body;
    if (!feeId || !amount) return res.status(400).json({ success:false, message:'feeId and amount required.' });

    const fees = readDB('fees');
    const fee = fees.find(f => f._id === feeId);
    if (!fee) return res.status(404).json({ success:false, message:'Fee record not found.' });

    const now = new Date();
    const txnRefNo = 'T' + now.getTime();
    const dateTime = now.toISOString().replace(/[-:T.Z]/g,'').slice(0,14);
    const expiry = new Date(now.getTime() + 60*60*1000).toISOString().replace(/[-:T.Z]/g,'').slice(0,14);

    const params = {
      pp_Version: '1.1',
      pp_TxnType: 'MWALLET',
      pp_Language: 'EN',
      pp_MerchantID: process.env.JAZZCASH_MERCHANT_ID,
      pp_Password: process.env.JAZZCASH_PASSWORD,
      pp_TxnRefNo: txnRefNo,
      pp_Amount: String(Math.round(amount * 100)), // paisas
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: dateTime,
      pp_BillReference: feeId,
      pp_Description: `St. Helen's Fee — ${fee.month||''}`,
      pp_TxnExpiryDateTime: expiry,
      pp_ReturnURL: process.env.JAZZCASH_RETURN_URL || '',
      pp_MobileNumber: phone || '',
    };
    params.pp_SecureHash = jazzCashSortedHash(params);

    res.json({ success:true, actionUrl: JC_URLS[process.env.JAZZCASH_ENV || 'sandbox'], fields: params, txnRefNo });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// JazzCash POSTs back here after payment — verify hash, mark fee Paid.
router.post('/jazzcash/callback', async (req, res) => {
  try {
    if (!jazzCashConfigured()) return res.status(503).send('Not configured.');
    const body = req.body;
    const expectedHash = jazzCashSortedHash(body);
    if (expectedHash !== body.pp_SecureHash) return res.status(400).send('Invalid hash.');

    const feeId = body.pp_BillReference;
    const success = body.pp_ResponseCode === '000';
    const fees = readDB('fees');
    const idx = fees.findIndex(f => f._id === feeId);
    if (idx !== -1 && success) {
      fees[idx].status = 'Paid';
      fees[idx].paidAt = new Date().toISOString();
      fees[idx].paymentSubmission = { method:'JazzCash', transactionId: body.pp_TxnRefNo, verified:true, auto:true, submittedAt:new Date().toISOString() };
      writeDB('fees', fees);
    }
    res.redirect(`/parent.html?payment=${success?'success':'failed'}`);
  } catch(e) { res.status(500).send('Error processing callback.'); }
});

// ── EasyPaisa (Open API) ──────────────────────────────────────────────────────
// Docs: https://easypaisa.com.pk/open-api/ — required once you have credentials:
//   EASYPAISA_STORE_ID, EASYPAISA_HASH_KEY, EASYPAISA_ACCOUNT_NUM, EASYPAISA_ENV
function easyPaisaConfigured() {
  return !!(process.env.EASYPAISA_STORE_ID && process.env.EASYPAISA_HASH_KEY);
}

router.post('/easypaisa/initiate', async (req, res) => {
  if (!easyPaisaConfigured()) {
    return res.status(503).json({ success:false, message:'EasyPaisa not configured yet. Set EASYPAISA_STORE_ID, EASYPAISA_HASH_KEY env vars, then this will activate automatically.' });
  }
  // TODO: implement EasyPaisa Open API request signing per their docs once
  // merchant credentials are issued — request/response field names depend
  // on the specific product (Easypaisa MA / OTC) assigned to the merchant.
  res.status(501).json({ success:false, message:'EasyPaisa integration pending final API spec from merchant onboarding.' });
});

router.get('/status', (req, res) => {
  res.json({ success:true, jazzcash: jazzCashConfigured(), easypaisa: easyPaisaConfigured() });
});

module.exports = router;
