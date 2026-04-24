const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const profileController = require('../controllers/profileController');

router.get('/search', auth, profileController.searchProfiles);
router.get('/suggestions', auth, profileController.getConnectionSuggestions);
router.get('/', auth, profileController.getProfile);
router.get('/requests', auth, profileController.getConnectionRequests);
router.get('/connections', auth, profileController.getConnections);
router.get('/notifications', auth, profileController.getNotifications);
router.patch('/notifications/:notificationId/read', auth, profileController.markNotificationAsRead);
router.delete('/notifications/:notificationId', auth, profileController.deleteNotification);
router.post('/:id/request-connection', auth, profileController.requestConnection);
router.post('/requests/:id/accept', auth, profileController.acceptConnectionRequest);
router.post('/requests/:id/reject', auth, profileController.rejectConnectionRequest);
router.get('/security-logs', auth, profileController.getSecurityLogs);
router.get('/security-data/export', auth, profileController.exportSecurityData);
router.post('/security-logs/logout-other', auth, profileController.logoutOtherSessions);
router.post('/security-logs/sessions/:sessionId/logout', auth, profileController.logoutSession);
router.post('/security-alert/confirm', auth, profileController.confirmSecurityAlert);
router.post('/security-account/secure', auth, profileController.secureAccount);

// E2EE Public Key endpoints
router.post('/publickey', auth, profileController.savePublicKey);
router.get('/publickey/:userId', auth, profileController.getPublicKey);

router.get('/:id', auth, profileController.getUserProfile);
router.patch('/', auth, profileController.updateProfile);

module.exports = router;
