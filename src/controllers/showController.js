import { Show } from '../models/Show.js';
import { Event } from '../models/Event.js';
import { Hall } from '../models/Hall.js';
import { HallLayout } from '../models/HallLayout.js';
import { ShowSeat } from '../models/ShowSeat.js';

// GET /api/admin/shows & /api/shows
export const getShows = async (req, res) => {
  try {
    const { eventId, venueId, hallId, date } = req.query;
    const filter = {};

    if (eventId) filter.eventId = eventId;
    if (venueId) filter.venueId = venueId;
    if (hallId) filter.hallId = hallId;

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      filter.startTime = { $gte: startOfDay, $lte: endOfDay };
    }

    const shows = await Show.find(filter)
      .populate('eventId', 'title category posterImage durationMinutes slug')
      .populate('venueId', 'name city address')
      .populate('hallId', 'name screenType')
      .sort({ startTime: 1 });

    res.json({
      success: true,
      count: shows.length,
      data: shows,
    });
  } catch (error) {
    console.error('Error fetching shows:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/shows/:id - Get single show with layout & current seat inventory
export const getShowById = async (req, res) => {
  try {
    const show = await Show.findById(req.params.id)
      .populate('eventId')
      .populate('venueId')
      .populate('hallId');

    if (!show) {
      return res.status(404).json({ success: false, message: 'Show not found.' });
    }

    // Fetch layout snapshot
    const layout = await HallLayout.findById(show.layoutSnapshotId);

    // Fetch current seat inventory for this show
    const seats = await ShowSeat.find({ showId: show._id }).sort({ rowLabel: 1, seatNumber: 1 });

    res.json({
      success: true,
      data: {
        ...show.toObject(),
        layout,
        seats,
      },
    });
  } catch (error) {
    console.error('Error fetching show by id:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/admin/shows - Schedule a new show with collision prevention & seat inventory snapshot
export const createShow = async (req, res) => {
  try {
    const { eventId, venueId, hallId, startTime, endTime, pricing } = req.body;

    if (!eventId || !venueId || !hallId || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Event, Venue, Hall, Start Time, and End Time are required.',
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (start >= end) {
      return res.status(400).json({
        success: false,
        message: 'End time must be after start time.',
      });
    }

    // 1. Collision Prevention Algorithm: check if hall has an overlapping active show
    const clashingShow = await Show.findOne({
      hallId,
      status: { $ne: 'Cancelled' },
      startTime: { $lt: end },
      endTime: { $gt: start },
    }).populate('eventId', 'title');

    if (clashingShow) {
      return res.status(409).json({
        success: false,
        message: `Scheduling Conflict: Hall is already reserved for "${clashingShow.eventId?.title || 'Another Show'}" between ${new Date(
          clashingShow.startTime
        ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} and ${new Date(
          clashingShow.endTime
        ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
      });
    }

    // 2. Fetch the Hall and its active layout snapshot
    const hall = await Hall.findById(hallId);
    if (!hall || !hall.activeLayoutId) {
      return res.status(400).json({
        success: false,
        message: 'The selected hall does not have an active published layout. Please design and publish a layout first.',
      });
    }

    const layout = await HallLayout.findById(hall.activeLayoutId);
    if (!layout) {
      return res.status(400).json({
        success: false,
        message: 'Active layout snapshot not found for this hall.',
      });
    }

    // Pricing map default fallback
    const defaultPricing = [
      { tier: 'VIP', price: 45 },
      { tier: 'Premium', price: 30 },
      { tier: 'Standard', price: 20 },
      { tier: 'Recliner', price: 50 },
    ];
    const finalPricing = pricing && pricing.length > 0 ? pricing : defaultPricing;
    const priceByTier = {};
    finalPricing.forEach((p) => {
      priceByTier[p.tier] = p.price;
    });

    // 3. Create the Show record
    const show = new Show({
      eventId,
      venueId,
      hallId,
      layoutSnapshotId: layout._id,
      startTime: start,
      endTime: end,
      pricing: finalPricing,
      totalSeats: layout.totalSeats,
      bookedSeatsCount: 0,
      status: 'Open',
    });
    await show.save();

    // 4. Instantiate ShowSeat atomic inventory from layout seats
    const showSeatsToInsert = layout.seats.map((s) => {
      const tierPrice = priceByTier[s.tier] || 20;
      return {
        showId: show._id,
        seatId: s.id,
        rowLabel: s.rowLabel,
        seatNumber: s.seatNumber,
        tier: s.tier,
        price: tierPrice,
        x: s.x,
        y: s.y,
        isAccessible: s.isAccessible,
        isBlocked: s.isBlocked,
        status: s.isBlocked ? 'BLOCKED' : 'AVAILABLE',
      };
    });

    await ShowSeat.insertMany(showSeatsToInsert);

    const populatedShow = await Show.findById(show._id)
      .populate('eventId', 'title category posterImage')
      .populate('venueId', 'name city')
      .populate('hallId', 'name screenType');

    res.status(201).json({
      success: true,
      message: 'Show scheduled successfully with atomic seat inventory created.',
      data: populatedShow,
    });
  } catch (error) {
    console.error('Error creating show:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/admin/shows/:id - Update show
export const updateShow = async (req, res) => {
  try {
    const show = await Show.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!show) {
      return res.status(404).json({ success: false, message: 'Show not found.' });
    }
    res.json({ success: true, message: 'Show updated successfully.', data: show });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/admin/shows/:id - Cancel or delete show
export const cancelShow = async (req, res) => {
  try {
    const show = await Show.findById(req.params.id);
    if (!show) {
      return res.status(404).json({ success: false, message: 'Show not found.' });
    }

    show.status = 'Cancelled';
    await show.save();

    res.json({ success: true, message: 'Show status marked as Cancelled.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
