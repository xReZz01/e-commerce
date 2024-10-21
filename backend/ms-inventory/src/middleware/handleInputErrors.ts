import { Request, Response, NextFunction } from "express"
import { validationResult } from "express-validator"

export const handleInputErrors = (req:Request, res:Response, next:NextFunction) => {
    let errors = validationResult(req)
    if(!errors.isEmpty()){
        return res.status(400).json({ errors: errors.array() })
    }

    next()
}

export const validateInputOutput = (req:Request, res:Response, next:NextFunction) => {
    const { input_output } = req.body;
    if (input_output !== 1 && input_output !== 2) {
        return res.status(400).json({ message: 'entrada/salida debe ser 1 (entrada) o 2 (salida)' });
    }
    next();
};

export const validateQuantity = (req:Request, res:Response, next:NextFunction) => {
    const { quantity } = req.body;
    if (quantity <= 0) {
        return res.status(400).json({ message: 'La cantidad debe ser mayor que 0' });
    }
    next();
};