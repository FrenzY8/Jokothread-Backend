const express = require('express');
const router = express.Router();
const { authMiddleware, optionalAuth } = require('../middleware/authMiddleware');

const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  loginUser,
  toggleFollow,
  googleAuth,
  updatePrivacy,
  handleFollowRequest,
  verifyOTP,
  passwordOtpRequest,
  updatePasswordWithOtp,
  toggleBlock,
  getBlockedList,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  getMe
} = require('../controllers/userController');

router.get('/', getUsers);
router.get('/me', authMiddleware, getMe);
router.post('/register', createUser);
router.post('/verify-otp', verifyOTP);
router.post('/login', loginUser);
router.post('/google', googleAuth);

router.post('/password/request-otp', authMiddleware, passwordOtpRequest);
router.put('/password/update', authMiddleware, updatePasswordWithOtp);
router.post('/forgot-password', forgotPassword);
router.post('/verify-reset-otp', verifyResetOtp);
router.post('/reset-password', resetPassword);

router.patch('/privacy', authMiddleware, updatePrivacy);
router.get('/blocked-list', authMiddleware, getBlockedList);

router.post('/requests/:senderId', authMiddleware, handleFollowRequest);

// SPECIFIC STRING ROUTES //
router.post('/:id/follow', authMiddleware, toggleFollow);
router.post('/:id/block', authMiddleware, toggleBlock);

router.get('/:id', optionalAuth, getUserById);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

module.exports = router;