import express from 'express';
import {
  getVenues,
  getVenueById,
  createVenue,
  updateVenue,
  deleteVenue,
} from '../controllers/venueController.js';
import { protectAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(protectAdmin);

router.route('/')
  .get(getVenues)
  .post(createVenue);

router.route('/:id')
  .get(getVenueById)
  .put(updateVenue)
  .delete(deleteVenue);

export default router;
