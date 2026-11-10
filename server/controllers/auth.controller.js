const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const getJwtSecret = () => process.env.JWT_SECRET || 'super_secret_orderpay_jwt_token_2026_dev';

exports.register = async (req, res) => {
  try {
    const { name, email, password, businessName, businessType = 'kirana' } = req.body;

    if (!name || !email || !password || !businessName) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password, and business name are required.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    // Hash password with bcrypt
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Each new registered business gets its own unique businessId
    const businessId = new mongoose.Types.ObjectId();

    const user = await User.create({
      businessId,
      businessName: businessName.trim(),
      businessType,
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: 'owner',
    });

    const token = jwt.sign(
      {
        userId: user._id,
        businessId: user.businessId,
        email: user.email,
        role: user.role,
      },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        businessId: user.businessId,
        businessName: user.businessName,
        businessType: user.businessType,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('[Auth Error - Register]:', error);
    return res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const token = jwt.sign(
      {
        userId: user._id,
        businessId: user.businessId,
        email: user.email,
        role: user.role,
      },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        businessId: user.businessId,
        businessName: user.businessName,
        businessType: user.businessType,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('[Auth Error - Login]:', error);
    return res.status(500).json({ success: false, message: 'Server error during login.' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        businessId: user.businessId,
        businessName: user.businessName,
        businessType: user.businessType,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('[Auth Error - getMe]:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching user profile.' });
  }
};
