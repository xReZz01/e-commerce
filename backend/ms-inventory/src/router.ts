import { Router } from 'express';
import InventoryController from './controllers/inventoryController';
import { validateInputOutput, validateQuantity } from './middleware/handleInputErrors';

const router = Router();

// Obtener todos los registros de inventario
router.get('/', InventoryController.getAllStocks);
router.get('/:product_id', InventoryController.getStockByProductId);

// Agregar nuevo registro de inventario con validación
router.post('/', 
    validateInputOutput, 
    validateQuantity, 
    InventoryController.addStock
);

// Modificar la cantidad en el inventario con validación
router.put('/update', 
    validateInputOutput, 
    validateQuantity, 
    InventoryController.updateStockQuantity
);

export default router;
