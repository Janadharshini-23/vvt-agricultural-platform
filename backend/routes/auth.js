const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { query, run } = require('../database');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await query('SELECT * FROM users WHERE email = ?', [email]);
    
    if (!user || user.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const userData = user[0];
    const isValidPassword = await bcrypt.compare(password, userData.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Get role-specific data
    let roleData = null;
    if (userData.role === 'farmer') {
      const farmer = await query('SELECT * FROM farmers WHERE user_id = ?', [userData.id]);
      roleData = farmer[0] || null;
    } else if (userData.role === 'buyer') {
      const buyer = await query('SELECT * FROM buyers WHERE user_id = ?', [userData.id]);
      roleData = buyer[0] || null;
    } else if (userData.role === 'transporter') {
      const transporter = await query('SELECT * FROM transporters WHERE user_id = ?', [userData.id]);
      roleData = transporter[0] || null;
    }

    res.json({
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        role: userData.role,
        verified: userData.verified
      },
      roleData: roleData,
      message: 'Login successful'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, phone, email, password, role, farm_name, location, company_name } = req.body;
    
    // Check if user exists
    const existing = await query('SELECT * FROM users WHERE email = ? OR phone = ?', [email, phone]);
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'User with this email or phone already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const userResult = await run(
      'INSERT INTO users (name, phone, email, password, role, verified) VALUES (?, ?, ?, ?, ?, ?)',
      [name, phone, email, hashedPassword, role, 0]
    );
    
    const userId = userResult.id;

    // Create role-specific record
    if (role === 'farmer') {
      const loc = { lat: 10.9625, lng: 79.3823 };
      await run(
        `INSERT INTO farmers (user_id, farm_name, location_name, latitude, longitude, verification_status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, farm_name || name + "'s Farm", location || 'Kumbakonam', loc.lat, loc.lng, 'pending']
      );
    } else if (role === 'buyer') {
      const loc = { lat: 13.0827, lng: 80.2707 };
      await run(
        `INSERT INTO buyers (user_id, company_name, buyer_type, delivery_location, latitude, longitude, verification_status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, company_name || name + "'s Company", 'bulk', 'Chennai', loc.lat, loc.lng, 'pending']
      );
    } else if (role === 'transporter') {
      const loc = { lat: 10.9625, lng: 79.3823 };
      await run(
        `INSERT INTO transporters (user_id, company_name, vehicle_number, vehicle_type, capacity, current_latitude, current_longitude, availability_status, verification_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, company_name || name + "'s Logistics", 'TN 00 AA 0000', 'Truck', 5000, loc.lat, loc.lng, 'available', 'pending']
      );
    }

    res.status(201).json({ 
      message: 'Registration successful! Please login.',
      userId: userId 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;