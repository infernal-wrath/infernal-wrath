const express = require('express');
const cors    = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');

const app = express();

app.use(cors());
app.use(express.json());

// Health-check — visit /health in a browser to confirm the server is up
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'Jubilee Hills Connect', time: new Date() });
});

app.use('/api/auth', authRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅  Server running on port ${PORT}`);
  console.log(`   Open http://localhost:${PORT}/health to confirm\n`);
});
