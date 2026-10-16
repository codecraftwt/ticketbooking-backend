import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Booking } from '../models/Booking.js';
import { Payment } from '../models/Payment.js';
import { Refund } from '../models/Refund.js';
import { SeatHold } from '../models/SeatHold.js';
import { ShowSeat } from '../models/ShowSeat.js';
import { Show } from '../models/Show.js';

dotenv.config();

const cleanBookings = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI not found in environment.');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('🍃 Connected to MongoDB.');

    console.log('🧹 Purging bookings, payments, refunds, and seat holds...');

    const [bRes, pRes, rRes, hRes] = await Promise.all([
      Booking.deleteMany({}),
      Payment.deleteMany({}),
      Refund.deleteMany({}),
      SeatHold.deleteMany({}),
    ]);

    console.log(`   - Bookings deleted:   ${bRes.deletedCount}`);
    console.log(`   - Payments deleted:   ${pRes.deletedCount}`);
    console.log(`   - Refunds deleted:    ${rRes.deletedCount}`);
    console.log(`   - SeatHolds deleted:  ${hRes.deletedCount}`);

    // Reset all show seats back to AVAILABLE
    const seatUpdateRes = await ShowSeat.updateMany(
      { status: { $in: ['BOOKED', 'HELD'] } },
      { $set: { status: 'AVAILABLE' } }
    );
    console.log(`   - Booked seats reset to AVAILABLE: ${seatUpdateRes.modifiedCount}`);

    // Reset all show bookedSeatsCount to 0
    const showUpdateRes = await Show.updateMany(
      {},
      { $set: { bookedSeatsCount: 0 } }
    );
    console.log(`   - Shows reset bookedSeatsCount to 0: ${showUpdateRes.modifiedCount}`);

    console.log('\n✅ ALL BOOKING AND FINANCIAL SALES DATA HAS BEEN CLEANED TO 0!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error cleaning bookings:', error);
    process.exit(1);
  }
};

cleanBookings();
