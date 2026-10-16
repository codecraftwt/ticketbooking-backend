import { Event } from '../models/Event.js';
import { Show } from '../models/Show.js';
import { Venue } from '../models/Venue.js';
import { Hall } from '../models/Hall.js';
import { HallLayout } from '../models/HallLayout.js';
import { ShowSeat } from '../models/ShowSeat.js';
import { SeatHold } from '../models/SeatHold.js';

// Helper to generate slug from title
const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
};

// GET /api/events - Public events listing
export const getPublicEvents = async (req, res) => {
  try {
    const { category, search } = req.query;
    const filter = { status: 'Published' };

    if (category && category !== 'All') {
      filter.category = category;
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { genre: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
      ];
    }

    const events = await Event.find(filter).sort({ createdAt: -1 });

    // Fetch next upcoming show for each event
    const eventIds = events.map((e) => e._id);
    const upcomingShows = await Show.find({
      eventId: { $in: eventIds },
      startTime: { $gte: new Date() },
      status: { $in: ['Scheduled', 'Open'] },
    })
      .sort({ startTime: 1 })
      .populate('venueId', 'name city');

    const formatted = events.map((evt) => {
      const show = upcomingShows.find((s) => s.eventId.toString() === evt._id.toString());
      const minPrice = show?.pricing?.length
        ? Math.min(...show.pricing.map((p) => p.price))
        : 25;

      return {
        id: evt._id,
        _id: evt._id,
        title: evt.title,
        slug: evt.slug,
        category: evt.category,
        genre: evt.genre || 'General',
        durationMinutes: evt.durationMinutes,
        poster: evt.posterImage,
        banner: evt.bannerImage,
        description: evt.description,
        rating: 4.9,
        price: minPrice,
        venue: show?.venueId?.name ? `${show.venueId.name}, ${show.venueId.city}` : 'IMAX Grand Cinema',
        date: show ? new Date(show.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Upcoming',
        time: show ? new Date(show.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '19:30',
        availableSeatsCount: show ? (show.totalSeats - show.bookedSeatsCount) : 84,
        nextShowId: show?._id,
      };
    });

    res.json({
      success: true,
      count: formatted.length,
      data: formatted,
    });
  } catch (error) {
    console.error('Error fetching public events:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/events/:slug - Public single event by slug with all shows
export const getEventBySlug = async (req, res) => {
  try {
    const event = await Event.findOne({ slug: req.params.slug.toLowerCase() });
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    const shows = await Show.find({
      eventId: event._id,
      status: { $ne: 'Cancelled' },
    })
      .populate('venueId', 'name city address')
      .populate('hallId', 'name screenType')
      .sort({ startTime: 1 });

    res.json({
      success: true,
      data: {
        ...event.toObject(),
        shows,
      },
    });
  } catch (error) {
    console.error('Error fetching event by slug:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin: GET /api/admin/events
export const getAdminEvents = async (req, res) => {
  try {
    const events = await Event.find().sort({ createdAt: -1 });
    const eventIds = events.map((e) => e._id);
    const shows = await Show.find({ eventId: { $in: eventIds }, status: { $ne: 'Cancelled' } })
      .populate('venueId', 'name city address')
      .populate('hallId', 'name screenType activeLayoutId')
      .sort({ startTime: 1 });

    const formatted = events.map((evt) => {
      const eventShows = shows.filter((s) => s.eventId.toString() === evt._id.toString());
      return {
        ...evt.toObject(),
        showsCount: eventShows.length,
        shows: eventShows,
        primaryVenue: eventShows[0]?.venueId,
        primaryHall: eventShows[0]?.hallId,
      };
    });

    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin: POST /api/admin/events - Create new event
export const createEvent = async (req, res) => {
  try {
    const {
      title,
      slug,
      category,
      genre,
      description,
      durationMinutes,
      posterImage,
      bannerImage,
      ageRating,
      cancellationPolicy,
      status,
    } = req.body;

    if (!title || !category || !description) {
      return res.status(400).json({
        success: false,
        message: 'Title, category, and description are required.',
      });
    }

    const finalSlug = slug ? slugify(slug) : slugify(title);

    // Check slug collision
    const existing = await Event.findOne({ slug: finalSlug });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `An event with slug "${finalSlug}" already exists. Please customize the slug.`,
      });
    }

    const event = await Event.create({
      title,
      slug: finalSlug,
      category,
      genre: genre || 'Feature',
      description,
      durationMinutes: durationMinutes || 120,
      posterImage: posterImage || 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80',
      bannerImage: bannerImage || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1600&auto=format&fit=crop&q=80',
      ageRating: ageRating || 'UA',
      cancellationPolicy,
      status: status || 'Published',
      publishedAt: status === 'Published' ? new Date() : null,
    });

    res.status(201).json({
      success: true,
      message: 'Event created successfully.',
      data: event,
    });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin: PUT /api/admin/events/:id - Update event
export const updateEvent = async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }
    res.json({ success: true, message: 'Event updated successfully.', data: event });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin: DELETE /api/admin/events/:id
export const deleteEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    // 1. Find all scheduled shows for this event
    const shows = await Show.find({ eventId: event._id });
    const showIds = shows.map((s) => s._id);

    if (showIds.length > 0) {
      // 2. Cascade delete show seats and active holds
      await ShowSeat.deleteMany({ showId: { $in: showIds } });
      await SeatHold.deleteMany({ showId: { $in: showIds } });
      // 3. Delete the shows themselves
      await Show.deleteMany({ _id: { $in: showIds } });
    }

    // 4. Delete the event record
    await Event.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: `Event "${event.title}" and its ${showIds.length} scheduled show(s) deleted successfully.`,
    });
  } catch (error) {
    console.error('Error in deleteEvent:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin: POST /api/admin/events/quick-publish - 1-Click All-in-One Publisher
export const quickPublishEvent = async (req, res) => {
  try {
    const {
      title,
      category,
      genre,
      durationMinutes,
      description,
      posterImage,
      bannerImage,
      ageRating,
      venueName,
      venueCity,
      venueAddress,
      contactEmail,
      contactPhone,
      hallName,
      screenType,
      date,
      startTime,
      pricing,
      layoutPreset,
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'Event title and description are required.' });
    }

    // 1. Resolve or Create Venue
    const vName = (venueName || 'Grand Cinema Complex').trim();
    let venue = await Venue.findOne({ name: { $regex: new RegExp(`^${vName}$`, 'i') } });
    if (!venue) {
      venue = await Venue.create({
        name: vName,
        city: venueCity || 'Metro City',
        address: venueAddress || '100 Entertainment Blvd',
        amenities: ['Dolby Atmos', 'Parking', 'Food Court', 'Wheelchair Access'],
        image: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=800&auto=format&fit=crop&q=80',
      });
    }

    // 2. Create Hall
    const sType = screenType || 'IMAX';
    const hName = (hallName || `${sType} Screen 1`).trim();
    const hall = await Hall.create({
      venueId: venue._id,
      name: hName,
      screenType: sType,
      capacity: 96,
      totalRows: 8,
    });

    // 3. Generate Layout (General Admission or Numbered Seats)
    const { seatingType, generalAdmissionCapacity, rowsConfig, customSeats } = req.body;
    let layoutSeats = [];
    let totalRowsCount = 8;

    if (seatingType === 'GeneralAdmission') {
      const cap = Math.max(1, Math.min(2500, parseInt(generalAdmissionCapacity) || 100));
      const seatsPerRow = Math.min(20, cap);
      totalRowsCount = Math.ceil(cap / seatsPerRow);
      const mainTier = (pricing && pricing.length > 0) ? pricing[0].tier : 'General Admission';

      for (let i = 1; i <= cap; i++) {
        const rIndex = Math.floor((i - 1) / seatsPerRow);
        const colIndex = ((i - 1) % seatsPerRow) + 1;
        const rowChar = String.fromCharCode(65 + (rIndex % 26));

        layoutSeats.push({
          id: `GA-${i}`,
          rowLabel: `GA`,
          seatNumber: i,
          tier: mainTier,
          sectionId: 'main',
          x: 140 + colIndex * 40,
          y: 140 + rIndex * 40,
          isAccessible: false,
          isBlocked: false,
          isActive: true,
        });
      }
    } else if (Array.isArray(customSeats) && customSeats.length > 0) {
      layoutSeats = customSeats.map((s, idx) => ({
        id: s.id || `${s.rowLabel}${s.seatNumber}`,
        rowLabel: s.rowLabel,
        seatNumber: s.seatNumber,
        tier: s.tier || 'Standard',
        sectionId: s.tier === 'VIP' ? 'vip' : s.tier === 'Premium' ? 'premium' : 'main',
        x: s.x ?? (140 + s.seatNumber * 55),
        y: s.y ?? (140 + idx * 30),
        isAccessible: !!s.isAccessible,
        isBlocked: !!s.isBlocked,
        isActive: s.isActive !== false,
      }));
      const distinctRows = [...new Set(layoutSeats.map((s) => s.rowLabel))];
      totalRowsCount = distinctRows.length;
    } else if (Array.isArray(rowsConfig) && rowsConfig.length > 0) {
      totalRowsCount = rowsConfig.length;
      rowsConfig.forEach((row, rowIndex) => {
        const rowLabel = row.rowLabel || String.fromCharCode(65 + rowIndex);
        const count = parseInt(row.seatCount) || 12;
        const tier = row.tier || (rowIndex < 2 ? 'VIP' : 'Standard');
        const disabled = Array.isArray(row.disabledSeats) ? row.disabledSeats : [];

        for (let num = 1; num <= count; num++) {
          if (!disabled.includes(num)) {
            layoutSeats.push({
              id: `${rowLabel}${num}`,
              rowLabel,
              seatNumber: num,
              tier,
              sectionId: tier === 'VIP' ? 'vip' : tier === 'Premium' ? 'premium' : 'main',
              x: 140 + num * 55,
              y: 140 + rowIndex * 60,
              isAccessible: rowIndex === 0 && (num === 1 || num === count),
              isBlocked: false,
              isActive: true,
            });
          }
        }
      });
    } else {
      let rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      let seatsPerRow = 12;

      if (layoutPreset === 'compact-60') {
        rows = ['A', 'B', 'C', 'D', 'E'];
        seatsPerRow = 10;
      } else if (layoutPreset === 'grand-120') {
        rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
        seatsPerRow = 12;
      }
      totalRowsCount = rows.length;

      rows.forEach((rowLabel, rowIndex) => {
        let tier = 'Standard';
        if (rowIndex < 2) tier = 'VIP';
        else if (rowIndex < 4) tier = 'Premium';

        for (let num = 1; num <= seatsPerRow; num++) {
          layoutSeats.push({
            id: `${rowLabel}${num}`,
            rowLabel,
            seatNumber: num,
            tier,
            sectionId: 'main',
            x: 140 + num * 55,
            y: 140 + rowIndex * 60,
            isAccessible: rowIndex === 0 && (num === 1 || num === seatsPerRow),
            isBlocked: false,
            isActive: true,
          });
        }
      });
    }

    const layout = await HallLayout.create({
      hallId: hall._id,
      version: 1,
      isPublished: true,
      canvasWidth: 950,
      canvasHeight: 750,
      stage: {
        label: seatingType === 'GeneralAdmission' ? 'OPEN ADMISSION / EVENT STAGE' : `${hall.screenType} CURVED SCREEN / STAGE`,
        position: 'top',
        width: 600,
        yOffset: 40,
      },
      sections: (pricing && pricing.length > 0 ? pricing : [
        { tier: 'VIP', price: 40 },
        { tier: 'Premium', price: 30 },
        { tier: 'Standard', price: 20 },
        { tier: 'Recliner', price: 50 },
      ]).map((p) => ({
        id: p.tier.toLowerCase().replace(/\s+/g, '-'),
        name: p.tier,
        tier: p.tier,
        defaultPrice: p.price,
        color: p.color || (p.tier === 'VIP' ? '#f59e0b' : p.tier === 'Premium' ? '#8b5cf6' : p.tier === 'Recliner' ? '#ec4899' : '#3b82f6'),
      })),
      seats: layoutSeats,
      totalSeats: layoutSeats.length,
      accessibleSeatsCount: layoutSeats.filter((s) => s.isAccessible).length,
    });

    hall.activeLayoutId = layout._id;
    hall.capacity = layoutSeats.length;
    hall.totalRows = totalRowsCount;
    await hall.save();

    // 4. Create Event
    let finalSlug = slugify(title);
    const existingEvt = await Event.findOne({ slug: finalSlug });
    if (existingEvt) {
      finalSlug = `${finalSlug}-${Date.now().toString().slice(-4)}`;
    }

    const event = await Event.create({
      title,
      slug: finalSlug,
      category: category || 'Movie',
      genre: genre || 'Action / Drama',
      description,
      durationMinutes: parseInt(durationMinutes) || 120,
      posterImage:
        posterImage ||
        'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80',
      bannerImage:
        bannerImage ||
        'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1600&auto=format&fit=crop&q=80',
      ageRating: ageRating || 'UA',
      cancellationPolicy: 'Free cancellation up to 4 hours before showtime. 100% refund processed through Stripe.',
      contactEmail: (contactEmail || '').trim(),
      contactPhone: (contactPhone || '').trim(),
      status: 'Published',
      publishedAt: new Date(),
    });

    // 5. Schedule Showtime
    const today = new Date();
    const showDate = date || today.toISOString().split('T')[0];
    const showTime = startTime || '19:30';
    const startIso = new Date(`${showDate}T${showTime}:00`);
    const duration = parseInt(durationMinutes) || 120;
    const endIso = new Date(startIso.getTime() + duration * 60000);

    const finalPricing = pricing && pricing.length > 0 ? pricing : [
      { tier: 'VIP', price: 40 },
      { tier: 'Premium', price: 30 },
      { tier: 'Standard', price: 20 },
      { tier: 'Recliner', price: 50 },
    ];

    const priceByTier = {};
    finalPricing.forEach((p) => {
      priceByTier[p.tier] = p.price;
    });

    const show = await Show.create({
      eventId: event._id,
      venueId: venue._id,
      hallId: hall._id,
      layoutSnapshotId: layout._id,
      startTime: startIso,
      endTime: endIso,
      pricing: finalPricing,
      totalSeats: layoutSeats.length,
      bookedSeatsCount: 0,
      status: 'Open',
      seatingType: seatingType === 'GeneralAdmission' ? 'GeneralAdmission' : 'NumberedSeats',
    });

    // 6. Generate ShowSeat Inventory
    const showSeatsToInsert = layoutSeats.map((s) => ({
      showId: show._id,
      seatId: s.id,
      rowLabel: s.rowLabel,
      seatNumber: s.seatNumber,
      tier: s.tier,
      price: priceByTier[s.tier] || 20,
      x: s.x,
      y: s.y,
      isAccessible: s.isAccessible,
      isBlocked: s.isBlocked,
      status: s.isBlocked ? 'BLOCKED' : 'AVAILABLE',
    }));

    await ShowSeat.insertMany(showSeatsToInsert);

    res.status(201).json({
      success: true,
      message: 'Event, venue, seating map, and showtime published in 1 step! Live on store.',
      data: {
        event,
        show,
        venue,
        hall,
        layout,
      },
    });
  } catch (error) {
    console.error('Error in quickPublishEvent:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
