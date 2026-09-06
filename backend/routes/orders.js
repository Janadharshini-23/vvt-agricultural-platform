const express = require('express');
const router = express.Router();
const { query, run } = require('../database');
const aggregationEngine = require('../aggregation-engine');
const logisticsEngine = require('../logistics-engine');

// GET aggregated order by ID
router.get('/aggregated/:id', async (req, res) => {
  try {
    const order = await query(`
      SELECT ao.*, br.crop, br.required_quantity, br.delivery_location,
             b.company_name as buyer_name
      FROM aggregated_orders ao
      JOIN buyer_requirements br ON ao.requirement_id = br.id
      JOIN buyers b ON br.buyer_id = b.id
      WHERE ao.id = ?
    `, [req.params.id]);
    
    if (!order || order.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Get contributions
    const contributions = await query(`
      SELECT oc.*, f.farm_name, f.location_name, u.name as farmer_name
      FROM order_contributions oc
      JOIN farmers f ON oc.farmer_id = f.id
      JOIN users u ON f.user_id = u.id
      WHERE oc.aggregated_order_id = ?
      ORDER BY oc.quantity DESC
    `, [req.params.id]);
    
    const orderData = order[0];
    orderData.contributions = contributions;
    
    res.json(orderData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST confirm aggregated order
router.post('/aggregated/:id/confirm', async (req, res) => {
  try {
    const result = await aggregationEngine.confirmOrder(req.params.id);
    
    // If fulfilled, create logistics
    if (result.status === 'fulfilled') {
      try {
        const logistics = await logisticsEngine.planLogistics(req.params.id);
        res.json({ 
          ...result, 
          logistics: logistics,
          message: 'Order confirmed! Logistics planned.'
        });
      } catch (logError) {
        res.json({ 
          ...result, 
          message: 'Order confirmed but logistics planning encountered an issue',
          warning: logError.message
        });
      }
    } else {
      res.json({ 
        ...result,
        message: 'Order status updated'
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET order contributions
router.get('/contributions/:orderId', async (req, res) => {
  try {
    const contributions = await query(`
      SELECT oc.*, f.farm_name, f.location_name, u.name as farmer_name
      FROM order_contributions oc
      JOIN farmers f ON oc.farmer_id = f.id
      JOIN users u ON f.user_id = u.id
      WHERE oc.aggregated_order_id = ?
    `, [req.params.orderId]);
    res.json(contributions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;