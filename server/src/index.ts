import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { getDb } from './db.js';
import { soniaHandler } from './sonia.js';

const app = express();
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  let database: 'connectée' | 'non configurée' | 'erreur' = 'non configurée';
  if (config.mongoUri) {
    try { await (await getDb()).command({ ping: 1 }); database = 'connectée'; } catch { database = 'erreur'; }
  }
  res.json({ ok: true, env: config.env, db: config.dbName, database });
});

app.post('/api/sonia', soniaHandler);

app.listen(config.port, () => console.log(`API [${config.env}] sur :${config.port} (base ${config.dbName})`));
