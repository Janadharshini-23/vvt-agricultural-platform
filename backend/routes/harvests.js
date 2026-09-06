const express = require('express');
const router = express.Router();
const { query, run } = require('../database');

// GET all harvests
router.get('/', async (req, res) => {
  try {
    const { crop, status } = req.query;
    let sql = `
      SELECT h.*, f.farm_name, f.location_name, u.name as farmer_name
      FROM harvests h
      JOIN farmers f ON h.farmer_id = f.id
      JOIN users u ON f.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    
    if (crop) {
      sql += ` AND h.crop = ?`;
      params.push(crop);
    }
    if (status) {
      sql += ` AND h.status = ?`;
      params.push(status);
    }
    
    sql += ` ORDER BY h.created_at DESC`;
    
    const harvests = await query(sql, params);
    res.json(harvests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET harvest by ID
router.get('/:id', async (req, res) => {
  try {
    const harvest = await query(`
      SELECT h.*, f.farm_name, f.location_name, f.latitude, f.longitude,
             u.name as farmer_name, u.verified as farmer_verified
      FROM harvests h
      JOIN farmers f ON h.farmer_id = f.id
      JOIN users u ON f.user_id = u.id
      WHERE h.id = ?
    `, [req.params.id]);
    
    if (!harvest || harvest.length === 0) {
      return res.status(404).json({ error: 'Harvest not found' });
    }
    res.json(harvest[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create harvest
router.post('/', async (req, res) => {
  try {
    const { 
      farmer_id, crop, quantity, grade, harvest_date, available_date,
      expected_price, quality_notes, image_url, latitude, longitude 
    } = req.body;
    
    const result = await run(
      `INSERT INTO harvests 
       (farmer_id, crop, quantity, remaining_quantity, grade, harvest_date, 
        available_date, expected_price, quality_notes, image_url, latitude, longitude, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [farmer_id, crop, quantity, quantity, grade, harvest_date, 
       available_date, expected_price, quality_notes, image_url, latitude, longitude, 'available']
    );
    
    res.status(201).json({ 
      id: result.id, 
      message: 'Harvest listed successfully! Your harvest is now visible to matched buyers.' 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT update harvest status
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    await run(
      `UPDATE harvests SET status = ? WHERE id = ?`,
      [status, req.params.id]
    );
    res.json({ message: 'Harvest status updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;