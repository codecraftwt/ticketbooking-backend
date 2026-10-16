import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Admin } from '../models/Admin.js';

dotenv.config();

const seedAdmin = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI not found in environment.');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('🍃 Connected to MongoDB Atlas.');

    const defaultEmail = 'admin@ticketbooking.com';
    const existing = await Admin.findOne({ email: defaultEmail });

    if (existing) {
      console.log(`ℹ️ Default administrator already exists (${defaultEmail}).`);
      process.exit(0);
    }

    const newAdmin = new Admin({
      name: 'System Administrator',
      email: defaultEmail,
      password: 'Admin@123456',
      role: 'superadmin',
      isActive: true,
    });

    await newAdmin.save();
    console.log('✅ Default administrator created successfully!');
    console.log(`   Email:    ${defaultEmail}`);
    console.log('   Password: Admin@123456');
    console.log('   Role:     superadmin');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding administrator:', error);
    process.exit(1);
  }
};

seedAdmin();
