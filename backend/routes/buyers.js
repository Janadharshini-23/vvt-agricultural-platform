const express = require('express');
const router = express.Router();
const { query, run } = require('../database');

// GET all buyers
router.get('/', async (req, res) => {
  try {
    const buyers = await query(`
      SELECT b.*, u.name, u.phone, u.email, u.verified
      FROM buyers b
      JOIN users u ON b.user_id = u.id
      ORDER BY b.created_at DESC
    `);
    res.json(buyers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET buyer by ID
router.get('/:id', async (req, res) => {
  try {
    const buyer = await query(`
      SELECT b.*, u.name, u.phone, u.email, u.verified
      FROM buyers b
      JOIN users u ON b.user_id = u.id
      WHERE b.id = ?
    `, [req.params.id]);
    
    if (!buyer || buyer.length === 0) {
      return res.status(404).json({ error: 'Buyer not found' });
    }
    res.json(buyer[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create buyer
router.post('/', async (req, res) => {
  try {
    const { user_id, company_name, buyer_type, delivery_location, latitude, longitude } = req.body;
    
    const result = await run(
      `INSERT INTO buyers (user_id, company_name, buyer_type, delivery_location, latitude, longitude, verification_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user_id, company_name, buyer_type, delivery_location, latitude, longitude, 'pending']
    );
    
    res.status(201).json({ id: result.id, message: 'Buyer created successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET buyer requirements
router.get('/:id/requirements', async (req, res) => {
  try {
    const requirements = await query(`
      SELECT br.*, b.company_name
      FROM buyer_requirements br
      JOIN buyers b ON br.buyer_id = b.id
      WHERE br.buyer_id = ?
      ORDER BY br.created_at DESC
    `, [req.params.id]);
    res.json(requirements);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;