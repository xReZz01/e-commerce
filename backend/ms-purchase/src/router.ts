import { Router } from 'express';
import { handleInputErrors } from './middleware/handleInputErrors';
import PurchaseController from './controllers/purchasesController';

const router = Router();

// Ruta para obtener todas las compras
router.get('/', handleInputErrors, PurchaseController.getPurchases);

// Ruta para crear una nueva compra
router.post('/', handleInputErrors, PurchaseController.createPurchase);

// Ruta para revertir una compra
router.delete('/:purchase_id', handleInputErrors, PurchaseController.rollbackPurchase);

export default router;