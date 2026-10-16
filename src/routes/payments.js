import express from 'express';
import {
  createPaymentIntent,
  confirmPaymentAndBooking,
  getBookingDetails,
  getPaymentConfig,
  handleStripeWebhook,
} from '../controllers/paymentController.js';

const router = express.Router();

router.get('/config', getPaymentConfig);
router.post('/create-intent', createPaymentIntent);
router.post('/confirm', confirmPaymentAndBooking);
router.get('/booking/:reference', getBookingDetails);
router.post('/webhook', handleStripeWebhook);

export default router;
