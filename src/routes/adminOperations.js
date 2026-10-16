import express from 'express';
import {
  getAdminBookings,
  processRefund,
  getRevenueAnalytics,
  exportBookingsCSV,
  purgeAllBookings,
  getGatewaySettings,
  updateGatewaySettings,
} from '../controllers/adminOperationsController.js';
import { protectAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(protectAdmin);

router.get('/bookings', getAdminBookings);
router.delete('/bookings/purge', purgeAllBookings);

// Support both /refund (body.bookingId) and /bookings/:id/refund (params.id)
router.post('/refund', processRefund);
router.post('/bookings/:id/refund', (req, res, next) => {
  req.body.bookingId = req.params.id;
  processRefund(req, res, next);
});

router.get('/analytics', getRevenueAnalytics);

// Support both /export-csv and /export/bookings.csv
router.get('/export-csv', exportBookingsCSV);
router.get('/export/bookings.csv', exportBookingsCSV);

// Gateway Settings
router.get('/settings/gateway', getGatewaySettings);
router.put('/settings/gateway', updateGatewaySettings);

export default router;
