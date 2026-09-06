const express = require('express');
const router = express.Router();
const { query, run } = require('../database');
const logisticsEngine = require('../logistics-engine');
const gpsSimulator = require('../gps-simulator');

// GET logistics by ID
router.get('/:id', async (req, res) => {
  try {
    const logistics = await query(`
      SELECT l.*, ao.total_quantity, ao.aggregation_location,
             br.crop, br.required_quantity, br.delivery_location,
             t.company_name as transporter_name, t.vehicle_type
      FROM logistics l
      JOIN aggregated_orders ao ON l.aggregated_order_id = ao.id
      JOIN buyer_requirements br ON ao.requirement_id = br.id
      LEFT JOIN transporters t ON l.transporter_id = t.id
      WHERE l.id = ?
    `, [req.params.id]);
    
    if (!logistics || logistics.length === 0) {
      return res.status(404).json({ error: 'Logistics record not found' });
    }
    
    // Get GPS status if simulation is running
    const gpsStatus = gpsSimulator.getStatus(req.params.id);
    
    const response = logistics[0];
    if (gpsStatus) {
      response.gps = gpsStatus;
    }
    
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST start logistics
router.post('/:id/start', async (req, res) => {
  try {
    await logisticsEngine.startLogistics(req.params.id);
    
    // Get route for GPS simulation
    const logistics = await query('SELECT * FROM logistics WHERE id = ?', [req.params.id]);
    if (!logistics || logistics.length === 0) {
      return res.status(404).json({ error: 'Logistics not found' });
    }
    
    // Get order
    const order = await query('SELECT * FROM aggregated_orders WHERE id = ?', [logistics[0].aggregated_order_id]);
    
    // Get contributions with locations
    const contributions = await query(`
      SELECT oc.*, f.latitude, f.longitude, f.location_name
      FROM order_contributions oc
      JOIN farmers f ON oc.farmer_id = f.id
      WHERE oc.aggregated_order_id = ?
    `, [logistics[0].aggregated_order_id]);
    
    // Build route
    const route = {
      waypoints: []
    };
    
    for (const c of contributions) {
      if (c.latitude && c.longitude) {
        route.waypoints.push({
          name: c.location_name || 'Farm',
          latitude: c.latitude,
          longitude: c.longitude
        });
      }
    }
    
    if (order && order.length > 0) {
      route.waypoints.push({
        name: order[0].aggregation_location || 'Hub',
        latitude: order[0].aggregation_latitude || 10.9625,
        longitude: order[0].aggregation_longitude || 79.3823
      });
    }
    
    // Get buyer location
    const reqData = await query(`
      SELECT br.delivery_latitude, br.delivery_longitude, br.delivery_location
      FROM buyer_requirements br
      JOIN aggregated_orders ao ON br.id = ao.requirement_id
      WHERE ao.id = ?
    `, [logistics[0].aggregated_order_id]);
    
    if (reqData && reqData.length > 0) {
      route.waypoints.push({
        name: reqData[0].delivery_location || 'Destination',
        latitude: reqData[0].delivery_latitude || 13.0827,
        longitude: reqData[0].delivery_longitude || 80.2707
      });
    }
    
    // Initialize GPS simulation
    gpsSimulator.createSimulation(req.params.id, route);
    gpsSimulator.start(req.params.id, async (data) => {
      // Update database with current position
      if (data.position) {
        await run(
          `UPDATE logistics SET current_latitude = ?, current_longitude = ? WHERE id = ?`,
          [data.position.lat, data.position.lng, req.params.id]
        );
      }
      
      // If completed, update status
      if (data.status === 'completed') {
        await run(
          `UPDATE logistics SET status = 'delivered' WHERE id = ?`,
          [req.params.id]
        );
        await run(
          `UPDATE aggregated_orders SET status = 'delivered' WHERE id = ?`,
          [logistics[0].aggregated_order_id]
        );
      }
    });
    
    res.json({ 
      logistics_id: req.params.id, 
      status: 'started',
      message: 'GPS simulation started'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST update location (manual or GPS)
router.post('/:id/location', async (req, res) => {
  try {
    const { latitude, longitude, status } = req.body;
    
    await run(
      `UPDATE logistics SET current_latitude = ?, current_longitude = ?, status = ? WHERE id = ?`,
      [latitude, longitude, status || 'in_transit', req.params.id]
    );
    
    res.json({ 
      logistics_id: req.params.id, 
      latitude, 
      longitude, 
      status: status || 'in_transit' 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST complete delivery
router.post('/:id/complete', async (req, res) => {
  try {
    gpsSimulator.stop(req.params.id);
    
    await run(
      `UPDATE logistics SET status = 'delivered' WHERE id = ?`,
      [req.params.id]
    );
    
    // Update order status
    const logistics = await query('SELECT * FROM logistics WHERE id = ?', [req.params.id]);
    if (logistics && logistics.length > 0) {
      await run(
        `UPDATE aggregated_orders SET status = 'delivered' WHERE id = ?`,
        [logistics[0].aggregated_order_id]
      );
    }
    
    res.json({ 
      logistics_id: req.params.id, 
      status: 'delivered',
      message: '✓ Delivery completed successfully!'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GPS simulation controls
router.post('/:id/gps/pause', async (req, res) => {
  try {
    const result = gpsSimulator.pause(req.params.id);
    res.json({ paused: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/gps/resume', async (req, res) => {
  try {
    const result = gpsSimulator.resume(req.params.id);
    res.json({ resumed: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/gps/reset', async (req, res) => {
  try {
    const result = gpsSimulator.reset(req.params.id);
    res.json({ reset: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;