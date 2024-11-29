import { Router } from 'express';
import PaymentController from './controllers/paymentController';
import { handleInputErrors } from './middleware/handleInputErros';

const router = Router();

router.get('/', handleInputErrors, PaymentController.getPayments)
router.get('/:id', handleInputErrors, PaymentController.getPaymentById)
router.post('/',handleInputErrors, PaymentController.processPayment)

export default router;
