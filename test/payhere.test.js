const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
// Mock the dependencies early so importing routes doesn't initialize real services
jest.mock('../models/Notification');
jest.mock('../utils/emailService');

const payhereRoutes = require('../routes/payhere');
const Booking = require('../models/Booking');
const Invoice = require('../models/Invoice');
const Notification = require('../models/Notification');
const emailService = require('../utils/emailService');

const app = express();
// Add the io object to the app context for the route to use
app.use((req, res, next) => {
    req.app.io = { to: () => ({ emit: () => {} }) }; // Mock Socket.IO
    next();
});
app.use(express.json());
app.use('/api/payhere', payhereRoutes);

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
    // Clear all mock implementations and calls after each test
    jest.clearAllMocks();
    // Clear the database between tests
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        const collection = collections[key];
        await collection.deleteMany();
    }
});


describe('POST /api/payhere/notify', () => {
  it('should handle a successful payment notification, update invoice, create notification, and send email', async () => {
    // 1. Setup: Create a mock booking and a pending invoice
    const booking = await new Booking({
      bookingId: 'BK-12345',
      customerId: new mongoose.Types.ObjectId(),
      customerName: 'Test User',
      customerEmail: 'test@example.com',
      customer: { name: 'Test User', email: 'test@example.com' },
      serviceName: 'Test Service',
      serviceType: 'Test Service',
      address: '123 Test St',
      price: 1500,
      status: 'confirmed',
    }).save();

    const invoice = await new Invoice({
      bookingId: booking._id,
      invoiceNumber: 'INV-001',
      invoiceType: 'FULL',
      customer: { name: 'Test User', email: 'test@example.com' },
      subTotal: 1500,
      totalAmount: 1500,
      paidAmount: 0,
      balanceAmount: 1500,
      status: 'DRAFT',
    }).save();

    // Set PayHere env vars and compute a valid md5 signature for the payload
    process.env.PAYHERE_MERCHANT_ID = 'TESTMID';
    process.env.PAYHERE_MERCHANT_SECRET = 'TESTSECRET';
    const crypto = require('crypto');

    const payherePayload = {
      order_id: 'BK-12345',
      payment_id: 'PAY-98765',
      payhere_amount: '1500.00',
      payhere_currency: 'LKR',
      status_code: 2, // Success
    };

    const hashedSecret = crypto.createHash('md5').update(process.env.PAYHERE_MERCHANT_SECRET).digest('hex').toUpperCase();
    payherePayload.md5sig = crypto.createHash('md5').update(
      `${process.env.PAYHERE_MERCHANT_ID}${payherePayload.order_id}${payherePayload.payhere_amount}${payherePayload.payhere_currency}${payherePayload.status_code}${hashedSecret}`
    ).digest('hex').toUpperCase();
    
    // Mock the implementation of Notification.save
    Notification.prototype.save = jest.fn().mockResolvedValue(true);
    
    // Mock the implementation of the email service
    emailService.sendPaymentConfirmationEmail.mockResolvedValue(true);


    // 3. Action: Send the request to the endpoint
    const response = await request(app)
      .post('/api/payhere/notify')
      .send(payherePayload);

    // 4. Assertions
    expect(response.status).toBe(200);

    // Check if the invoice was updated in the database
    const updatedInvoice = await Invoice.findOne({ bookingId: booking._id });
    expect(updatedInvoice.status).toBe('PAID');
    expect(updatedInvoice.paidAmount).toBe(1500);

    // Check if a notification was created
    expect(Notification.prototype.save).toHaveBeenCalledTimes(1);

    // Check if the email service was called
    expect(emailService.sendPaymentConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendPaymentConfirmationEmail).toHaveBeenCalledWith(expect.objectContaining({
        invoiceNumber: 'INV-001'
    }));
  });
});