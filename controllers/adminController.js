const User = require('../models/User');

const toAdminUser = (u) => ({
  _id:          u._id,
  name:         u.name,
  email:        u.email,
  phone:        u.phone || '',
  address:      u.address || '',
  adminRole:    u.adminRole || 'Main Admin',
  adminStatus:  u.isActive ? 'Active' : 'Inactive',
  lastActive:   u.updatedAt ? u.updatedAt.toISOString() : '',
  isSuperAdmin: u.adminRole === 'Super Admin',
});

// ─── GET /api/admins ───────────────────────────────────────────────────────────
const getAllAdmins = async (req, res) => {
  try {
    const admins = await User.find({ role: 'admin' })
      .select('name email phone address adminRole isActive updatedAt');
    res.json(admins.map(toAdminUser));
  } catch (err) {
    console.error('getAllAdmins error:', err);
    res.status(500).json({ error: 'Failed to load admins' });
  }
};

// ─── GET /api/admins/:id ───────────────────────────────────────────────────────
const getAdminById = async (req, res) => {
  try {
    const admin = await User.findOne({ _id: req.params.id, role: 'admin' })
      .select('name email phone address adminRole isActive updatedAt');
    if (!admin) return res.status(404).json({ error: 'Admin not found' });
    res.json(toAdminUser(admin));
  } catch (err) {
    console.error('getAdminById error:', err);
    res.status(500).json({ error: 'Failed to load admin' });
  }
};

// ─── POST /api/admins ───────────────────────────────────────────────────────────
const createAdmin = async (req, res) => {
  try {
    const { name, email, password, phone, address, role } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password and role are required.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ error: 'An account with this email already exists.' });

    const nameParts = name.trim().split(' ');
    const admin = await User.create({
      firstName: nameParts[0],
      lastName:  nameParts.slice(1).join(' ') || nameParts[0],
      name:      name.trim(),
      email:     email.toLowerCase(),
      password,
      phone:     phone   || '',
      address:   address || '',
      role:      'admin',
      adminRole: role,
      isVerified: true,
    });

    res.status(201).json(toAdminUser(admin));
  } catch (err) {
    console.error('createAdmin error:', err);
    res.status(500).json({ error: 'Failed to create admin' });
  }
};

// ─── PUT /api/admins/:id ────────────────────────────────────────────────────────
const updateAdmin = async (req, res) => {
  try {
    const { role, status, name, phone, address } = req.body;
    const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
    if (!admin) return res.status(404).json({ error: 'Admin not found' });

    if (role)    admin.adminRole = role;
    if (status)  admin.isActive  = status === 'Active';
    if (name)    admin.name      = name;
    if (phone !== undefined)   admin.phone   = phone;
    if (address !== undefined) admin.address = address;

    await admin.save();
    res.json(toAdminUser(admin));
  } catch (err) {
    console.error('updateAdmin error:', err);
    res.status(500).json({ error: 'Failed to update admin' });
  }
};

// ─── PUT /api/admins/:id/deactivate ─────────────────────────────────────────────
const deactivateAdmin = async (req, res) => {
  try {
    const admin = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'admin' },
      { isActive: false },
      { new: true }
    );
    if (!admin) return res.status(404).json({ error: 'Admin not found' });
    res.json(toAdminUser(admin));
  } catch (err) {
    console.error('deactivateAdmin error:', err);
    res.status(500).json({ error: 'Failed to deactivate admin' });
  }
};

// ─── PUT /api/admins/:id/activate ───────────────────────────────────────────────
const activateAdmin = async (req, res) => {
  try {
    const admin = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'admin' },
      { isActive: true },
      { new: true }
    );
    if (!admin) return res.status(404).json({ error: 'Admin not found' });
    res.json(toAdminUser(admin));
  } catch (err) {
    console.error('activateAdmin error:', err);
    res.status(500).json({ error: 'Failed to activate admin' });
  }
};

// ─── DELETE /api/admins/:id ──────────────────────────────────────────────────────
const deleteAdmin = async (req, res) => {
  try {
    const admin = await User.findOneAndDelete({ _id: req.params.id, role: 'admin' });
    if (!admin) return res.status(404).json({ error: 'Admin not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('deleteAdmin error:', err);
    res.status(500).json({ error: 'Failed to delete admin' });
  }
};

module.exports = {
  getAllAdmins, getAdminById, createAdmin,
  updateAdmin, deactivateAdmin, activateAdmin, deleteAdmin,
};
