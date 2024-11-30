// k6 run .\load-test.js


import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '1s', target: 50 },  // 50 usuarios concurrentes por 1 segundo
    { duration: '20s', target: 50 }, // Mantiene 50 usuarios concurrentes durante 10 minutos
    { duration: '1s', target: 0 },   // Reduce a 0 usuarios concurrentes al final
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // El 95% de las solicitudes deben completarse en menos de 500ms
  },
};

export default function () {
  const url = 'http://localhost:4000/api/order';
  const productId = 1; // Producto con id 1 (asegurarse de que este producto exista en la base de datos)
  const quantity = 2; // Cantidad de productos comprados en cada orden
  const payload = JSON.stringify({
    product_id: productId,
    quantity: quantity,
    payment_method: 'credit_card', // Método de pago
    mailing_address: '123 Main St', // Dirección de envío
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  // Enviar la solicitud POST para crear una orden
  const response = http.post(url, payload, params);

  // Verificar la respuesta
  check(response, {
    'is status 200': (r) => r.status === 200,
    'is status 400': (r) => r.status === 400,
    'is status 500': (r) => r.status === 500,
  });

  // Esperar para simular 50 compras por segundo
  sleep(0.02);  // Aproximadamente 50 compras por segundo (1 / 50 = 0.02s por compra)
}

