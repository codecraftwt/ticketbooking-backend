import { Event } from '../models/Event.js';
import { Show } from '../models/Show.js';

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
    const shows = await Show.find({ eventId: { $in: eventIds } });

    const formatted = events.map((evt) => {
      const eventShows = shows.filter((s) => s.eventId.toString() === evt._id.toString());
      return {
        ...evt.toObject(),
        showsCount: eventShows.length,
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
    // Delete scheduled shows for this event
    await Show.deleteMany({ eventId: event._id });
    await event.deleteOne();

    res.json({ success: true, message: 'Event and associated shows deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
