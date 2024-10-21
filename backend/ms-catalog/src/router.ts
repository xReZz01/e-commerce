import { Router } from 'express';
import { body, param } from 'express-validator';
import { handleInputErrors } from './middleware/handleInputErrors';
import ProductController from './controllers/productController';

const router = Router();

// Obtener todos los productos
router.get('/', ProductController.getProducts);

// Obtener un producto por ID
router.get('/:id', 
    param('id').isInt().withMessage("ID no válido"),
    handleInputErrors,
    ProductController.getProductById
);

// Crear un nuevo producto
router.post('/', 
    body('name')
        .notEmpty().withMessage('El nombre del producto no puede ir vacío'),
    body('price')
        .isNumeric().withMessage('Precio no válido')
        .notEmpty().withMessage('El precio del producto no puede ir vacío')
        .custom(value => value > 0).withMessage('Precio no válido'),
    handleInputErrors,
    ProductController.createProduct
);

// Actualizar un producto existente
router.put('/:id', 
    body('name')
        .notEmpty().withMessage('El nombre del producto no puede ir vacío'),
    body('price')
        .isNumeric().withMessage('Valor no válido')
        .notEmpty().withMessage('El precio del producto no puede ir vacío')
        .custom(value => value > 0).withMessage('Precio no válido'),
    body('availability')
        .isBoolean().withMessage('Valor para disponibilidad no válido'),
    handleInputErrors,
    ProductController.updateProduct
);

// Activar/desactivar un producto
router.patch('/:id',    
    param('id').isInt().withMessage("ID no válido"),
    handleInputErrors,
    ProductController.updateActivate
);

// Eliminar un producto
router.delete('/:id', 
    param('id').isInt().withMessage("ID no válido"),
    handleInputErrors,
    ProductController.deleteProduct
);

export default router;
