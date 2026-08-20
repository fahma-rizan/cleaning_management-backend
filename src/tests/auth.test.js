const request = require('supertest');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

// Import the express app without starting the server
const express = require('express');
const cors = require('cors');
const app = express();
app.use(express.json());
app.use('/api/auth', require('../routes/auth.routes'));
app.use('/api/services', require('../routes/service.routes'));
app.use('/api/offers', require('../routes/offer.routes'));
app.use('/api/bookings', require('../routes/booking.routes'));
app.use('/api/notifications', require('../routes/notification.routes'));
app.use('/api/pricelists', require('../routes/priceList.routes'));

let token = '';
let userId = '';

// Connect to DB before tests
beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI);
});

// Disconnect after tests
afterAll(async () => {
  await mongoose.connection.close();
});

// ─── Auth Tests ───────────────────────────────────────────────────────────────
describe('Auth API', () => {

  test('POST /api/auth/register — should register a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: `test${Date.now()}@example.com`,
        password: 'Test@1234',
        phone: '0771234567',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('customer');
    token = res.body.token;
    userId = res.body.user.id;
  });

  test('POST /api/auth/login — should login successfully', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'demo@cloudlaundry.lk',
        password: 'Demo@1234',
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    token = res.body.token;
  });

  test('POST /api/auth/login — should fail with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'demo@cloudlaundry.lk',
        password: 'WrongPassword',
      });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('GET /api/auth/me — should return current user', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toBeDefined();
  });

  test('GET /api/auth/me — should fail without token', async () => {
    const res = await request(app)
      .get('/api/auth/me');

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

});

// ─── Services Tests ───────────────────────────────────────────────────────────
describe('Services API', () => {

  test('GET /api/services — should return all services', async () => {
    const res = await request(app)
      .get('/api/services');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.services).toBeDefined();
    expect(res.body.services.length).toBeGreaterThan(0);
  });

  test('GET /api/services?category=laundry — should return laundry services', async () => {
    const res = await request(app)
      .get('/api/services?category=laundry');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.services.every((s) => s.category === 'laundry')).toBe(true);
  });

  test('GET /api/services/9 — should return dry cleaning service', async () => {
    const res = await request(app)
      .get('/api/services/9');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.service.serviceId).toBe(9);
  });

  test('GET /api/services/999 — should return 404 for invalid service', async () => {
    const res = await request(app)
      .get('/api/services/999');

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });

});

// ─── Offers Tests ─────────────────────────────────────────────────────────────
describe('Offers API', () => {

  test('GET /api/offers — should return active offers', async () => {
    const res = await request(app)
      .get('/api/offers');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.offers.length).toBeGreaterThan(0);
  });

  test('POST /api/offers/validate — should validate WELCOME20 code', async () => {
    const res = await request(app)
      .post('/api/offers/validate')
      .send({
        code: 'WELCOME20',
        serviceId: 1,
        orderAmount: 8000,
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.offer.discountAmount).toBe(1600);
    expect(res.body.offer.finalAmount).toBe(6400);
  });

  test('POST /api/offers/validate — should fail with invalid code', async () => {
    const res = await request(app)
      .post('/api/offers/validate')
      .send({
        code: 'INVALIDCODE',
        serviceId: 1,
        orderAmount: 8000,
      });

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('POST /api/offers/validate — should fail below minimum amount', async () => {
    const res = await request(app)
      .post('/api/offers/validate')
      .send({
        code: 'WELCOME20',
        serviceId: 1,
        orderAmount: 500,
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

});

// ─── Bookings Tests ───────────────────────────────────────────────────────────
describe('Bookings API', () => {

  let bookingId = '';

  test('POST /api/bookings — should create a booking', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        serviceId: 1,
        serviceName: 'House Deep Cleaning',
        mainServiceType: 'Home/Office Cleaning',
        serviceCategory: 'House Deep Cleaning',
        date: '2026-06-01',
        time: '09:00 AM',
        address: '123 Main St, Colombo',
        totalAmount: 5000,
        packageType: 'standard',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.booking.bookingRef).toBeDefined();
    expect(res.body.booking.status).toBe('pending');
    bookingId = res.body.booking._id;
  });

  test('GET /api/bookings — should return user bookings', async () => {
    const res = await request(app)
      .get('/api/bookings')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.bookings).toBeDefined();
  });

  test('GET /api/bookings/:id — should return booking by id', async () => {
    const res = await request(app)
      .get(`/api/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.booking._id).toBe(bookingId);
  });

  test('PUT /api/bookings/:id/cancel — should cancel a booking', async () => {
    const res = await request(app)
      .put(`/api/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.booking.status).toBe('cancelled');
  });

  test('POST /api/bookings — should fail without token', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({
        serviceId: 1,
        totalAmount: 5000,
      });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

});

// ─── Price Lists Tests ────────────────────────────────────────────────────────
describe('Price Lists API', () => {

  test('GET /api/pricelists — should return all price lists', async () => {
    const res = await request(app)
      .get('/api/pricelists');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.priceLists.length).toBe(12);
  });

  test('GET /api/pricelists/9 — should return dry cleaning prices', async () => {
    const res = await request(app)
      .get('/api/pricelists/9');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.priceList.serviceName).toBe('Dry Cleaning');
  });

  test('GET /api/pricelists/999 — should return 404', async () => {
    const res = await request(app)
      .get('/api/pricelists/999');

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });

});

// ─── Notifications Tests ──────────────────────────────────────────────────────
describe('Notifications API', () => {

  test('GET /api/notifications — should return notifications', async () => {
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.notifications).toBeDefined();
  });

  test('PUT /api/notifications/read-all — should mark all as read', async () => {
    const res = await request(app)
      .put('/api/notifications/read-all')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('GET /api/notifications — should fail without token', async () => {
    const res = await request(app)
      .get('/api/notifications');

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

});