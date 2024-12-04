import http from 'k6/http';
import { check, sleep } from 'k6';

// Para correr test pararse en la carpeta tests/k6 y poner en terminal: k6 run .\load-test.js

export let options = {
  stages: [
    { duration: '1s', target: 60 }, 
    { duration: '1s', target: 60 }, 
    { duration: '1s', target: 0 },  
  ],
};

export default function () {
  const url = 'http://localhost:4000/api/order';
  
  // Datos para la compra
  const payload = JSON.stringify({
    product_id: 1, 
    quantity: 1,  // Cantidad solicitada por cada usuario
    payment_method: 'paypal',
    mailing_address: 'mi casa',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  // Enviar la solicitud POST para procesar la orden
  const response = http.post(url, payload, params);

  // Verificar los estados esperados
  check(response, {
    'is status 200 (success)': (r) => r.status === 200, // Éxito
    'is status 400 (insufficient stock)': (r) => r.status === 400,  // Falta de stock
    'is status 500 (server error)': (r) => r.status === 500, // Problema interno del server
  });

  // Mostrar detalles de errores específicos según el estado HTTP
  if (response.status === 500) {
    console.error(`Server error: ${response.body}`); // Error interno del servidor
  } else if (response.status === 400) {
    console.log(`Insufficient stock or bad request: ${response.body}`); // Stock insuficiente o solicitud inválida
  }

  sleep(0.02); // Pausa breve entre iteraciones
}
