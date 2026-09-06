const express = require('express');
const router = express.Router();
const { query } = require('../database');

// Farmer dashboard
router.get('/farmer/:id', async (req, res) => {
  try {
    const farmerId = req.params.id;
    
    // Get farmer info
    const farmer = await query(`
      SELECT f.*, u.name, u.verified
      FROM farmers f
      JOIN users u ON f.user_id = u.id
      WHERE f.id = ?
    `, [farmerId]);
    
    if (!farmer || farmer.length === 0) {
      return res.status(404).json({ error: 'Farmer not found' });
    }
    
    // Get active harvest
    const harvests = await query(`
      SELECT * FROM harvests WHERE farmer_id = ? AND status = 'available'
      ORDER BY created_at DESC LIMIT 1
    `, [farmerId]);
    
    // Get active orders
    const orders = await query(`
      SELECT oc.*, ao.total_quantity, ao.status as order_status,
             br.crop, br.delivery_location, b.company_name
      FROM order_contributions oc
      JOIN aggregated_orders ao ON oc.aggregated_order_id = ao.id
      JOIN buyer_requirements br ON ao.requirement_id = br.id
      JOIN buyers b ON br.buyer_id = b.id
      WHERE oc.farmer_id = ? AND oc.confirmation_status = 'confirmed'
      ORDER BY oc.created_at DESC
    `, [farmerId]);
    
    // Get matches
    const matches = await query(`
      SELECT m.*, br.crop, br.required_quantity, br.delivery_location,
             b.company_name
      FROM matches m
      JOIN buyer_requirements br ON m.requirement_id = br.id
      JOIN buyers b ON br.buyer_id = b.id
      WHERE m.farmer_id = ? AND m.status IN ('pending', 'confirmed')
      ORDER BY m.match_score DESC
    `, [farmerId]);
    
    // Get price info
    const priceInfo = await query(`
      SELECT AVG(expected_price) as avg_price, MAX(expected_price) as max_price,
             COUNT(*) as total_listings
      FROM harvests
      WHERE crop IN (SELECT crop FROM harvests WHERE farmer_id = ?)
      AND status = 'available'
    `, [farmerId]);
    
    res.json({
      farmer: farmer[0],
      active_harvest: harvests.length > 0 ? harvests[0] : null,
      active_orders: orders,
      pending_matches: matches.filter(m => m.status === 'pending'),
      confirmed_matches: matches.filter(m => m.status === 'confirmed'),
      price_info: priceInfo[0] || { avg_price: 0, max_price: 0, total_listings: 0 }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Buyer dashboard
router.get('/buyer/:id', async (req, res) => {
  try {
    const buyerId = req.params.id;
    
    // Get buyer info
    const buyer = await query(`
      SELECT b.*, u.name, u.verified
      FROM buyers b
      JOIN users u ON b.user_id = u.id
      WHERE b.id = ?
    `, [buyerId]);
    
    if (!buyer || buyer.length === 0) {
      return res.status(404).json({ error: 'Buyer not found' });
    }
    
    // Get requirements
    const requirements = await query(`
      SELECT br.*, 
             (SELECT COUNT(*) FROM matches WHERE requirement_id = br.id) as match_count
      FROM buyer_requirements br
      WHERE br.buyer_id = ?
      ORDER BY br.created_at DESC
    `, [buyerId]);
    
    // Get orders
    const orders = await query(`
      SELECT o.*, ao.total_quantity, ao.status as order_status,
             br.crop, br.delivery_location,
             (SELECT COUNT(*) FROM order_contributions WHERE aggregated_order_id = ao.id) as farm_count
      FROM orders o
      JOIN aggregated_orders ao ON o.aggregated_order_id = ao.id
      JOIN buyer_requirements br ON ao.requirement_id = br.id
      WHERE o.buyer_id = ?
      ORDER BY o.created_at DESC
    `, [buyerId]);
    
    res.json({
      buyer: buyer[0],
      requirements: requirements,
      orders: orders
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Transporter dashboard
router.get('/transporter/:id', async (req, res) => {
  try {
    const transporterId = req.params.id;
    
    // Get transporter info
    const transporter = await query(`
      SELECT t.*, u.name, u.verified
      FROM transporters t
      JOIN users u ON t.user_id = u.id
      WHERE t.id = ?
    `, [transporterId]);
    
    if (!transporter || transporter.length === 0) {
      return res.status(404).json({ error: 'Transporter not found' });
    }
    
    // Get assigned deliveries
    const deliveries = await query(`
      SELECT l.*, ao.total_quantity, ao.aggregation_location,
             br.crop, br.required_quantity, br.delivery_location,
             (SELECT COUNT(*) FROM order_contributions WHERE aggregated_order_id = ao.id) as farm_count
      FROM logistics l
      JOIN aggregated_orders ao ON l.aggregated_order_id = ao.id
      JOIN buyer_requirements br ON ao.requirement_id = br.id
      WHERE l.transporter_id = ?
      ORDER BY l.created_at DESC
    `, [transporterId]);
    
    res.json({
      transporter: transporter[0],
      deliveries: deliveries
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;