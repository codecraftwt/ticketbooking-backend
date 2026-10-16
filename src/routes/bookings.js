import express from 'express';
import { Booking } from '../models/Booking.js';
import { bookings as mockBookings } from '../data/mockData.js';

const router = express.Router();

// GET /api/bookings
router.get('/', async (req, res) => {
  try {
    const dbBookings = await Booking.find()
      .populate('eventId', 'title category posterImage')
      .populate('venueId', 'name city')
      .populate('hallId', 'name')
      .populate('showId', 'startTime')
      .sort({ createdAt: -1 });

    if (dbBookings.length > 0) {
      const formatted = dbBookings.map((b) => ({
        bookingId: b.bookingReference,
        bookingReference: b.bookingReference,
        customerName: b.guest.name,
        email: b.guest.email,
        phone: b.guest.phone,
        eventTitle: b.eventId?.title || 'Live Show',
        venueName: b.venueId?.name || 'Venue',
        hallName: b.hallId?.name || 'Auditorium',
        startTime: b.showId?.startTime,
        seats: b.seats.map((s) => s.seatId),
        totalAmount: b.totalAmount,
        status: b.bookingStatus,
        paymentStatus: b.paymentStatus,
        stripeId: b.stripePaymentIntentId,
        date: b.createdAt,
        qrCode: b.qrCodeData,
      }));
      return res.json({ success: true, count: formatted.length, data: formatted });
    }

    // Fallback to initial seed mock bookings
    res.json({
      success: true,
      count: mockBookings.length,
      data: mockBookings,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/bookings/:reference - Lookup booking by reference or ID
router.get('/:reference', async (req, res) => {
  try {
    const ref = req.params.reference.trim();
    const booking = await Booking.findOne({
      $or: [
        { bookingReference: { $regex: new RegExp(`^${ref}$`, 'i') } },
      ],
    })
      .populate('eventId', 'title category posterImage durationMinutes')
      .populate('venueId', 'name city address')
      .populate('hallId', 'name screenType')
      .populate('showId', 'startTime endTime');

    if (booking) {
      return res.json({
        success: true,
        data: {
          bookingId: booking.bookingReference,
          bookingReference: booking.bookingReference,
          customerName: booking.guest.name,
          email: booking.guest.email,
          phone: booking.guest.phone,
          eventTitle: booking.eventId?.title || 'Event',
          eventPoster: booking.eventId?.posterImage,
          venueName: booking.venueId?.name,
          venueAddress: booking.venueId?.address,
          hallName: booking.hallId?.name,
          screenType: booking.hallId?.screenType,
          startTime: booking.showId?.startTime,
          seats: booking.seats.map((s) => s.seatId),
          seatDetails: booking.seats,
          totalAmount: booking.totalAmount,
          status: booking.bookingStatus,
          paymentStatus: booking.paymentStatus,
          qrCode: booking.qrCodeData,
          date: booking.createdAt,
        },
      });
    }

    // Fallback mock check
    const mock = mockBookings.find((b) => b.bookingId.toLowerCase() === ref.toLowerCase());
    if (mock) {
      return res.json({ success: true, data: mock });
    }

    return res.status(404).json({ success: false, message: 'Booking reference not found.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
