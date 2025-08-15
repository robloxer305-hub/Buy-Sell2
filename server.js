import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

// DB setup
const dbFile = path.join(__dirname, '..', 'data', 'db.json');
const adapter = new JSONFile(dbFile);
const db = new Low(adapter, { products: [] });
await db.read();
if (!db.data) db.data = { products: [] };

// seed a couple of products if empty
if (!Array.isArray(db.data.products) || db.data.products.length === 0) {
  db.data.products = [
    {
      id: 1,
      title: 'iPhone 13 Pro',
      description: 'Excellent condition, 256GB, Graphite.',
      price: 799.0,
      category: 'Electronics',
      subcategory: 'Smartphones & Tablets',
      images: ['https://images.unsplash.com/photo-1603899124210-36e0f7a5a8f0?w=1200'],
      likes: 12,
      dislikes: 1,
      createdAt: Date.now()
    },
    {
      id: 2,
      title: 'Gaming Chair',
      description: 'Ergonomic chair, adjustable armrests.',
      price: 149.99,
      category: 'Home & Garden',
      subcategory: 'Furniture',
      images: ['https://images.unsplash.com/photo-1582582494700-1b1a3e6a96d2?w=1200'],
      likes: 3,
      dislikes: 0,
      createdAt: Date.now()
    }
  ];
  await db.write();
}

// Middleware
app.use(helmet());
app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

// Helpers
function nextId(items) {
  return (items.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) || 0) + 1;
}

// Routes
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Products
app.get('/api/products', async (req, res) => {
  await db.read();
  const { q, category, subcategory, sort = 'newest' } = req.query;
  let items = [...(db.data.products || [])];

  if (category) items = items.filter(p => p.category === category);
  if (subcategory) items = items.filter(p => p.subcategory === subcategory);
  if (q) {
    const term = String(q).toLowerCase();
    items = items.filter(p =>
      (p.title || '').toLowerCase().includes(term) ||
      (p.description || '').toLowerCase().includes(term)
    );
  }
  if (sort === 'price-asc') items.sort((a,b)=> (a.price||0)-(b.price||0));
  else if (sort === 'price-desc') items.sort((a,b)=> (b.price||0)-(a.price||0));
  else items.sort((a,b)=> (b.createdAt||0)-(a.createdAt||0));

  res.json({ items });
});

app.post('/api/products', async (req, res) => {
  const { title, description, price, category, subcategory, images = [] } = req.body || {};
  if (!title || !category) return res.status(400).json({ error: 'title and category are required' });
  await db.read();
  const prod = {
    id: nextId(db.data.products || []),
    title, description: description || '',
    price: Number(price) || 0,
    category,
    subcategory: subcategory || '',
    images: Array.isArray(images) ? images : [],
    likes: 0, dislikes: 0,
    createdAt: Date.now()
  };
  db.data.products.push(prod);
  await db.write();
  res.status(201).json(prod);
});

app.put('/api/products/:id', async (req, res) => {
  await db.read();
  const id = Number(req.params.id);
  const idx = (db.data.products || []).findIndex(p => Number(p.id) === id);
  if (idx < 0) return res.status(404).json({ error: 'Not found' });
  const prev = db.data.products[idx];
  const next = { ...prev, ...req.body, id: prev.id };
  db.data.products[idx] = next;
  await db.write();
  res.json(next);
});

app.delete('/api/products/:id', async (req, res) => {
  await db.read();
  const id = Number(req.params.id);
  const before = db.data.products.length;
  db.data.products = db.data.products.filter(p => Number(p.id) !== id);
  if (db.data.products.length === before) return res.status(404).json({ error: 'Not found' });
  await db.write();
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
});
