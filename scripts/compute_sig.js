require('dotenv').config({ path: __dirname + '/../.env' });
const crypto = require('crypto');

const merchantId = process.env.PAYHERE_MERCHANT_ID;
const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
const bookingId = process.argv[2] || 'BK-1776787534782';
const payhere_amount = process.argv[3] || '7500.00';
const payhere_currency = 'LKR';
const status_code = process.argv[4] || '2';

const hashedSecret = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
const localMd5sig = crypto.createHash('md5').update(
  `${merchantId}${bookingId}${payhere_amount}${payhere_currency}${status_code}${hashedSecret}`
).digest('hex').toUpperCase();

console.log('merchantId=', merchantId);
console.log('hashedSecret=', hashedSecret);
console.log('localMd5sig=', localMd5sig);
