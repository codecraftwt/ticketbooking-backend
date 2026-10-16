import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { Admin } from '../models/Admin.js';
import { AuditLog } from '../models/AuditLog.js';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const generateToken = (id) => {
  return jwt.sign(
    { id },
    process.env.JWT_SECRET || 'dev_jwt_secret_fallback_key_2026',
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    }
  );
};

// POST /api/admin/auth/login
export const login = async (req, res) => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0].message,
      });
    }

    const { email, password } = parseResult.data;
    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: 'This account has been deactivated. Please contact your system administrator.',
      });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Update last login
    admin.lastLogin = new Date();
    await admin.save();

    // Log audit trail
    await AuditLog.create({
      adminId: admin._id,
      action: 'ADMIN_LOGIN',
      module: 'AUTH',
      targetId: admin._id.toString(),
      ipAddress: req.ip || req.connection?.remoteAddress,
      details: { email: admin.email, userAgent: req.headers['user-agent'] },
    });

    const token = generateToken(admin._id);

    res.json({
      success: true,
      message: 'Login successful.',
      data: {
        token,
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
        },
      },
    });
  } catch (error) {
    console.error('Admin Login Error:', error);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
};

// GET /api/admin/auth/me
export const getMe = async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        admin: req.admin,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error fetching profile.' });
  }
};

// POST /api/admin/auth/logout
export const logout = async (req, res) => {
  try {
    if (req.admin) {
      await AuditLog.create({
        adminId: req.admin._id,
        action: 'ADMIN_LOGOUT',
        module: 'AUTH',
        targetId: req.admin._id.toString(),
        ipAddress: req.ip,
      });
    }
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error during logout.' });
  }
};
