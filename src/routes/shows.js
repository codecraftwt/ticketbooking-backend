import express from 'express';
import { getShows, getShowById } from '../controllers/showController.js';

const router = express.Router();

router.get('/', getShows);
router.get('/:id', getShowById);

export default router;
