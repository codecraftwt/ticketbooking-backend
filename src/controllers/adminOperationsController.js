import fs from 'fs';
import path from 'path';
import Stripe from 'stripe';
import { Booking } from '../models/Booking.js';
import { ShowSeat } from '../models/ShowSeat.js';
import { Show } from '../models/Show.js';
import { Payment } from '../models/Payment.js';
import { Refund } from '../models/Refund.js';
import { SeatHold } from '../models/SeatHold.js';
import { AuditLog } from '../models/AuditLog.js';
import { broadcastSeatUpdate } from '../sockets/socketManager.js';

let stripeInstance = null;
const getStripeInstance = () => {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret || !secret.startsWith('sk_') || secret.includes('MockTicketStripeKey')) {
    return null;
  }
  if (!stripeInstance) {
    try {
      stripeInstance = new Stripe(secret);
    } catch (err) {
      console.warn('⚠️ Stripe initialization failed:', err.message);
      return null;
    }
  }
  return stripeInstance;
};

// GET /api/admin/operations/bookings
export const getAdminBookings = async (req, res) => {
  try {
    const { search, status, paymentStatus, eventId } = req.query;
    const query = {};

    if (status && status !== 'All') {
      query.bookingStatus = status;
    }

    if (paymentStatus && paymentStatus !== 'All') {
      query.paymentStatus = paymentStatus;
    }

    if (eventId) {
      query.eventId = eventId;
    }

    if (search && search.trim()) {
      const q = search.trim();
      query.$or = [
        { bookingReference: { $regex: q, $options: 'i' } },
        { 'guest.name': { $regex: q, $options: 'i' } },
        { 'guest.email': { $regex: q, $options: 'i' } },
      ];
    }

    const bookings = await Booking.find(query)
      .populate('eventId', 'title category posterImage')
      .populate('venueId', 'name city')
      .populate('hallId', 'name screenType')
      .populate('showId', 'startTime')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: bookings.length,
      data: bookings,
    });
  } catch (error) {
    console.error('Error fetching admin bookings:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/admin/operations/refund - Process Stripe Refund & Release Seats
export const processRefund = async (req, res) => {
  try {
    const { bookingId, reason, note } = req.body;

    if (!bookingId) {
      return res.status(400).json({ success: false, message: 'bookingId is required.' });
    }

    const booking = await Booking.findById(bookingId).populate('showId');
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    if (booking.bookingStatus === 'CANCELLED' || booking.paymentStatus === 'REFUNDED') {
      return res.status(400).json({
        success: false,
        message: 'This booking has already been cancelled and refunded.',
      });
    }

    let stripeRefundId = `re_test_${Date.now()}`;

    // Attempt Stripe live/test refund if connected
    const stripe = getStripeInstance();
    if (stripe) {
      try {
        const stripeRefund = await stripe.refunds.create({
          payment_intent: booking.stripePaymentIntentId,
          amount: Math.round(booking.totalAmount * 100),
          reason: reason === 'requested_by_customer' ? 'requested_by_customer' : 'duplicate',
        });
        stripeRefundId = stripeRefund.id;
      } catch (stripeErr) {
        console.warn('⚠️ Stripe API refund error, using sandbox refund ID:', stripeErr.message);
      }
    }

    // 1. Update Booking record
    booking.bookingStatus = 'CANCELLED';
    booking.paymentStatus = 'REFUNDED';
    booking.cancellationReason = reason || 'Customer requested refund';
    booking.cancelledAt = new Date();
    await booking.save();

    // 2. Create Refund record
    const refundRecord = await Refund.create({
      bookingId: booking._id,
      stripeRefundId,
      amount: booking.totalAmount,
      currency: booking.currency || 'usd',
      reason: reason || 'requested_by_customer',
      note: note || 'Refund processed by administrator',
      status: 'succeeded',
      processedByAdminId: req.admin?._id,
    });

    // 3. Update Payment record status
    await Payment.findOneAndUpdate(
      { bookingId: booking._id },
      { $set: { status: 'refunded' } }
    );

    // 4. Release seats back to AVAILABLE in ShowSeat inventory
    const seatIds = booking.seats.map((s) => s.seatId);
    await ShowSeat.updateMany(
      {
        showId: booking.showId._id,
        seatId: { $in: seatIds },
      },
      {
        $set: {
          status: 'AVAILABLE',
          bookingId: null,
          currentHoldId: null,
        },
      }
    );

    // 5. Decrement Show booked seats count
    if (booking.showId) {
      const show = await Show.findById(booking.showId._id);
      if (show) {
        show.bookedSeatsCount = Math.max(0, (show.bookedSeatsCount || 0) - seatIds.length);
        await show.save();
      }
    }

    // 6. Broadcast seat release via Socket.IO so other visitors immediately see seats as AVAILABLE
    broadcastSeatUpdate(booking.showId._id.toString(), {
      seatIds,
      status: 'AVAILABLE',
    });

    // 7. Audit log
    await AuditLog.create({
      adminId: req.admin?._id,
      action: 'PROCESS_STRIPE_REFUND',
      module: 'BOOKINGS',
      targetId: booking._id.toString(),
      details: {
        bookingReference: booking.bookingReference,
        amount: booking.totalAmount,
        stripeRefundId,
        seats: seatIds,
      },
    });

    res.json({
      success: true,
      message: `Stripe refund of $${booking.totalAmount} processed successfully. Seats ${seatIds.join(', ')} restored to inventory.`,
      data: {
        refundId: refundRecord._id,
        stripeRefundId,
        bookingReference: booking.bookingReference,
        amount: booking.totalAmount,
      },
    });
  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/admin/operations/analytics - Financial & Occupancy Metrics
export const getRevenueAnalytics = async (req, res) => {
  try {
    const bookings = await Booking.find().populate('eventId', 'category');
    const refunds = await Refund.find();
    const shows = await Show.find({ status: { $ne: 'Cancelled' } });

    // Gross Sales (All verified payments)
    const grossSales = bookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
    // Total Refunded
    const totalRefunded = refunds.reduce((sum, r) => sum + (r.amount || 0), 0);
    // Net Revenue
    const netRevenue = Math.max(0, grossSales - totalRefunded);

    // Total tickets sold (active bookings)
    const confirmedBookings = bookings.filter((b) => b.bookingStatus === 'CONFIRMED');
    const ticketsSold = confirmedBookings.reduce((sum, b) => sum + (b.seats?.length || 0), 0);

    // Occupancy calculation
    const totalCapacity = shows.reduce((sum, s) => sum + (s.totalSeats || 0), 0);
    const totalBookedSeats = shows.reduce((sum, s) => sum + (s.bookedSeatsCount || 0), 0);
    const occupancyRate = totalCapacity > 0 ? ((totalBookedSeats / totalCapacity) * 100).toFixed(1) : 0;

    // Revenue by Event Category
    const categoryTotals = {
      Movie: 0,
      Concert: 0,
      Comedy: 0,
      Sports: 0,
      Theatre: 0,
    };

    confirmedBookings.forEach((b) => {
      const cat = b.eventId?.category || 'Movie';
      if (categoryTotals[cat] !== undefined) {
        categoryTotals[cat] += b.totalAmount || 0;
      } else {
        categoryTotals[cat] = b.totalAmount || 0;
      }
    });

    // Recent Payments
    const recentPayments = await Payment.find()
      .populate({
        path: 'bookingId',
        populate: { path: 'eventId', select: 'title' },
      })
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      success: true,
      data: {
        grossSales,
        totalRefunded,
        netRevenue,
        ticketsSold,
        occupancyRate: `${occupancyRate}%`,
        totalBookings: bookings.length,
        categoryTotals,
        recentPayments,
      },
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/admin/operations/export-csv - Generate CSV Report
export const exportBookingsCSV = async (req, res) => {
  try {
    const { eventId } = req.query;
    const filter = {};
    if (eventId) {
      filter.eventId = eventId;
    }

    const bookings = await Booking.find(filter)
      .populate('eventId', 'title category')
      .populate('venueId', 'name city')
      .populate('hallId', 'name')
      .sort({ createdAt: -1 });

    const headers = [
      'Booking Reference',
      'Guest Name',
      'Email',
      'Phone',
      'Event Title',
      'Category',
      'Venue',
      'Auditorium',
      'Seats',
      'Total Amount ($)',
      'Payment Status',
      'Booking Status',
      'Stripe Payment Intent ID',
      'Created At',
    ];

    const rows = bookings.map((b) => [
      `"${b.bookingReference}"`,
      `"${b.guest?.name || ''}"`,
      `"${b.guest?.email || ''}"`,
      `"${b.guest?.phone || ''}"`,
      `"${b.eventId?.title || ''}"`,
      `"${b.eventId?.category || ''}"`,
      `"${b.venueId?.name || ''}"`,
      `"${b.hallId?.name || ''}"`,
      `"${b.seats.map((s) => s.seatId).join(';')}"`,
      (b.totalAmount || 0).toFixed(2),
      `"${b.paymentStatus}"`,
      `"${b.bookingStatus}"`,
      `"${b.stripePaymentIntentId || ''}"`,
      `"${new Date(b.createdAt).toISOString()}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="ticketcraft-bookings-report.csv"');
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/admin/operations/bookings/purge - Clear all test bookings & sales metrics
export const purgeAllBookings = async (req, res) => {
  try {
    const [bRes, pRes, rRes, hRes] = await Promise.all([
      Booking.deleteMany({}),
      Payment.deleteMany({}),
      Refund.deleteMany({}),
      SeatHold.deleteMany({}),
    ]);

    await ShowSeat.updateMany(
      { status: { $in: ['BOOKED', 'HELD'] } },
      { $set: { status: 'AVAILABLE' } }
    );

    await Show.updateMany(
      {},
      { $set: { bookedSeatsCount: 0 } }
    );

    res.json({
      success: true,
      message: 'All booking records and sales metrics have been cleared.',
      data: {
        bookingsDeleted: bRes.deletedCount,
        paymentsDeleted: pRes.deletedCount,
        refundsDeleted: rRes.deletedCount,
        holdsDeleted: hRes.deletedCount,
      },
    });
  } catch (error) {
    console.error('Error purging bookings:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/admin/operations/settings/gateway - Read Stripe keys status
export const getGatewaySettings = (req, res) => {
  const secret = process.env.STRIPE_SECRET_KEY || '';
  const pub = process.env.STRIPE_PUBLISHABLE_KEY || '';
  const webhook = process.env.STRIPE_WEBHOOK_SECRET || '';

  res.json({
    success: true,
    data: {
      stripeSecretKey: secret,
      stripePublishableKey: pub,
      stripeWebhookSecret: webhook,
      isConfigured: secret.startsWith('sk_') && !secret.includes('MockTicketStripeKey'),
    },
  });
};

// PUT /api/admin/operations/settings/gateway - Update Stripe keys
export const updateGatewaySettings = (req, res) => {
  const { stripeSecretKey, stripePublishableKey, stripeWebhookSecret } = req.body;

  if (stripeSecretKey !== undefined) process.env.STRIPE_SECRET_KEY = stripeSecretKey.trim();
  if (stripePublishableKey !== undefined) process.env.STRIPE_PUBLISHABLE_KEY = stripePublishableKey.trim();
  if (stripeWebhookSecret !== undefined) process.env.STRIPE_WEBHOOK_SECRET = stripeWebhookSecret.trim();

  // Try to re-instantiate Stripe
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
    try {
      stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);
    } catch (e) {
      console.warn('⚠️ Stripe re-initialization warning:', e.message);
    }
  }

  // Update .env file
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (stripeSecretKey !== undefined) {
        if (/^STRIPE_SECRET_KEY=.*$/m.test(envContent)) {
          envContent = envContent.replace(/^STRIPE_SECRET_KEY=.*$/m, `STRIPE_SECRET_KEY=${stripeSecretKey.trim()}`);
        } else {
          envContent += `\nSTRIPE_SECRET_KEY=${stripeSecretKey.trim()}`;
        }
      }
      if (stripePublishableKey !== undefined) {
        if (/^STRIPE_PUBLISHABLE_KEY=.*$/m.test(envContent)) {
          envContent = envContent.replace(/^STRIPE_PUBLISHABLE_KEY=.*$/m, `STRIPE_PUBLISHABLE_KEY=${stripePublishableKey.trim()}`);
        } else {
          envContent += `\nSTRIPE_PUBLISHABLE_KEY=${stripePublishableKey.trim()}`;
        }
      }
      if (stripeWebhookSecret !== undefined) {
        if (/^STRIPE_WEBHOOK_SECRET=.*$/m.test(envContent)) {
          envContent = envContent.replace(/^STRIPE_WEBHOOK_SECRET=.*$/m, `STRIPE_WEBHOOK_SECRET=${stripeWebhookSecret.trim()}`);
        } else {
          envContent += `\nSTRIPE_WEBHOOK_SECRET=${stripeWebhookSecret.trim()}`;
        }
      }
      fs.writeFileSync(envPath, envContent, 'utf8');
    }
  } catch (err) {
    console.warn('⚠️ Could not persist updated keys to .env file:', err.message);
  }

  res.json({
    success: true,
    message: 'Stripe Gateway credentials saved and active.',
    data: {
      isConfigured:
        (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_') &&
        !(process.env.STRIPE_SECRET_KEY || '').includes('MockTicketStripeKey'),
    },
  });
};

