const bcrypt = require('bcryptjs');
const Admin = require('../models/User');

const getAssignableRoles = (role) => {
  if (role === 'Super Admin') return ['Main Admin', 'Operations Manager', 'Customer Support'];
  if (role === 'Main Admin')  return ['Operations Manager', 'Customer Support'];
  return [];
};

exports.getAll = async (req, res) => {
  try {
    const admins = await Admin.find({ role: 'admin' }).sort({ createdAt: 1 });
    res.json(admins);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.getById = async (req, res) => {
  try {
    const admin = await Admin.findOne({ _id: req.params.id, role: 'admin' });
    if (!admin) return res.status(404).json({ error: 'Admin not found' });
    res.json(admin);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.create = async (req, res) => {
  try {
    const { name, email, password, phone, address, role, nic } = req.body; // role here = the 4-tier value (e.g. 'Operations Manager')
    const assignable = getAssignableRoles(req.admin.adminRole);
    if (!assignable.includes(role)) return res.status(403).json({ error: `You cannot assign the role: ${role}` });

    const [firstName, ...rest] = name.trim().split(' ');
    const lastName = rest.join(' ') || firstName;

    const admin = await Admin.create({
      firstName, lastName, email,
      password: password || 'Default@123', // pre('save') hook hashes this automatically
      phone: phone || '', address: address || '',
      nic: nic || '',
      profilePhoto: req.file ? req.file.path : '',
      role: 'admin',
      adminRole: role,
      createdBy: req.admin.id,
    });
    const obj = admin.toObject();
    delete obj.password;
    res.status(201).json(obj);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Email already exists' });
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message).join(', ');
      return res.status(400).json({ error: messages });
    }
    console.error('Admin create error:', err);
    res.status(500).json({ error: 'Server error' });
}
};

exports.update = async (req, res) => {
  try {
    const target = await Admin.findOne({ _id: req.params.id, role: 'admin' });
    if (!target) return res.status(404).json({ error: 'Admin not found' });
    if (target.isSuperAdmin) return res.status(403).json({ error: 'Super Admin cannot be modified' });
    if (req.admin.adminRole === 'Main Admin' && target.adminRole === 'Main Admin') return res.status(403).json({ error: 'Not permitted' });

    const { role, status, name, phone, address, nic } = req.body;
    const updateData = { adminRole: role, adminStatus: status, phone, address, nic };
    if (req.file) updateData.profilePhoto = req.file.path;
    if (name) {
      const [firstName, ...rest] = name.trim().split(' ');
      updateData.firstName = firstName;
      updateData.lastName  = rest.join(' ') || firstName;
    }
    const updated = await Admin.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.deactivate = async (req, res) => {
  try {
    const target = await Admin.findOne({ _id: req.params.id, role: 'admin' });
    if (!target) return res.status(404).json({ error: 'Admin not found' });
    if (target.isSuperAdmin) return res.status(403).json({ error: 'Super Admin cannot be deactivated' });
    if (req.admin.adminRole === 'Main Admin' && target.adminRole === 'Main Admin') return res.status(403).json({ error: 'Not permitted' });
    await Admin.findByIdAndUpdate(req.params.id, { adminStatus: 'Inactive' });
    res.json({ message: 'Admin deactivated' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.activate = async (req, res) => {
  try {
    const target = await Admin.findOne({ _id: req.params.id, role: 'admin' });
    if (!target) return res.status(404).json({ error: 'Admin not found' });
    if (target.isSuperAdmin) return res.status(403).json({ error: 'Super Admin status cannot be modified' });
    if (req.admin.adminRole === 'Main Admin' && target.adminRole === 'Main Admin') return res.status(403).json({ error: 'Not permitted' });
    await Admin.findByIdAndUpdate(req.params.id, { adminStatus: 'Active' });
    res.json({ message: 'Admin activated' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.remove = async (req, res) => {
  try {
    const target = await Admin.findOne({ _id: req.params.id, role: 'admin' });
    if (!target) return res.status(404).json({ error: 'Admin not found' });
    if (target.isSuperAdmin) return res.status(403).json({ error: 'Super Admin cannot be deleted' });
    if (req.admin.adminRole === 'Main Admin' && target.adminRole === 'Main Admin') return res.status(403).json({ error: 'Not permitted' });
    await Admin.findByIdAndDelete(req.params.id);
    res.json({ message: 'Admin deleted' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};