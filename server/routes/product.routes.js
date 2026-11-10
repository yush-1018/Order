const express = require('express');
const router = express.Router();
const productController = require('../controllers/product.controller');
const authMiddleware = require('../middleware/auth');

// All product routes require valid JWT auth and are scoped to req.businessId
router.use(authMiddleware);

router.get('/', productController.getProducts);
router.post('/', productController.createProduct);
router.get('/:id', productController.getProductById);
router.put('/:id', productController.updateProduct);
router.delete('/:id', productController.deleteProduct);
router.post('/:id/learn-alias', productController.learnAlias);

module.exports = router;
