import express from 'express';
import {
  getShows,
  getShowById,
  createShow,
  updateShow,
  cancelShow,
} from '../controllers/showController.js';
import { protectAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(protectAdmin);

router.route('/')
  .get(getShows)
  .post(createShow);

router.route('/:id')
  .get(getShowById)
  .put(updateShow)
  .delete(cancelShow);

export default router;
