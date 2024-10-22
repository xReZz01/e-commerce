import express from 'express';
import { orchestrateTransaction } from './orchestrator';

const app = express();
app.use(express.json());

app.post('/purchase', async (req, res) => {
    try {
        const result = await orchestrateTransaction(req.body);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Orchestrator service running on port ${PORT}`);
});