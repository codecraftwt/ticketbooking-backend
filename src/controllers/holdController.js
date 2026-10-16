import crypto from 'crypto';
import { SeatHold } from '../models/SeatHold.js';
import { ShowSeat } from '../models/ShowSeat.js';
import { Show } from '../models/Show.js';
import { broadcastSeatUpdate } from '../sockets/socketManager.js';

// Clean up expired holds helper
export const cleanupExpiredHoldsForShow = async (showId) => {
  try {
    const now = new Date();
    const expiredHolds = await SeatHold.find({
      ...(showId ? { showId } : {}),
      status: 'ACTIVE',
      expiresAt: { $lt: now },
    });

    for (const hold of expiredHolds) {
      hold.status = 'EXPIRED';
      await hold.save();

      // Release seats back to AVAILABLE (only if still HELD with this holdId)
      await ShowSeat.updateMany(
        {
          showId: hold.showId,
          seatId: { $in: hold.seatIds },
          status: 'HELD',
          currentHoldId: hold._id,
        },
        {
          $set: { status: 'AVAILABLE', currentHoldId: null },
        }
      );

      // Broadcast release event to all connected guests in room
      broadcastSeatUpdate(hold.showId.toString(), {
        seatIds: hold.seatIds,
        status: 'AVAILABLE',
      });
    }
  } catch (error) {
    console.error('Error in cleanupExpiredHolds:', error);
  }
};

// POST /api/public/holds - Create 5-minute atomic seat reservation hold
export const createSeatHold = async (req, res) => {
  try {
    const { showId, seatIds, guestInfo } = req.body;

    if (!showId || !seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'showId and an array of seatIds are required.',
      });
    }

    if (seatIds.length > 8) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 8 seats can be reserved in a single transaction.',
      });
    }

    // 1. Run lazy cleanup of any expired holds for this show first
    await cleanupExpiredHoldsForShow(showId);

    // 2. Query the requested seats in database
    const seatsInDb = await ShowSeat.find({
      showId,
      seatId: { $in: seatIds },
    });

    if (seatsInDb.length !== seatIds.length) {
      return res.status(404).json({
        success: false,
        message: 'One or more selected seats do not exist for this show.',
      });
    }

    // 3. Concurrency check: Ensure ALL requested seats are currently AVAILABLE
    const unavailableSeats = seatsInDb.filter((s) => s.status !== 'AVAILABLE');
    if (unavailableSeats.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Seats unavailable: ${unavailableSeats.map((s) => s.seatId).join(', ')} already held or booked by another guest.`,
        unavailableSeatIds: unavailableSeats.map((s) => s.seatId),
      });
    }

    // 4. Calculate total amount directly from database seat prices (never trust client)
    const totalAmount = seatsInDb.reduce((acc, curr) => acc + curr.price, 0);

    // 5. Generate secure reservation token and 5-minute expiration
    const reservationToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 300 seconds

    const hold = new SeatHold({
      showId,
      seatIds,
      reservationToken,
      expiresAt,
      guestInfo: guestInfo || {},
      totalAmount,
      currency: 'usd',
      status: 'ACTIVE',
    });
    await hold.save();

    // 6. Atomically lock seats to HELD
    const updateResult = await ShowSeat.updateMany(
      {
        showId,
        seatId: { $in: seatIds },
        status: 'AVAILABLE',
      },
      {
        $set: {
          status: 'HELD',
          currentHoldId: hold._id,
        },
      }
    );

    // If update count !== seatIds.length, race condition occurred
    if (updateResult.modifiedCount !== seatIds.length) {
      // Rollback
      await ShowSeat.updateMany(
        { showId, currentHoldId: hold._id },
        { $set: { status: 'AVAILABLE', currentHoldId: null } }
      );
      hold.status = 'RELEASED';
      await hold.save();

      return res.status(409).json({
        success: false,
        message: 'Seats were just selected by another guest. Please pick alternative seats.',
      });
    }

    // 7. Broadcast real-time Socket.IO event to all connected browsers in room `show_:id`
    broadcastSeatUpdate(showId.toString(), {
      seatIds,
      status: 'HELD',
      expiresAt,
    });

    res.status(201).json({
      success: true,
      message: `Seats locked successfully for 5 minutes.`,
      data: {
        holdId: hold._id,
        reservationToken,
        showId,
        seatIds,
        seats: seatsInDb.map((s) => ({
          seatId: s.seatId,
          rowLabel: s.rowLabel,
          seatNumber: s.seatNumber,
          tier: s.tier,
          price: s.price,
        })),
        totalAmount,
        expiresAt,
        remainingSeconds: 300,
      },
    });
  } catch (error) {
    console.error('Error creating seat hold:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/public/holds/:id - Release held seats early
export const releaseSeatHold = async (req, res) => {
  try {
    const { id } = req.params;
    const { reservationToken } = req.body;

    const hold = await SeatHold.findById(id);
    if (!hold) {
      return res.status(404).json({ success: false, message: 'Hold not found.' });
    }

    // Verify token if provided
    if (reservationToken && hold.reservationToken !== reservationToken) {
      return res.status(403).json({ success: false, message: 'Invalid reservation token.' });
    }

    if (hold.status === 'ACTIVE') {
      hold.status = 'RELEASED';
      await hold.save();

      // Release seats back to AVAILABLE
      await ShowSeat.updateMany(
        {
          showId: hold.showId,
          seatId: { $in: hold.seatIds },
          currentHoldId: hold._id,
        },
        {
          $set: { status: 'AVAILABLE', currentHoldId: null },
        }
      );

      // Broadcast Socket update
      broadcastSeatUpdate(hold.showId.toString(), {
        seatIds: hold.seatIds,
        status: 'AVAILABLE',
      });
    }

    res.json({
      success: true,
      message: 'Seats released back to available inventory.',
    });
  } catch (error) {
    console.error('Error releasing seat hold:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/public/holds/:id - Check status & remaining time of a hold
export const getSeatHold = async (req, res) => {
  try {
    const { id } = req.params;
    const hold = await SeatHold.findById(id).populate('showId');

    if (!hold) {
      return res.status(404).json({ success: false, message: 'Reservation hold not found.' });
    }

    const now = new Date();
    const remainingSeconds = Math.max(0, Math.floor((new Date(hold.expiresAt) - now) / 1000));

    if (remainingSeconds === 0 && hold.status === 'ACTIVE') {
      hold.status = 'EXPIRED';
      await hold.save();
      await ShowSeat.updateMany(
        { showId: hold.showId, currentHoldId: hold._id },
        { $set: { status: 'AVAILABLE', currentHoldId: null } }
      );
      broadcastSeatUpdate(hold.showId.toString(), {
        seatIds: hold.seatIds,
        status: 'AVAILABLE',
      });
    }

    res.json({
      success: true,
      data: {
        ...hold.toObject(),
        remainingSeconds,
        isExpired: remainingSeconds === 0 || hold.status !== 'ACTIVE',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
