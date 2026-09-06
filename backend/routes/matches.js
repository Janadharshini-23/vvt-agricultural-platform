const express = require('express');
const router = express.Router();
const { query, run } = require('../database');
const aggregationEngine = require('../aggregation-engine');

// GET match by ID
router.get('/:id', async (req, res) => {
  try {
    const match = await query(`
      SELECT m.*, h.crop, h.grade, f.farm_name, f.location_name,
             u.name as farmer_name, br.crop as requirement_crop
      FROM matches m
      JOIN harvests h ON m.harvest_id = h.id
      JOIN farmers f ON m.farmer_id = f.id
      JOIN users u ON f.user_id = u.id
      JOIN buyer_requirements br ON m.requirement_id = br.id
      WHERE m.id = ?
    `, [req.params.id]);
    
    if (!match || match.length === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }
    res.json(match[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST confirm match (farmer joins order)
router.post('/:id/confirm', async (req, res) => {
  try {
    const match = await query('SELECT * FROM matches WHERE id = ?', [req.params.id]);
    if (!match || match.length === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }
    
    const matchData = match[0];
    
    // Update match status
    await run(
      `UPDATE matches SET status = 'confirmed' WHERE id = ?`,
      [req.params.id]
    );
    
    // Update harvest remaining quantity
    await run(
      `UPDATE harvests SET remaining_quantity = remaining_quantity - ? WHERE id = ?`,
      [matchData.matched_quantity, matchData.harvest_id]
    );
    
    // Check if we should create an aggregated order
    const confirmedMatches = await query(
      `SELECT * FROM matches WHERE requirement_id = ? AND status = 'confirmed'`,
      [matchData.requirement_id]
    );
    
    const requirement = await query(
      `SELECT * FROM buyer_requirements WHERE id = ?`,
      [matchData.requirement_id]
    );
    
    let aggregatedOrder = null;
    if (confirmedMatches.length >= 3 && requirement.length > 0) {
      // Try to create aggregated order
      const reqData = requirement[0];
      const totalConfirmed = confirmedMatches.reduce((sum, m) => sum + m.matched_quantity, 0);
      
      if (totalConfirmed >= reqData.required_quantity * 0.3) {
        try {
          aggregatedOrder = await aggregationEngine.createAggregatedOrder(matchData.requirement_id);
        } catch (err) {
          // Ignore aggregation errors
        }
      }
    }
    
    res.json({ 
      message: 'You have joined this order successfully!',
      match_id: req.params.id,
      aggregated_order: aggregatedOrder
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;