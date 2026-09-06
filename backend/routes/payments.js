const express = require('express');
const router = express.Router();
const { query, run } = require('../database');

// GET payment by ID
router.get('/:id', async (req, res) => {
  try {
    const payment = await query(`
      SELECT p.*, o.total_quantity, o.total_amount,
             b.company_name as buyer_name
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      JOIN buyers b ON o.buyer_id = b.id
      WHERE p.id = ?
    `, [req.params.id]);
    
    if (!payment || payment.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    res.json(payment[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST release payment (simulation)
router.post('/:id/release', async (req, res) => {
  try {
    const payment = await query('SELECT * FROM payments WHERE id = ?', [req.params.id]);
    if (!payment || payment.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    await run(
      `UPDATE payments SET status = 'released', released_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.params.id]
    );
    
    res.json({ 
      payment_id: req.params.id, 
      status: 'released',
      message: 'Payment released to farmer'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;