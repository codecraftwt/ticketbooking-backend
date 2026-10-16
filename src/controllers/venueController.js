import { Venue } from '../models/Venue.js';
import { Hall } from '../models/Hall.js';
import { HallLayout } from '../models/HallLayout.js';

// GET /api/admin/venues - Get all venues with their halls
export const getVenues = async (req, res) => {
  try {
    const venues = await Venue.find().sort({ createdAt: -1 });
    // Fetch halls for each venue
    const venueIds = venues.map((v) => v._id);
    const halls = await Hall.find({ venueId: { $in: venueIds } }).populate('activeLayoutId');

    const venuesWithHalls = venues.map((venue) => {
      const venueHalls = halls.filter((h) => h.venueId.toString() === venue._id.toString());
      return {
        ...venue.toObject(),
        halls: venueHalls,
      };
    });

    res.json({
      success: true,
      count: venuesWithHalls.length,
      data: venuesWithHalls,
    });
  } catch (error) {
    console.error('Error fetching venues:', error);
    res.status(500).json({ success: false, message: 'Server error fetching venues.' });
  }
};

// GET /api/admin/venues/:id - Get single venue
export const getVenueById = async (req, res) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found.' });
    }
    const halls = await Hall.find({ venueId: venue._id }).populate('activeLayoutId');
    res.json({
      success: true,
      data: {
        ...venue.toObject(),
        halls,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error fetching venue.' });
  }
};

// POST /api/admin/venues - Create a new venue
export const createVenue = async (req, res) => {
  try {
    const { name, city, address, contactPhone, contactEmail, amenities, image } = req.body;
    if (!name || !city || !address) {
      return res.status(400).json({
        success: false,
        message: 'Name, city, and address are required fields.',
      });
    }

    const venue = await Venue.create({
      name,
      city,
      address,
      contactPhone,
      contactEmail,
      amenities: amenities || ['Dolby Atmos', 'Parking', 'Food Court', 'Wheelchair Access'],
      image: image || 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=800&auto=format&fit=crop&q=80',
    });

    res.status(201).json({
      success: true,
      message: 'Venue created successfully.',
      data: venue,
    });
  } catch (error) {
    console.error('Error creating venue:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/admin/venues/:id - Update venue
export const updateVenue = async (req, res) => {
  try {
    const venue = await Venue.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found.' });
    }
    res.json({ success: true, message: 'Venue updated successfully.', data: venue });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/admin/venues/:id - Delete venue and associated halls
export const deleteVenue = async (req, res) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found.' });
    }
    const halls = await Hall.find({ venueId: venue._id });
    const hallIds = halls.map((h) => h._id);

    // Clean up layouts and halls
    await HallLayout.deleteMany({ hallId: { $in: hallIds } });
    await Hall.deleteMany({ venueId: venue._id });
    await venue.deleteOne();

    res.json({ success: true, message: 'Venue and all associated halls deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
