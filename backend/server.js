const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase, db } = require('./database');

const farmersRoutes = require('./routes/farmers');
const buyersRoutes = require('./routes/buyers');
const transportersRoutes = require('./routes/transporters');
const harvestsRoutes = require('./routes/harvests');
const requirementsRoutes = require('./routes/requirements');
const matchesRoutes = require('./routes/matches');
const ordersRoutes = require('./routes/orders');
const logisticsRoutes = require('./routes/logistics');
const paymentsRoutes = require('./routes/payments');
const dashboardRoutes = require('./routes/dashboard');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/farmers', farmersRoutes);
app.use('/api/buyers', buyersRoutes);
app.use('/api/transporters', transportersRoutes);
app.use('/api/harvests', harvestsRoutes);
app.use('/api/requirements', requirementsRoutes);
app.use('/api/matches', matchesRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/logistics', logisticsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Serve frontend pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/farmer-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/farmer-dashboard.html'));
});

app.get('/buyer-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/buyer-dashboard.html'));
});

app.get('/transporter-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/transporter-dashboard.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/register.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function startServer() {
  try {
    await initDatabase();
    console.log('✅ Database initialized');
    
    app.listen(PORT, () => {
      console.log(`🚀 VVT Server running on http://localhost:${PORT}`);
      console.log('📱 Access the application at http://localhost:5000');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;