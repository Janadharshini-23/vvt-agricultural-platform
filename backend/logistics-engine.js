const { query, run } = require('./database');

class LogisticsEngine {
  /**
   * Plan logistics for an aggregated order
   */
  async planLogistics(orderId) {
    // Get order
    const order = await query('SELECT * FROM aggregated_orders WHERE id = ?', [orderId]);
    if (!order || order.length === 0) {
      throw new Error('Order not found');
    }
    const orderData = order[0];

    // Get confirmed contributions
    const contributions = await query(
      `SELECT oc.*, f.farm_name, f.location_name, f.latitude, f.longitude,
              u.name as farmer_name
       FROM order_contributions oc
       JOIN farmers f ON oc.farmer_id = f.id
       JOIN users u ON f.user_id = u.id
       WHERE oc.aggregated_order_id = ? AND oc.confirmation_status = 'confirmed'
       ORDER BY oc.quantity DESC`,
      [orderId]
    );

    if (contributions.length === 0) {
      throw new Error('No confirmed contributions for this order');
    }

    // Get available transporter
    const transporters = await query(
      `SELECT * FROM transporters WHERE availability_status = 'available' AND capacity >= ?
       ORDER BY capacity ASC`,
      [orderData.total_quantity]
    );

    let transporter = null;
    if (transporters.length > 0) {
      transporter = transporters[0];
    } else {
      // Get any transporter
      const allTransporters = await query('SELECT * FROM transporters LIMIT 1');
      if (allTransporters.length > 0) {
        transporter = allTransporters[0];
      } else {
        throw new Error('No transporter available');
      }
    }

    // Create logistics record
    const logisticsResult = await run(
      `INSERT INTO logistics 
       (aggregated_order_id, transporter_id, vehicle_number, status, current_latitude, current_longitude)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        transporter.id,
        transporter.vehicle_number,
        'scheduled',
        orderData.aggregation_latitude,
        orderData.aggregation_longitude
      ]
    );

    const logisticsId = logisticsResult.id;

    // Update transporter availability
    await run(
      `UPDATE transporters SET availability_status = 'assigned' WHERE id = ?`,
      [transporter.id]
    );

    // Calculate route
    const route = this.calculateRoute(contributions, orderData);

    return {
      logistics_id: logisticsId,
      transporter: {
        id: transporter.id,
        company_name: transporter.company_name,
        vehicle_number: transporter.vehicle_number,
        vehicle_type: transporter.vehicle_type,
        capacity: transporter.capacity
      },
      farms: contributions.map(c => ({
        id: c.farmer_id,
        name: c.farmer_name,
        farm_name: c.farm_name,
        location: c.location_name,
        latitude: c.latitude,
        longitude: c.longitude,
        quantity: c.quantity
      })),
      aggregation_hub: {
        location: orderData.aggregation_location,
        latitude: orderData.aggregation_latitude,
        longitude: orderData.aggregation_longitude
      },
      route: route,
      total_distance: route.total_distance,
      estimated_time: route.estimated_time,
      pickup_order: route.pickup_order
    };
  }

  /**
   * Calculate route between farms, hub, and destination
   */
  calculateRoute(contributions, orderData) {
    // Get requirement for destination
    const requirement = query('SELECT * FROM buyer_requirements WHERE id = ?', [orderData.requirement_id]);
    
    // Sort farms by location proximity (simple clustering)
    const sortedFarms = this.clusterFarms(contributions);

    // Build waypoints
    const waypoints = [];
    
    // Add farms in order
    for (const farm of sortedFarms) {
      waypoints.push({
        type: 'farm',
        name: farm.farmer_name,
        location: farm.location_name,
        latitude: farm.latitude,
        longitude: farm.longitude,
        quantity: farm.quantity
      });
    }

    // Add aggregation hub
    waypoints.push({
      type: 'hub',
      name: 'Aggregation Hub',
      location: orderData.aggregation_location,
      latitude: orderData.aggregation_latitude,
      longitude: orderData.aggregation_longitude
    });

    // Add destination (buyer)
    if (requirement && requirement.length > 0) {
      const req = requirement[0];
      waypoints.push({
        type: 'destination',
        name: req.delivery_location || 'Chennai',
        location: req.delivery_location || 'Chennai',
        latitude: req.delivery_latitude || 13.0827,
        longitude: req.delivery_longitude || 80.2707
      });
    }

    // Calculate distances between waypoints
    const segments = [];
    let totalDistance = 0;
    let totalTime = 0;

    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i];
      const to = waypoints[i + 1];
      const dist = this.calculateDistance(
        from.latitude, from.longitude,
        to.latitude, to.longitude
      );
      const time = dist / 40; // Average 40 km/h
      segments.push({
        from: from.location || from.name,
        to: to.location || to.name,
        distance: Math.round(dist * 10) / 10,
        time: Math.round(time * 10) / 10
      });
      totalDistance += dist;
      totalTime += time;
    }

    return {
      waypoints: waypoints,
      segments: segments,
      total_distance: Math.round(totalDistance * 10) / 10,
      total_time: Math.round(totalTime * 10) / 10,
      pickup_order: waypoints.filter(w => w.type === 'farm').map(w => w.name)
    };
  }

  /**
   * Cluster farms by proximity
   */
  clusterFarms(farms) {
    if (farms.length <= 1) return farms;

    // Simple clustering - sort by latitude then longitude
    return farms.sort((a, b) => {
      if (a.latitude === b.latitude) {
        return a.longitude - b.longitude;
      }
      return a.latitude - b.latitude;
    });
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Start logistics (dispatch)
   */
  async startLogistics(logisticsId) {
    const logistics = await query('SELECT * FROM logistics WHERE id = ?', [logisticsId]);
    if (!logistics || logistics.length === 0) {
      throw new Error('Logistics record not found');
    }

    await run(
      `UPDATE logistics SET 
       pickup_time = CURRENT_TIMESTAMP,
       status = 'pickup'
       WHERE id = ?`,
      [logisticsId]
    );

    return { logistics_id: logisticsId, status: 'pickup' };
  }

  /**
   * Update logistics status
   */
  async updateStatus(logisticsId, status, location) {
    await run(
      `UPDATE logistics SET 
       status = ?,
       current_latitude = ?,
       current_longitude = ?
       WHERE id = ?`,
      [status, location?.lat || 0, location?.lng || 0, logisticsId]
    );

    return { logistics_id: logisticsId, status };
  }
}

module.exports = new LogisticsEngine();