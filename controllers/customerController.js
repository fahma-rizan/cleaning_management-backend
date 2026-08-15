const User    = require('../models/User');
const Booking = require('../models/Booking');

// ─── GET /api/customers ───────────────────────────────────────────────────────
// Returns all customers with booking/spend stats, as a bare array.
const getAllCustomers = async (req, res) => {
  try {
    const { search } = req.query;
    const filter = { role: 'customer' };
    if (search) {
      filter.$or = [
        { name:  { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const customers = await User.find(filter)
      .select('name email phone loyaltyPoints status createdAt');

    const withStats = await Promise.all(
      customers.map(async (c) => {
        const bookings = await Booking.find({ customerId: c._id });
        const totalSpent = bookings.reduce((sum, b) => sum + (b.paidAmount || 0), 0);
        const lastBooking = bookings.length
          ? bookings.reduce((latest, b) => (b.date > (latest?.date || '') ? b : latest), null)
          : null;

        return {
          _id:            c._id,
          name:           c.name,
          email:          c.email,
          phone:          c.phone || '',
          joinDate:       c.createdAt ? c.createdAt.toISOString().split('T')[0] : '',
          totalBookings:  bookings.length,
          totalSpent,
          loyaltyPoints:  c.loyaltyPoints || 0,
          customerStatus: c.status || 'active',
          lastBooking:    lastBooking ? lastBooking.date : undefined,
        };
      })
    );

    res.json(withStats);
  } catch (err) {
    console.error('getAllCustomers error:', err);
    res.status(500).json({ error: 'Failed to load customers' });
  }
};

// ─── GET /api/customers/:id ───────────────────────────────────────────────────
const getCustomerById = async (req, res) => {
  try {
    const customer = await User.findOne({ _id: req.params.id, role: 'customer' })
      .select('name email phone loyaltyPoints status createdAt address');
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const bookings = await Booking.find({ customerId: customer._id }).sort({ createdAt: -1 });
    const totalSpent = bookings.reduce((sum, b) => sum + (b.paidAmount || 0), 0);

    res.json({
      _id:            customer._id,
      name:           customer.name,
      email:          customer.email,
      phone:          customer.phone || '',
      address:        customer.address || '',
      joinDate:       customer.createdAt ? customer.createdAt.toISOString().split('T')[0] : '',
      totalBookings:  bookings.length,
      totalSpent,
      loyaltyPoints:  customer.loyaltyPoints || 0,
      customerStatus: customer.status || 'active',
      bookings,
    });
  } catch (err) {
    console.error('getCustomerById error:', err);
    res.status(500).json({ error: 'Failed to load customer' });
  }
};

// ─── PUT /api/customers/:id/status ────────────────────────────────────────────
const updateCustomerStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'inactive', 'blocked'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const customer = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'customer' },
      { status },
      { new: true }
    );
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json({ _id: customer._id, customerStatus: customer.status });
  } catch (err) {
    console.error('updateCustomerStatus error:', err);
    res.status(500).json({ error: 'Failed to update customer status' });
  }
};

module.exports = { getAllCustomers, getCustomerById, updateCustomerStatus };
