const authService = require('../services/authService');

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const register = async (req, res) => {
  try {
    const { firstName, lastName, email, password, phone } = req.body;
    if (!firstName || !lastName || !phone || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, phone, email and password are required',
      });
    }
    const result = await authService.registerUser({ firstName, lastName, email, password, phone });
    res.status(201).json({ success: true, message: 'OTP sent to your email', data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const verifyEmail = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required' });
    }
    const ip     = req.ip || req.socket.remoteAddress;
    const result = await authService.verifyEmail({ email, otp }, ip);
    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);
    res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      data: { user: result.user, accessToken: result.accessToken },
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const resendOtp = async (req, res) => {
  try {
    const { email, purpose } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    await authService.resendOtp({ email, purpose });
    res.status(200).json({ success: true, message: 'OTP resent.' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    const ip     = req.ip || req.socket.remoteAddress;
    const result = await authService.loginUser({ email, password }, ip);
    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);
    res.status(200).json({
      success: true,
      data: { user: result.user, accessToken: result.accessToken },
    });
  } catch (err) {
    res.status(401).json({ success: false, message: err.message });
  }
};

const forceChangePassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) {
      return res.status(400).json({ success: false, message: 'newPassword is required' });
    }
    const ip     = req.ip || req.socket.remoteAddress;
    const result = await authService.forceChangePassword(req.user._id, { newPassword }, ip);
    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);
    res.status(200).json({
      success: true,
      message: 'Password updated. Welcome to Cloud Laundry.',
      data: { user: result.user, accessToken: result.accessToken },
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ success: false, message: 'Google ID token is required' });
    }
    const ip     = req.ip || req.socket.remoteAddress;
    const result = await authService.googleAuth({ idToken }, ip);
    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);
    res.status(200).json({
      success: true,
      data: { user: result.user, accessToken: result.accessToken },
    });
  } catch (err) {
    res.status(401).json({ success: false, message: err.message });
  }
};

const refreshToken = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) {
      return res.status(401).json({ success: false, message: 'Refresh token not provided' });
    }
    const ip     = req.ip || req.socket.remoteAddress;
    const result = await authService.refreshAccessToken(token, ip);
    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);
    res.status(200).json({ success: true, data: { accessToken: result.accessToken } });
  } catch (err) {
    res.status(401).json({ success: false, message: err.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    await authService.forgotPassword(email);
    res.status(200).json({ success: true, message: 'A reset OTP has been sent to your email.' });
  } catch (err) {
    if (err.message === 'EMAIL_NOT_REGISTERED') {
      return res.status(404).json({
        success: false,
        message: 'This email is not registered. Please sign up first.',
        code: 'EMAIL_NOT_REGISTERED',
      });
    }
    res.status(500).json({ success: false, message: 'Failed to send OTP. Please try again.' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'Email, OTP and newPassword are required' });
    }
    await authService.resetPassword({ email, otp, newPassword });
    res.status(200).json({ success: true, message: 'Password reset successfully.' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const logout = async (req, res) => {
  try {
    await authService.logoutUser(req.user._id);
    res.clearCookie('refreshToken');
    res.status(200).json({ success: true, message: 'Logged out successfully.' });
  } catch {
    res.status(500).json({ success: false, message: 'Logout failed' });
  }
};

const getProfile = async (req, res) => {
  try {
    const user = await authService.getUserProfile(req.user._id);
    res.status(200).json({ success: true, data: user });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'currentPassword and newPassword are required' });
    }
    await authService.changePassword(req.user._id, { currentPassword, newPassword });
    res.clearCookie('refreshToken');
    res.status(200).json({ success: true, message: 'Password changed successfully. Please log in again.' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;
    const updated = await authService.updateUserProfile(req.user._id, { name, phone });
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

module.exports = {
  register,
  verifyEmail,
  resendOtp,
  login,
  forceChangePassword,
  googleLogin,
  refreshToken,
  forgotPassword,
  resetPassword,
  logout,
  getProfile,
  updateProfile,
  changePassword,
};