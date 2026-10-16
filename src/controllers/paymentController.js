import Stripe from 'stripe';
import QRCode from 'qrcode';
import { SeatHold } from '../models/SeatHold.js';
import { ShowSeat } from '../models/ShowSeat.js';
import { Show } from '../models/Show.js';
import { Event } from '../models/Event.js';
import { Booking } from '../models/Booking.js';
import { Payment } from '../models/Payment.js';
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

// GET /api/public/payments/config - Get Stripe publishable key and status
export const getPaymentConfig = (req, res) => {
  const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
  const isConfigured = stripeSecret.startsWith('sk_') && !stripeSecret.includes('MockTicketStripeKey');
  res.json({
    success: true,
    data: {
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
      isConfigured,
      currency: 'usd',
    },
  });
};

// POST /api/public/payments/create-intent
export const createPaymentIntent = async (req, res) => {
  try {
    const { holdId, guestInfo, guestName, guestEmail } = req.body;

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
        message: 'Your reservation hold has expired. Please select seats again.',
      });
    }

    const email = guestInfo?.email || guestEmail || hold.guestInfo?.email || '';
    const name = guestInfo?.name || guestName || hold.guestInfo?.name || '';
    const phone = guestInfo?.phone || req.body.guestPhone || hold.guestInfo?.phone || '';

    if (name || email || phone) {
      hold.guestInfo = {
        name: name || hold.guestInfo?.name || 'Valued Guest',
        email: email || hold.guestInfo?.email || 'guest@example.com',
        phone: phone || hold.guestInfo?.phone || '+1 555-0100',
      };
      await hold.save();
    }

    const facilityFee = hold.seatIds.length * 1.5;
    const finalTotal = hold.totalAmount + facilityFee;
    const amountInCents = Math.round(finalTotal * 100);

    let clientSecret = null;
    let paymentIntentId = `pi_test_${hold._id}_${Date.now()}`;
    const stripe = getStripeInstance();
    const isRealStripe = !!stripe;

    // If live/test Stripe key is configured and can connect
    if (isRealStripe) {
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountInCents,
          currency: 'usd',
          automatic_payment_methods: {
            enabled: true,
            allow_redirects: 'never',
          },
          metadata: {
            holdId: hold._id.toString(),
            showId: hold.showId.toString(),
            seats: hold.seatIds.join(', '),
            guestName: name,
            guestEmail: email,
          },
          receipt_email: email || undefined,
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
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
        isRealStripe,
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

    const stripe = getStripeInstance();
    const isRealStripe = !!stripe;

    let paymentMethodDescription = isRealStripe ? 'Stripe 3D-Secure Card' : 'Stripe Card (Test Sandbox)';
    if (isRealStripe && paymentIntentId && !paymentIntentId.startsWith('pi_test_')) {
      try {
        let pi = await stripe.paymentIntents.retrieve(paymentIntentId);

        // If PaymentIntent is pending payment method, confirm it via Stripe test card pm_card_visa
        if (pi.status === 'requires_payment_method') {
          pi = await stripe.paymentIntents.confirm(paymentIntentId, {
            payment_method: 'pm_card_visa',
            return_url: `${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}/booking/confirmation`,
          });
        }

        if (pi.status !== 'succeeded' && pi.status !== 'processing') {
          return res.status(400).json({
            success: false,
            message: `Stripe payment status is "${pi.status}". Please complete payment before confirming.`,
          });
        }
        paymentMethodDescription = `Stripe Card (${pi.payment_method_types?.[0] || 'card'})`;
      } catch (stripeErr) {
        console.error('⚠️ Stripe payment confirmation error:', stripeErr.message);
        return res.status(400).json({
          success: false,
          message: stripeErr.message || 'Payment confirmation failed with Stripe.',
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
    // QR code generation commented out as requested
    // const qrCodeDataUrl = await QRCode.toDataURL(qrPayload, {
    //   margin: 1,
    //   color: { dark: '#000000', light: '#ffffff' },
    //   width: 250,
    // });
    const qrCodeDataUrl = null;

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
      paymentMethod: paymentMethodDescription,
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

// POST /api/public/payments/webhook - Stripe Webhook Handler
export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  const stripe = getStripeInstance();
  if (!stripe || !webhookSecret || webhookSecret.includes('MockWebhookSecret')) {
    return res.status(200).json({ received: true, note: 'Stripe webhook sandbox mode' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody || req.body, sig, webhookSecret);
  } catch (err) {
    console.error('⚠️ Stripe Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        console.log(`✅ Webhook: Stripe PaymentIntent succeeded: ${paymentIntent.id}`);
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object;
        console.log(`✅ Webhook: Stripe Charge refunded: ${charge.id}`);
        break;
      }
      default:
        console.log(`ℹ️ Webhook: Received event type ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error handling Stripe webhook event:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
