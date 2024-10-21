import { Router } from 'express'
import PurchaseController from './controllers/purchasesController'
import { handleInputErrors } from './middleware/handleInputErros'

const router = Router()


router.get('/', handleInputErrors, PurchaseController.getPurchases)
router.post('/', handleInputErrors, PurchaseController.createPurchase)


export default router