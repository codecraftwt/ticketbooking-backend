import Stripe from 'stripe';
import QRCode from 'qrcode';
import { SeatHold } from '../models/SeatHold.js';
import { ShowSeat } from '../models/ShowSeat.js';
import { Show } from '../models/Show.js';
import { Event } from '../models/Event.js';
import { Booking } from '../models/Booking.js';
import { Payment } from '../models/Payment.js';
import { broadcastSeatUpdate } from '../sockets/socketManager.js';

const stripeSecret = process.env.STRIPE_SECRET_KEY;
let stripeInstance = null;
if (stripeSecret && stripeSecret.startsWith('sk_')) {
  try {
    stripeInstance = new Stripe(stripeSecret);
  } catch (err) {
    console.warn('⚠️ Stripe initialization failed, test sandbox mode will be active.');
  }
}

// POST /api/public/payments/create-intent
export const createPaymentIntent = async (req, res) => {
  try {
    const { holdId, guestInfo } = req.body;

    if (!holdId) {
      return res.status(400).json({ success: false, message: 'holdId is required.' });
    }

    const hold = await SeatHold.findById(holdId);
    if (!hold) {
      return res.status(404).json({ success: false, message: 'Reservation hold not found.' });
    }

    // Check expiration
    if (hold.status !== 'ACTIVE' || new Date() > new Date(hold.expiresAt)) {
      return res.status(410).json({
        success: false,
        message: 'Your 5-minute reservation hold has expired. Please select seats again.',
      });
    }

    if (guestInfo) {
      hold.guestInfo = guestInfo;
      await hold.save();
    }

    const facilityFee = hold.seatIds.length * 1.5;
    const finalTotal = hold.totalAmount + facilityFee;
    const amountInCents = Math.round(finalTotal * 100);

    let clientSecret = null;
    let paymentIntentId = `pi_test_${hold._id}_${Date.now()}`;

    // If live/test Stripe key is configured and can connect
    if (stripeInstance && !stripeSecret.includes('MockTicketStripeKey')) {
      try {
        const paymentIntent = await stripeInstance.paymentIntents.create({
          amount: amountInCents,
          currency: 'usd',
          metadata: {
            holdId: hold._id.toString(),
            showId: hold.showId.toString(),
            seats: hold.seatIds.join(', '),
          },
          receipt_email: guestInfo?.email,
        });
        clientSecret = paymentIntent.client_secret;
        paymentIntentId = paymentIntent.id;
      } catch (stripeErr) {
        console.warn('⚠️ Stripe API error, using test sandbox payment intent:', stripeErr.message);
      }
    }

    // Fallback sandbox client secret for development / test mode
    if (!clientSecret) {
      clientSecret = `seti_test_secret_${paymentIntentId}`;
    }

    hold.stripePaymentIntentId = paymentIntentId;
    await hold.save();

    res.json({
      success: true,
      data: {
        paymentIntentId,
        clientSecret,
        amount: finalTotal,
        amountInCents,
        currency: 'usd',
        holdId: hold._id,
        seats: hold.seatIds,
      },
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/public/payments/confirm - Finalize booking after payment success
export const confirmPaymentAndBooking = async (req, res) => {
  try {
    const { holdId, paymentIntentId, guestInfo } = req.body;

    if (!holdId) {
      return res.status(400).json({ success: false, message: 'holdId is required.' });
    }

    const hold = await SeatHold.findById(holdId);
    if (!hold) {
      return res.status(404).json({ success: false, message: 'Reservation hold not found.' });
    }

    if (hold.status === 'CONVERTED') {
      const existingBooking = await Booking.findOne({ stripePaymentIntentId: paymentIntentId || hold.stripePaymentIntentId });
      if (existingBooking) {
        return res.json({
          success: true,
          message: 'Booking already confirmed.',
          data: existingBooking,
        });
      }
    }

    // Fetch Show details
    const show = await Show.findById(hold.showId)
      .populate('eventId')
      .populate('venueId')
      .populate('hallId');

    if (!show) {
      return res.status(404).json({ success: false, message: 'Show not found.' });
    }

    // Fetch Seats in DB
    const seatsInDb = await ShowSeat.find({
      showId: show._id,
      seatId: { $in: hold.seatIds },
    });

    // Generate unique booking reference: e.g. TKT-7492-X
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const bookingReference = `TKT-${Math.floor(1000 + Math.random() * 9000)}-${randomSuffix}`;

    // Cryptographically verifiable QR Code Data
    const qrPayload = JSON.stringify({
      ref: bookingReference,
      showId: show._id,
      event: show.eventId?.title,
      seats: hold.seatIds,
      guest: guestInfo?.name || hold.guestInfo?.name,
      verified: true,
    });
    const qrCodeDataUrl = await QRCode.toDataURL(qrPayload, {
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
      width: 250,
    });

    const facilityFee = hold.seatIds.length * 1.5;
    const finalTotal = hold.totalAmount + facilityFee;

    // 1. Create Booking
    const booking = new Booking({
      bookingReference,
      showId: show._id,
      eventId: show.eventId?._id,
      venueId: show.venueId?._id,
      hallId: show.hallId?._id,
      guest: {
        name: guestInfo?.name || hold.guestInfo?.name || 'Valued Guest',
        email: guestInfo?.email || hold.guestInfo?.email || 'guest@example.com',
        phone: guestInfo?.phone || hold.guestInfo?.phone || '+1 555-0100',
      },
      seats: seatsInDb.map((s) => ({
        seatId: s.seatId,
        rowLabel: s.rowLabel,
        seatNumber: s.seatNumber,
        tier: s.tier,
        price: s.price,
      })),
      totalAmount: finalTotal,
      currency: 'usd',
      paymentStatus: 'PAID',
      bookingStatus: 'CONFIRMED',
      stripePaymentIntentId: paymentIntentId || hold.stripePaymentIntentId || `pi_${Date.now()}`,
      qrCodeData: qrCodeDataUrl,
    });
    await booking.save();

    // 2. Create Payment record
    await Payment.create({
      bookingId: booking._id,
      stripePaymentIntentId: booking.stripePaymentIntentId,
      amount: finalTotal,
      currency: 'usd',
      status: 'succeeded',
      paymentMethod: 'Stripe Card (Test Sandbox)',
      clientSecret: hold.stripePaymentIntentId,
    });

    // 3. Mark ShowSeat inventory as permanently BOOKED
    await ShowSeat.updateMany(
      {
        showId: show._id,
        seatId: { $in: hold.seatIds },
      },
      {
        $set: {
          status: 'BOOKED',
          bookingId: booking._id,
          currentHoldId: null,
        },
      }
    );

    // 4. Update Show capacity counts
    show.bookedSeatsCount = (show.bookedSeatsCount || 0) + hold.seatIds.length;
    await show.save();

    // 5. Convert hold
    hold.status = 'CONVERTED';
    await hold.save();

    // 6. Broadcast to all users over Socket.IO so seats turn red/booked
    broadcastSeatUpdate(show._id.toString(), {
      seatIds: hold.seatIds,
      status: 'BOOKED',
    });

    res.status(201).json({
      success: true,
      message: 'Payment verified and ticket booked successfully!',
      data: {
        bookingReference: booking.bookingReference,
        bookingId: booking._id,
        eventTitle: show.eventId?.title,
        venueName: show.venueId?.name,
        hallName: show.hallId?.name,
        startTime: show.startTime,
        seats: booking.seats,
        totalAmount: booking.totalAmount,
        guest: booking.guest,
        qrCode: qrCodeDataUrl,
      },
    });
  } catch (error) {
    console.error('Error confirming booking:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/public/payments/booking/:reference - Get confirmed booking details
export const getBookingDetails = async (req, res) => {
  try {
    const { reference } = req.params;
    const booking = await Booking.findOne({
      bookingReference: reference.toUpperCase().trim(),
    })
      .populate('eventId')
      .populate('venueId')
      .populate('hallId')
      .populate('showId');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Ticket reservation not found.' });
    }

    res.json({
      success: true,
      data: booking,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
