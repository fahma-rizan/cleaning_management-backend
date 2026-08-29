const http = require('http');
const crypto = require('crypto');

(async () => {
  const bookingId = process.argv[2] || 'BK-1776787534782';
  const payhere_amount = process.argv[3] || '5000.00';
  const payhere_currency = 'LKR';
  const status_code = '2'; // success
  const payment_id = 'SIMPAY-' + Date.now();

  const merchantId = process.env.PAYHERE_MERCHANT_ID || '1235603';
  const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET || '';
  const hashedSecret = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
  const md5sig = crypto.createHash('md5').update(
    `${merchantId}${bookingId}${payhere_amount}${payhere_currency}${status_code}${hashedSecret}`
  ).digest('hex').toUpperCase();

  const postData = JSON.stringify({
    order_id: bookingId,
    payment_id,
    payhere_amount,
    payhere_currency,
    status_code,
    md5sig,
  });

  const options = {
    hostname: 'localhost',
    port: 4000,
    path: '/api/payhere/notify',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
  };

  const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      console.log('BODY:', chunk);
    });
    res.on('end', () => {
      console.log('No more data in response.');
    });
  });

  req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
  });

  req.write(postData);
  req.end();
})();
