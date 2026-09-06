const express = require('express');
const router = express.Router();
const { query, run } = require('../database');

// GET all transporters
router.get('/', async (req, res) => {
  try {
    const transporters = await query(`
      SELECT t.*, u.name, u.phone, u.email, u.verified
      FROM transporters t
      JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC
    `);
    res.json(transporters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET transporter by ID
router.get('/:id', async (req, res) => {
  try {
    const transporter = await query(`
      SELECT t.*, u.name, u.phone, u.email, u.verified
      FROM transporters t
      JOIN users u ON t.user_id = u.id
      WHERE t.id = ?
    `, [req.params.id]);
    
    if (!transporter || transporter.length === 0) {
      return res.status(404).json({ error: 'Transporter not found' });
    }
    res.json(transporter[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET transporter logistics
router.get('/:id/logistics', async (req, res) => {
  try {
    const logistics = await query(`
      SELECT l.*, ao.total_quantity, ao.aggregation_location,
             br.delivery_location, br.crop
      FROM logistics l
      JOIN aggregated_orders ao ON l.aggregated_order_id = ao.id
      JOIN buyer_requirements br ON ao.requirement_id = br.id
      WHERE l.transporter_id = ?
      ORDER BY l.created_at DESC
    `, [req.params.id]);
    res.json(logistics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;