import express from 'express';
import {
  createHall,
  getHallById,
  updateHall,
  deleteHall,
  saveHallLayout,
} from '../controllers/hallController.js';
import { protectAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(protectAdmin);

router.post('/', createHall);

router.route('/:id')
  .get(getHallById)
  .put(updateHall)
  .delete(deleteHall);

router.route('/:id/layout')
  .post(saveHallLayout)
  .put(saveHallLayout);

export default router;
