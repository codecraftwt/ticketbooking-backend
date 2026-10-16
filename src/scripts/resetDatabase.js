import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Admin } from '../models/Admin.js';
import { Venue } from '../models/Venue.js';
import { Hall } from '../models/Hall.js';
import { HallLayout } from '../models/HallLayout.js';
import { Event } from '../models/Event.js';
import { Show } from '../models/Show.js';
import { ShowSeat } from '../models/ShowSeat.js';
import { SeatHold } from '../models/SeatHold.js';
import { Booking } from '../models/Booking.js';
import { Payment } from '../models/Payment.js';
import { Refund } from '../models/Refund.js';
import { AuditLog } from '../models/AuditLog.js';

dotenv.config();

const resetDatabase = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI not found in environment.');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('🍃 Connected to MongoDB Atlas.');

    console.log('🧹 Purging all collections except Admin...');

    const [
      venuesRes,
      hallsRes,
      layoutsRes,
      eventsRes,
      showsRes,
      showSeatsRes,
      holdsRes,
      bookingsRes,
      paymentsRes,
      refundsRes,
      auditLogsRes,
    ] = await Promise.all([
      Venue.deleteMany({}),
      Hall.deleteMany({}),
      HallLayout.deleteMany({}),
      Event.deleteMany({}),
      Show.deleteMany({}),
      ShowSeat.deleteMany({}),
      SeatHold.deleteMany({}),
      Booking.deleteMany({}),
      Payment.deleteMany({}),
      Refund.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);

    console.log(`   - Venues deleted:      ${venuesRes.deletedCount}`);
    console.log(`   - Halls deleted:       ${hallsRes.deletedCount}`);
    console.log(`   - Hall Layouts deleted:${layoutsRes.deletedCount}`);
    console.log(`   - Events deleted:      ${eventsRes.deletedCount}`);
    console.log(`   - Shows deleted:       ${showsRes.deletedCount}`);
    console.log(`   - ShowSeats deleted:   ${showSeatsRes.deletedCount}`);
    console.log(`   - SeatHolds deleted:   ${holdsRes.deletedCount}`);
    console.log(`   - Bookings deleted:    ${bookingsRes.deletedCount}`);
    console.log(`   - Payments deleted:    ${paymentsRes.deletedCount}`);
    console.log(`   - Refunds deleted:     ${refundsRes.deletedCount}`);
    console.log(`   - AuditLogs deleted:   ${auditLogsRes.deletedCount}`);

    // Ensure Admin exists and password is fresh
    const defaultEmail = 'admin@ticketbooking.com';
    let admin = await Admin.findOne({ email: defaultEmail });

    if (!admin) {
      admin = new Admin({
        name: 'System Administrator',
        email: defaultEmail,
        password: 'Admin@123456',
        role: 'superadmin',
        isActive: true,
      });
      await admin.save();
      console.log('✅ Created fresh Administrator account.');
    } else {
      admin.password = 'Admin@123456';
      admin.isActive = true;
      admin.role = 'superadmin';
      await admin.save();
      console.log('✅ Existing Administrator account verified & password synchronized.');
    }

    console.log('\n=========================================');
    console.log('🎉 DATABASE HAS BEEN FULLY CLEARED FRESH');
    console.log('=========================================');
    console.log('🔐 ADMIN LOGIN CREDENTIALS:');
    console.log(`   URL:      http://localhost:5173/admin/login`);
    console.log(`   Email:    admin@ticketbooking.com`);
    console.log(`   Password: Admin@123456`);
    console.log('=========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error resetting database:', error);
    process.exit(1);
  }
};

resetDatabase();
