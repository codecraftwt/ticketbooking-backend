import express from 'express';
import { getPublicEvents, getEventBySlug } from '../controllers/eventController.js';
import { getShowById } from '../controllers/showController.js';

const router = express.Router();

// GET /api/events - Public list of active events
router.get('/', getPublicEvents);

// GET /api/events/:slug - Public single event by slug with all showtimes
router.get('/:slug', getEventBySlug);

// Fallback GET /api/events/show/:id for direct show seat map queries
router.get('/show/:id', getShowById);

export default router;
