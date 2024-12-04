import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

// Middleware para manejar errores de validación en las solicitudes
export const handleInputErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  // Si existen errores de validación, devolver un error 400 con los detalles
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  // Si no hay errores, continuar con la siguiente función
  next();
};

// Middleware para validar la entrada de datos para el pago
export const validatePayment = (req: Request, res: Response, next: NextFunction) => {
  const { product_id, quantity, payment_method } = req.body;
  
  // Validación de campos obligatorios
  if (!product_id || !quantity || !payment_method) {
    return res.status(400).json({ message: 'El ID del producto, la cantidad y el método de pago son obligatorios.' });
  }

  // Validación de que product_id sea un número entero válido
  if (isNaN(Number(product_id)) || Number(product_id) <= 0) {
    return res.status(400).json({ message: 'El ID del producto debe ser un número válido y mayor que 0.' });
  }

  // Validación adicional para cantidad (debe ser mayor a 0)
  if (quantity <= 0) {
    return res.status(400).json({ message: 'La cantidad debe ser un número mayor a 0.' });
  }

  // Validación opcional para el método de pago (puedes ampliarlo según tus necesidades)
  const validPaymentMethods = ['tarjeta de credito', 'paypal', 'transferencia bancaria']; // Ejemplo de métodos válidos
  if (!validPaymentMethods.includes(payment_method)) {
    return res.status(400).json({ message: 'El método de pago no es válido.' });
  }

  // Si todo está bien, continuar con la siguiente función
  next();
};
