import express from 'express';
import {
  getAdminEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  quickPublishEvent,
} from '../controllers/eventController.js';
import { protectAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(protectAdmin);

router.post('/quick-publish', quickPublishEvent);

router.route('/')
  .get(getAdminEvents)
  .post(createEvent);

router.route('/:id')
  .put(updateEvent)
  .delete(deleteEvent);

export default router;
