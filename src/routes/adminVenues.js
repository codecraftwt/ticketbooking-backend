import express from 'express';
import {
  getVenues,
  getVenueById,
  createVenue,
  updateVenue,
  deleteVenue,
} from '../controllers/venueController.js';
import { createHall, getHallById, deleteHall } from '../controllers/hallController.js';
import { protectAdmin } from '../middleware/auth.js';
import { Hall } from '../models/Hall.js';

const router = express.Router();

router.use(protectAdmin);

router.route('/')
  .get(getVenues)
  .post(createVenue);

router.route('/:id')
  .get(getVenueById)
  .put(updateVenue)
  .delete(deleteVenue);

// Nested auditorium / hall routes under a venue
router.post('/:venueId/halls', (req, res, next) => {
  req.body.venueId = req.params.venueId;
  createHall(req, res, next);
});

router.get('/:venueId/halls', async (req, res) => {
  try {
    const halls = await Hall.find({ venueId: req.params.venueId }).populate('activeLayoutId');
    res.json({ success: true, count: halls.length, data: halls });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
