import express from 'express';
import {
  getAdminBookings,
  processRefund,
  getRevenueAnalytics,
  exportBookingsCSV,
} from '../controllers/adminOperationsController.js';
import { protectAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(protectAdmin);

router.get('/bookings', getAdminBookings);
router.post('/refund', processRefund);
router.get('/analytics', getRevenueAnalytics);
router.get('/export-csv', exportBookingsCSV);

export default router;
