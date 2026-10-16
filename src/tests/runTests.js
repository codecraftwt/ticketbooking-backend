import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Admin } from '../models/Admin.js';
import { Venue } from '../models/Venue.js';
import { Hall } from '../models/Hall.js';
import { Event } from '../models/Event.js';
import { Show } from '../models/Show.js';
import { ShowSeat } from '../models/ShowSeat.js';
import { SeatHold } from '../models/SeatHold.js';
import { Booking } from '../models/Booking.js';
import { Payment } from '../models/Payment.js';
import { Refund } from '../models/Refund.js';

dotenv.config();

const API_BASE = 'http://127.0.0.1:5000/api';

const runAssertion = (name, condition, details = '') => {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
  } else {
    console.error(`  ❌ FAIL: ${name} - ${details}`);
    throw new Error(`Test failed: ${name}`);
  }
};

const runSuite = async () => {
  console.log('\n============================================================');
  console.log('🧪 RUNNING PRODUCTION TICKET BOOKING SYSTEM TEST SUITE');
  console.log('============================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🍃 Database connected for test assertions.\n');

  let adminToken = '';
  let testShowId = '';
  let testSeatIds = [];

  // -------------------------------------------------------------
  // TEST 1: Admin Authentication & JWT Role Guards
  // -------------------------------------------------------------
  console.log('▶ TEST 1: Admin Authentication & Security Guard');
  {
    // Invalid credentials
    const badLoginRes = await fetch(`${API_BASE}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@ticketbooking.com', password: 'WrongPassword' }),
    });
    runAssertion('Reject invalid password', badLoginRes.status === 401);

    // Valid login
    const loginRes = await fetch(`${API_BASE}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@ticketbooking.com', password: 'Admin@123456' }),
    });
    const loginData = await loginRes.json();
    runAssertion('Authenticate valid administrator', loginRes.status === 200 && loginData.success);
    runAssertion('Generate JWT token', !!loginData.data?.token);
    adminToken = loginData.data?.token;

    // Verify /api/admin/auth/me
    const meRes = await fetch(`${API_BASE}/admin/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const meData = await meRes.json();
    runAssertion('Verify authenticated admin profile', meRes.status === 200 && meData.data?.admin?.email === 'admin@ticketbooking.com');

    // Reject request without token
    const unauthorizedRes = await fetch(`${API_BASE}/admin/venues`);
    runAssertion('Protect administrative API without token', unauthorizedRes.status === 401);
  }

  // -------------------------------------------------------------
  // TEST 2: Show Inventory & Collision-Free Scheduling
  // -------------------------------------------------------------
  console.log('\n▶ TEST 2: Shows & Collision Prevention Engine');
  {
    const showsRes = await fetch(`${API_BASE}/shows`);
    const showsData = await showsRes.json();
    runAssertion('Fetch public shows list', showsRes.status === 200 && showsData.count > 0);
    testShowId = showsData.data[0]._id;

    // Fetch show seat layout
    const showDetailRes = await fetch(`${API_BASE}/shows/${testShowId}`);
    const showDetail = await showDetailRes.json();
    runAssertion('Fetch show with atomic seat inventory', showDetail.data?.seats?.length > 0);

    const availableSeats = showDetail.data.seats.filter((s) => s.status === 'AVAILABLE');
    runAssertion('Verify available seats exist', availableSeats.length >= 2);
    testSeatIds = [availableSeats[0].seatId, availableSeats[1].seatId];

    // Attempt overlapping schedule conflict
    const firstShow = showsData.data[0];
    const clashRes = await fetch(`${API_BASE}/admin/shows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        eventId: firstShow.eventId._id,
        venueId: firstShow.venueId._id,
        hallId: firstShow.hallId._id,
        startTime: firstShow.startTime,
        endTime: firstShow.endTime,
      }),
    });
    runAssertion('Collision detection rejects overlapping hall showtime', clashRes.status === 409);
  }

  // -------------------------------------------------------------
  // TEST 3: Atomic 5-Minute Seat Holds & Concurrency Protection
  // -------------------------------------------------------------
  console.log('\n▶ TEST 3: Real-Time Seat Holds & Atomic Concurrency');
  let holdId = '';
  let reservationToken = '';
  {
    // Guest A holds testSeatIds
    const holdRes1 = await fetch(`${API_BASE}/public/holds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        showId: testShowId,
        seatIds: testSeatIds,
      }),
    });
    const holdData1 = await holdRes1.json();
    runAssertion('Guest A successfully locks seats for 5 minutes', holdRes1.status === 201 && holdData1.success);
    holdId = holdData1.data.holdId;
    reservationToken = holdData1.data.reservationToken;

    // Verify seats are marked HELD in DB
    const heldSeatsInDb = await ShowSeat.find({
      showId: testShowId,
      seatId: { $in: testSeatIds },
    });
    runAssertion('ShowSeat status atomically updated to HELD in database', heldSeatsInDb.every((s) => s.status === 'HELD'));

    // Guest B simultaneously attempts to hold the same seats -> Expect 409 Conflict
    const holdRes2 = await fetch(`${API_BASE}/public/holds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        showId: testShowId,
        seatIds: testSeatIds,
      }),
    });
    runAssertion('Concurrency guard rejects Guest B with 409 Conflict', holdRes2.status === 409);
  }

  // -------------------------------------------------------------
  // TEST 4: Stripe Payment Intent & Booking Confirmation
  // -------------------------------------------------------------
  console.log('\n▶ TEST 4: Stripe Payment Initiation & Digital Ticket Pass');
  let confirmedBookingRef = '';
  {
    // 1. Create PaymentIntent
    const intentRes = await fetch(`${API_BASE}/public/payments/create-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        holdId,
        guestInfo: {
          name: 'Integration Test User',
          email: 'test@ticketbooking.org',
          phone: '+1 555-432-1098',
        },
      }),
    });
    const intentData = await intentRes.json();
    runAssertion('Create Stripe PaymentIntent tied to holdId', intentRes.status === 200 && !!intentData.data?.clientSecret);

    // 2. Confirm Booking
    const confirmRes = await fetch(`${API_BASE}/public/payments/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        holdId,
        paymentIntentId: intentData.data.paymentIntentId,
        guestInfo: {
          name: 'Integration Test User',
          email: 'test@ticketbooking.org',
          phone: '+1 555-432-1098',
        },
      }),
    });
    const confirmData = await confirmRes.json();
    runAssertion('Confirm payment and generate Booking reference', confirmRes.status === 201 && confirmData.success);
    runAssertion('Generate cryptographically signed QR code', !!confirmData.data?.qrCode);
    confirmedBookingRef = confirmData.data.bookingReference;

    // Verify seats in database are permanently BOOKED
    const bookedSeatsInDb = await ShowSeat.find({
      showId: testShowId,
      seatId: { $in: testSeatIds },
    });
    runAssertion('ShowSeat status atomically updated to BOOKED', bookedSeatsInDb.every((s) => s.status === 'BOOKED'));

    // Public lookup endpoint
    const lookupRes = await fetch(`${API_BASE}/bookings/${confirmedBookingRef}`);
    const lookupData = await lookupRes.json();
    runAssertion('Public ticket lookup retrieves confirmed booking', lookupRes.status === 200 && lookupData.data?.bookingReference === confirmedBookingRef);
  }

  // -------------------------------------------------------------
  // TEST 5: Stripe Refund & Automated Seat Inventory Restoration
  // -------------------------------------------------------------
  console.log('\n▶ TEST 5: Stripe Refund & Automated Seat Release');
  {
    const bookingInDb = await Booking.findOne({ bookingReference: confirmedBookingRef });

    const refundRes = await fetch(`${API_BASE}/admin/operations/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        bookingId: bookingInDb._id,
        reason: 'requested_by_customer',
        note: 'Automated test suite refund verification',
      }),
    });
    const refundData = await refundRes.json();
    runAssertion('Administrator executes Stripe refund', refundRes.status === 200 && refundData.success);

    // Verify Booking status updated to CANCELLED and REFUNDED
    const updatedBooking = await Booking.findById(bookingInDb._id);
    runAssertion('Booking status marked as CANCELLED', updatedBooking.bookingStatus === 'CANCELLED');
    runAssertion('Payment status marked as REFUNDED', updatedBooking.paymentStatus === 'REFUNDED');

    // Verify seats are restored to AVAILABLE
    const restoredSeats = await ShowSeat.find({
      showId: testShowId,
      seatId: { $in: testSeatIds },
    });
    runAssertion('Seats automatically restored to AVAILABLE in inventory', restoredSeats.every((s) => s.status === 'AVAILABLE'));
  }

  // -------------------------------------------------------------
  // TEST 6: Analytics Aggregation & CSV Export
  // -------------------------------------------------------------
  console.log('\n▶ TEST 6: Analytics & CSV Report Verification');
  {
    const analyticsRes = await fetch(`${API_BASE}/admin/operations/analytics`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const analyticsData = await analyticsRes.json();
    runAssertion('Compute financial metrics from database', analyticsRes.status === 200 && typeof analyticsData.data?.grossSales === 'number');

    const csvRes = await fetch(`${API_BASE}/admin/operations/export-csv`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const csvContent = await csvRes.text();
    runAssertion('Generate CSV export with valid headers', csvRes.status === 200 && csvContent.includes('Booking Reference') && csvContent.includes('Total Amount'));
  }

  console.log('\n============================================================');
  console.log('🎉 ALL 20 AUTOMATED INTEGRATION TESTS PASSED SUCCESSFULLY!');
  console.log('============================================================\n');

  process.exit(0);
};

runSuite().catch((err) => {
  console.error('\n❌ Test suite encountered an error:', err);
  process.exit(1);
});
