const express = require('express');
const router = express.Router();

const homePageController = require('../app/controllers/HomePageController');

router.get('/', homePageController.index);
router.post('/', homePageController.updateHome);
router.post('/addToCart/:bookCartId', homePageController.addToCart);

module.exports = router;
