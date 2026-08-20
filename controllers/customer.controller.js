const Customer = require('../models/User');
const Booking  = require('../models/Booking');
const Review   = require('../models/Review');

const normalizeStatus = (status) => (status || 'pending').toLowerCase();

const getReceivedAmount = (booking) => {
  const isLegacy = Array.isArray(booking.serviceItems) && booking.serviceItems.length > 0;
  if (isLegacy) {
    const advance = booking.advanceAmount || 0;
    const balance = booking.balancePaid ? (booking.balanceAmount || 0) : 0;
    return advance + balance;
  }
  return booking.paidAmount || 0;
};

const getCustomerBookingStats = async (customerIds) => {
  if (!customerIds.length) return new Map();

  // Compare as strings, not raw BSON types. customerId is a real ObjectId
  // per the schema, but legacy bookings' userId isn't a declared schema
  // path — if any of those are stored as plain strings instead of
  // ObjectIds, a raw $in match against an ObjectId array silently drops
  // them (aggregate() does no auto-casting the way find() does). Casting
  // both sides to string up front makes the match work regardless of the
  // stored type.
  const customerIdStrs = customerIds.map((id) => String(id));

  const rawStats = await Booking.aggregate([
    {
      $addFields: {
        effectiveCustomerId: { $ifNull: ['$customerId', '$userId'] },
        normalizedStatus: { $toLower: { $ifNull: ['$status', 'pending'] } },
      },
    },
    {
      $addFields: {
        effectiveCustomerIdStr: { $toString: '$effectiveCustomerId' },
      },
    },
    {
      $match: {
        effectiveCustomerIdStr: { $in: customerIdStrs },
      },
    },
    {
      $project: {
        effectiveCustomerIdStr: 1,
        normalizedStatus: 1,
        serviceItems: { $ifNull: ['$serviceItems', []] },
        paidAmount: { $ifNull: ['$paidAmount', 0] },
        advanceAmount: { $ifNull: ['$advanceAmount', 0] },
        balanceAmount: { $ifNull: ['$balanceAmount', 0] },
        balancePaid: { $ifNull: ['$balancePaid', false] },
      },
    },
    {
      $addFields: {
        isLegacy: { $gt: [{ $size: '$serviceItems' }, 0] },
      },
    },
    {
      $addFields: {
        receivedAmount: {
          $cond: [
            '$isLegacy',
            {
              $add: [
                '$advanceAmount',
                { $cond: ['$balancePaid', '$balanceAmount', 0] },
              ],
            },
            '$paidAmount',
          ],
        },
      },
    },
    {
      $group: {
        _id: '$effectiveCustomerIdStr',
        totalBookings: { $sum: 1 },
        completedBookings: {
          $sum: { $cond: [{ $eq: ['$normalizedStatus', 'completed'] }, 1, 0] },
        },
        cancelledBookings: {
          $sum: { $cond: [{ $eq: ['$normalizedStatus', 'cancelled'] }, 1, 0] },
        },
        totalSpent: { $sum: '$receivedAmount' },
      },
    },
  ]);

  return new Map(rawStats.map((row) => [row._id, row]));
};

exports.getAll = async (req, res) => {
  try {
    const { search } = req.query;
    const filter = { role: 'customer' };
    if (search) filter.$or = [
      { name:  { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
    const customers = await Customer.find(filter).sort({ createdAt: -1 });
    const customerIds = customers.map((c) => c._id);
    const statsByCustomerId = await getCustomerBookingStats(customerIds);

    const enriched = customers.map((customer) => {
      const stats = statsByCustomerId.get(String(customer._id));
      return {
        ...customer.toObject(),
        totalBookings: stats?.totalBookings || 0,
        totalSpent: stats?.totalSpent || 0,
      };
    });

    res.json(enriched);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.getById = async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, role: 'customer' });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(customer);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

// Full detail view for the "View Details" modal — addresses, booking
// history, payment history, and reviews, all pulled from real collections
// instead of the previous hardcoded mock data.
//
// NOTE: the Booking collection has two document shapes coexisting (see
// overview.controller.js for the same issue):
//  - current schema: customerId, serviceType/serviceCategory/serviceName
//  - legacy schema:  userId (not customerId!), serviceItems[] array,
//    uppercase status values, advanceAmount/balanceAmount/balancePaid
// Both are queried and normalized here so no customer's history is dropped.
exports.getDetails = async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, role: 'customer' });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const bookings = await Booking.find({
      $or: [{ customerId: customer._id }, { userId: customer._id }],
    }).sort({ createdAt: -1 }).lean();

    const bookingHistory = bookings.map((b) => {
      const isLegacy = Array.isArray(b.serviceItems) && b.serviceItems.length > 0;
      const service = isLegacy
        ? b.serviceItems.map(i => i.name).join(', ')
        : (b.serviceCategory || b.serviceType || b.serviceName || '—');
      return {
        id: b.bookingId || b._id,
        service,
        date: b.date || (b.createdAt ? b.createdAt.toISOString().split('T')[0] : ''),
        status: normalizeStatus(b.status),
        amount: b.price || 0,
      };
    });

    const completedBookings = bookings.filter(b => normalizeStatus(b.status) === 'completed').length;
    const cancelledBookings = bookings.filter(b => normalizeStatus(b.status) === 'cancelled').length;
    const totalBookings = bookings.length;
    const totalSpent = bookings.reduce((sum, b) => sum + getReceivedAmount(b), 0);

    // Payment history derived from each booking's own payment fields — there
    // is no separate Payment/Invoice model in this codebase to query.
    const paymentHistory = [];
    for (const b of bookings) {
      const isLegacy = Array.isArray(b.serviceItems) && b.serviceItems.length > 0;
      if (isLegacy) {
        const advance = b.advanceAmount || 0;
        const balance = b.balancePaid ? (b.balanceAmount || 0) : 0;
        const received = advance + balance;
        if (received > 0) {
          paymentHistory.push({
            id: b.bookingId || b._id,
            date: b.date || '',
            method: b.paymentMethod || 'Unknown',
            amount: received,
            status: b.balancePaid || (advance >= (b.price || 0)) ? 'paid' : 'partial',
          });
        }
      } else {
        const paid = b.paidAmount || 0;
        if (paid > 0) {
          paymentHistory.push({
            id: b.bookingId || b._id,
            date: b.date || '',
            method: b.paymentMethodName || b.paymentMethod || 'Unknown',
            amount: paid,
            status: b.paymentStatus || 'pending',
          });
        }
      }
    }

    // Addresses actually used — the account's saved address plus any
    // distinct addresses seen on their past bookings. There is no
    // multi-address (Home/Office) model on the User schema, so this is the
    // real data available rather than fabricated address "types".
    const addressSet = new Set();
    if (customer.address) addressSet.add(customer.address);
    for (const b of bookings) if (b.address) addressSet.add(b.address);
    const addresses = Array.from(addressSet).map(address => ({ address }));

    const reviews = await Review.find({ customerId: customer._id })
      .sort({ createdAt: -1 })
      .lean();
    const averageRating = reviews.length
      ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
      : null;

    res.json({
      ...customer.toObject(),
      totalBookings,
      totalSpent,
      addresses,
      bookingHistory,
      paymentHistory,
      reviews: reviews.map(r => ({ text: r.content, date: r.createdAt, rating: r.rating })),
      averageRating,
      completedBookings,
      cancelledBookings,
      loyaltyTier: customer.badge || null,
    });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'inactive'].includes(status)) return res.status(400).json({ error: 'Invalid status value' });
    const customer = await Customer.findOne({ _id: req.params.id, role: 'customer' });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const updated = await Customer.findByIdAndUpdate(req.params.id, { customerStatus: status }, { new: true });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};