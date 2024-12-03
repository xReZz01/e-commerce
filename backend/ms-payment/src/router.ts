import { Router } from 'express';
import { handleInputErrors, validatePayment } from './middleware/handleInputErros';
import PaymentController from './controllers/paymentController';

const router = Router();

// Ruta para obtener todos los pagos
router.get('/', handleInputErrors, PaymentController.getPayments);

// Ruta para obtener un pago específico por ID
router.get('/:id', handleInputErrors, PaymentController.getPaymentById);

// Ruta para procesar un nuevo pago
router.post('/', validatePayment, handleInputErrors, PaymentController.processPayment);

// Ruta para revertir un pago
router.delete('/:paymentId', handleInputErrors, PaymentController.compensatePayment);

export default router;