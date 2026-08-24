const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');
const { normalizePhone, PHONE_RULE, EMAIL_REGEX, EMAIL_RULE, generateStrongPassword, credentialsEmailHTML } = require('../utils/validators');

const toAdminUser = (u) => ({
  _id:          u._id,
  name:         u.name,
  email:        u.email,
  phone:        u.phone || '',
  nic:          u.nic || '',
  address:      u.address || '',
  adminRole:    u.adminRole || 'Main Admin',
  adminStatus:  u.isActive ? 'Active' : 'Inactive',
  lastActive:   u.updatedAt ? u.updatedAt.toISOString() : '',
  isSuperAdmin: u.adminRole === 'Super Admin',
  profilePhoto: u.profilePhoto || '',
});

// ─── GET /api/admins ───────────────────────────────────────────────────────────
const getAllAdmins = async (req, res) => {
  try {
    const admins = await User.find({ role: 'admin' })
      .select('name email phone nic address adminRole isActive updatedAt profilePhoto');
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
      .select('name email phone nic address adminRole isActive updatedAt profilePhoto');
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
    const { name, email, address, nic, role } = req.body;
    const rawPhone = req.body.phone;
    if (!name || !email || !role) {
      return res.status(400).json({ error: 'Name, email and role are required.' });
    }
    if (!EMAIL_REGEX.test(email)) return res.status(400).json({ error: EMAIL_RULE });
    let phone = '';
    if (rawPhone) {
      phone = normalizePhone(rawPhone);
      if (!phone) return res.status(400).json({ error: PHONE_RULE });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ error: 'An account with this email already exists.' });

    const nameParts = name.trim().split(' ');

    // Auto-generate the temporary password — same pattern as staff creation.
    // Emailed below, never returned in the API response; the new admin sets
    // their own password on first login (requiresPasswordChange).
    const tempPassword = generateStrongPassword();

    const admin = await User.create({
      firstName: nameParts[0],
      lastName:  nameParts.slice(1).join(' ') || nameParts[0],
      name:      name.trim(),
      email:     email.toLowerCase(),
      password:  tempPassword,
      phone:     phone   || '',
      nic:       nic     || '',
      address:   address || '',
      role:      'admin',
      adminRole: role,
      isVerified: true,
      requiresPasswordChange: true,
      profilePhoto: req.file ? `/uploads/admin/${req.file.filename}` : '',
    });

    const emailed = await sendEmail({
      to: admin.email,
      subject: 'Cloud Laundry – Your Admin Account',
      html: credentialsEmailHTML(admin.name, admin.email, tempPassword, 'admin account'),
    });

    res.status(201).json({ ...toAdminUser(admin), credentialsEmailed: emailed });
  } catch (err) {
    console.error('createAdmin error:', err);
    res.status(500).json({ error: 'Failed to create admin' });
  }
};

// ─── PUT /api/admins/:id ────────────────────────────────────────────────────────
const updateAdmin = async (req, res) => {
  try {
    const { role, status, name, phone, address, nic } = req.body;
    const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
    if (!admin) return res.status(404).json({ error: 'Admin not found' });

    if (role)    admin.adminRole = role;
    if (status)  admin.isActive  = status === 'Active';
    if (name)    admin.name      = name;
    if (phone) {
      const normalized = normalizePhone(phone);
      if (!normalized) return res.status(400).json({ error: PHONE_RULE });
      admin.phone = normalized;
    }
    if (address !== undefined) admin.address = address;
    if (nic !== undefined)     admin.nic     = nic;
    if (req.file)              admin.profilePhoto = `/uploads/admin/${req.file.filename}`;

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
