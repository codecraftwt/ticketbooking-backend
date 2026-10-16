import express from 'express';
import {
  createSeatHold,
  releaseSeatHold,
  getSeatHold,
} from '../controllers/holdController.js';

const router = express.Router();

router.post('/', createSeatHold);
router.get('/:id', getSeatHold);
router.delete('/:id', releaseSeatHold);

export default router;
