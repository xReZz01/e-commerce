import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";

export const handleInputErrors = (req: Request, res: Response, next: NextFunction) => {
    let errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    next();
};

export const validatePayment = (req: Request, res: Response, next: NextFunction) => {
    const { product_id, quantity, payment_method } = req.body;
    if (!product_id || !quantity || !payment_method) {
        return res.status(400).json({ message: 'Todos los campos son obligatorios' });
    }
    next();
};