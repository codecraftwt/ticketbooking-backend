import express from 'express';
import {
  createPaymentIntent,
  confirmPaymentAndBooking,
  getBookingDetails,
} from '../controllers/paymentController.js';

const router = express.Router();

router.post('/create-intent', createPaymentIntent);
router.post('/confirm', confirmPaymentAndBooking);
router.get('/booking/:reference', getBookingDetails);

export default router;
