import { Router } from 'express';
import { body, param } from 'express-validator';
import { handleInputErrors } from './middleware/handleInputErrors';
import ProductController from './controllers/productController';

const router = Router(); // Instancia del enrutador


// Ruta para obtener todos los productos.
router.get('/', ProductController.getProducts);

// Ruta para obtener un producto por ID con validación.
router.get('/:id', 
    param('id').isInt().withMessage("ID no válido"),
    handleInputErrors,
    ProductController.getProductById
);

// Ruta para crear un producto con validación de datos.
router.post('/', 
    body('name').notEmpty().withMessage('El nombre del producto no puede ir vacío'),
    body('price')
        .isNumeric().withMessage('Precio no válido')
        .notEmpty().withMessage('El precio no puede ir vacío')
        .custom(value => value > 0).withMessage('Precio no válido'),
    handleInputErrors,
    ProductController.createProduct
);

// Ruta para actualizar un producto por ID con validación.
router.put('/:id', 
    body('name').notEmpty().withMessage('El nombre no puede ir vacío'),
    body('price')
        .isNumeric().withMessage('Valor no válido')
        .notEmpty().withMessage('El precio no puede ir vacío')
        .custom(value => value > 0).withMessage('Precio no válido'),
    body('availability').isBoolean().withMessage('Valor de disponibilidad no válido'),
    handleInputErrors,
    ProductController.updateProduct
);

// Ruta para alternar el estado de activación de un producto.
router.patch('/:id',    
    param('id').isInt().withMessage("ID no válido"),
    handleInputErrors,
    ProductController.updateActivate
);

export default router;