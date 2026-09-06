const express = require('express');
const router = express.Router();
const { query, run } = require('../database');

// GET all farmers
router.get('/', async (req, res) => {
  try {
    const farmers = await query(`
      SELECT f.*, u.name, u.phone, u.email, u.verified
      FROM farmers f
      JOIN users u ON f.user_id = u.id
      ORDER BY f.created_at DESC
    `);
    res.json(farmers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET farmer by ID
router.get('/:id', async (req, res) => {
  try {
    const farmer = await query(`
      SELECT f.*, u.name, u.phone, u.email, u.verified
      FROM farmers f
      JOIN users u ON f.user_id = u.id
      WHERE f.id = ?
    `, [req.params.id]);
    
    if (!farmer || farmer.length === 0) {
      return res.status(404).json({ error: 'Farmer not found' });
    }
    res.json(farmer[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create farmer
router.post('/', async (req, res) => {
  try {
    const { user_id, farm_name, location_name, latitude, longitude, land_area, primary_crops } = req.body;
    
    const result = await run(
      `INSERT INTO farmers (user_id, farm_name, location_name, latitude, longitude, land_area, primary_crops, verification_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id, farm_name, location_name, latitude, longitude, land_area, primary_crops, 'pending']
    );
    
    res.status(201).json({ id: result.id, message: 'Farmer created successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET farmer harvests
router.get('/:id/harvests', async (req, res) => {
  try {
    const harvests = await query(`
      SELECT h.*, f.farm_name, f.location_name
      FROM harvests h
      JOIN farmers f ON h.farmer_id = f.id
      WHERE h.farmer_id = ?
      ORDER BY h.created_at DESC
    `, [req.params.id]);
    res.json(harvests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET farmer matches
router.get('/:id/matches', async (req, res) => {
  try {
    const matches = await query(`
      SELECT m.*, br.crop, br.required_quantity, br.delivery_location,
             b.company_name as buyer_name
      FROM matches m
      JOIN buyer_requirements br ON m.requirement_id = br.id
      JOIN buyers b ON br.buyer_id = b.id
      WHERE m.farmer_id = ? AND m.status IN ('pending', 'confirmed')
      ORDER BY m.match_score DESC
    `, [req.params.id]);
    res.json(matches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;