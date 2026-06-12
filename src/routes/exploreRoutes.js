const express = require('express');
const router = express.Router();
const exploreController = require('../controllers/exploreController');

router.get('/suggestions', exploreController.getExploreSuggestions);

module.exports = router;