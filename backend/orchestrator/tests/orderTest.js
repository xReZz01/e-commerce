import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
    stages: [
        { duration: '30s', target: 20 }, // Simula 20 usuarios concurrentes durante 30 segundos
        { duration: '1m', target: 10 },  // Reduce a 10 usuarios concurrentes durante 1 minuto
        { duration: '10s', target: 0 },  // Reduce a 0 usuarios concurrentes durante 10 segundos
    ],
};

export default function () {
    let res = http.post('http://localhost:4000/api/orders', JSON.stringify({
        product_id: 2,
        quantity: 2,
        payment_method: 'credit_card',
        purchase_date: '2023-10-01',
        mailing_address: '123 Main St, Anytown, USA'
    }), {
        headers: { 'Content-Type': 'application/json' },
    });
    check(res, { 'status was 200': (r) => r.status === 200 });
    sleep(1);
}