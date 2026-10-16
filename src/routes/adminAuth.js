import express from 'express';
import { login, getMe, logout } from '../controllers/adminAuthController.js';
import { protectAdmin } from '../middleware/auth.js';

const router = express.Router();

router.post('/login', login);
router.get('/me', protectAdmin, getMe);
router.post('/logout', protectAdmin, logout);

export default router;
