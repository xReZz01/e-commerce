import { Router } from 'express';
import { validateInputOutput, validateQuantity } from './middleware/handleInputErrors';
import InventoryController from './controllers/inventoryController';

const router = Router();

// Obtener todos los registros de inventario
router.get('/', InventoryController.getAllStocks);

// Obtener stock por ID de producto
router.get('/:product_id', InventoryController.getStockByProductId);

// Agregar nuevo registro de inventario con validación
router.post('/', validateInputOutput, validateQuantity, InventoryController.addStock);

// Modificar la cantidad en el inventario con validación
router.put('/update', validateInputOutput, validateQuantity, InventoryController.updateStock);

// Revertir la compra y actualizar el stock
router.put('/revert/:product_id', validateInputOutput, validateQuantity, InventoryController.revertPurchase);

export default router;
