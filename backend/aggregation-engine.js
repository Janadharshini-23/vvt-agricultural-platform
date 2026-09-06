const { query, run } = require('./database');

class AggregationEngine {
  /**
   * Aggregate supply from multiple farms for a requirement
   */
  async aggregateSupply(requirementId) {
    // Get requirement
    const reqResult = await query('SELECT * FROM buyer_requirements WHERE id = ?', [requirementId]);
    if (!reqResult || reqResult.length === 0) {
      throw new Error('Requirement not found');
    }
    const requirement = reqResult[0];

    // Get confirmed matches
    const matches = await query(
      `SELECT m.*, h.crop, h.grade, h.harvest_date, h.available_date, 
              f.farm_name, f.location_name, f.latitude, f.longitude,
              u.name as farmer_name
       FROM matches m
       JOIN harvests h ON m.harvest_id = h.id
       JOIN farmers f ON m.farmer_id = f.id
       JOIN users u ON f.user_id = u.id
       WHERE m.requirement_id = ? AND m.status = 'confirmed'
       ORDER BY m.match_score DESC`,
      [requirementId]
    );

    if (matches.length === 0) {
      throw new Error('No confirmed matches to aggregate');
    }

    // Calculate totals
    let totalQuantity = 0;
    let totalValue = 0;
    const contributions = [];

    for (const match of matches) {
      const quantity = match.matched_quantity || 0;
      const price = match.offered_price || requirement.min_price || 0;
      
      if (quantity > 0) {
        contributions.push({
          farmer_id: match.farmer_id,
          farmer_name: match.farmer_name,
          farm_name: match.farm_name,
          location: match.location_name,
          latitude: match.latitude,
          longitude: match.longitude,
          harvest_id: match.harvest_id,
          quantity: quantity,
          price: price,
          grade: match.grade,
          crop: match.crop,
          match_score: match.match_score,
          harvest_date: match.harvest_date,
          available_date: match.available_date,
          confirmation_status: 'pending',
          pickup_status: 'pending'
        });
        totalQuantity += quantity;
        totalValue += quantity * price;
      }
    }

    // Average price
    const avgPrice = totalQuantity > 0 ? totalValue / totalQuantity : 0;

    // Create aggregation hub location (centroid of farms)
    const hub = this.calculateHubLocation(contributions);

    return {
      requirement_id: requirementId,
      crop: requirement.crop,
      required_quantity: requirement.required_quantity,
      total_matched: totalQuantity,
      fulfillment_percentage: Math.min((totalQuantity / requirement.required_quantity) * 100, 100),
      avg_price: avgPrice,
      total_value: totalValue,
      farm_count: contributions.length,
      contributions: contributions,
      aggregation_location: hub.location_name || 'Kumbakonam',
      aggregation_latitude: hub.latitude,
      aggregation_longitude: hub.longitude,
      status: totalQuantity >= requirement.required_quantity ? 'fulfilled' : 'partial'
    };
  }

  /**
   * Calculate centroid of farm locations for aggregation hub
   */
  calculateHubLocation(contributions) {
    if (contributions.length === 0) {
      return { latitude: 10.9625, longitude: 79.3823, location_name: 'Kumbakonam' };
    }

    let latSum = 0, lngSum = 0;
    let weightSum = 0;

    for (const c of contributions) {
      if (c.latitude && c.longitude) {
        const weight = c.quantity || 1;
        latSum += c.latitude * weight;
        lngSum += c.longitude * weight;
        weightSum += weight;
      }
    }

    if (weightSum === 0) {
      return { latitude: 10.9625, longitude: 79.3823, location_name: 'Kumbakonam' };
    }

    const lat = latSum / weightSum;
    const lng = lngSum / weightSum;

    // Map to nearest known location
    const locations = {
      'Kumbakonam': { lat: 10.9625, lng: 79.3823 },
      'Thanjavur': { lat: 10.7870, lng: 79.1378 },
      'Papanasam': { lat: 10.9200, lng: 79.2700 },
      'Mayiladuthurai': { lat: 11.1031, lng: 79.6552 },
      'Chennai': { lat: 13.0827, lng: 80.2707 },
      'Tiruvarur': { lat: 10.7632, lng: 79.6375 },
      'Nagapattinam': { lat: 10.7649, lng: 79.8430 },
      'Ariyalur': { lat: 11.1568, lng: 79.0354 },
      'Perambalur': { lat: 11.2332, lng: 78.8828 }
    };

    let closest = 'Kumbakonam';
    let minDist = Infinity;

    for (const [name, coords] of Object.entries(locations)) {
      const dist = this.calculateDistance(lat, lng, coords.lat, coords.lng);
      if (dist < minDist) {
        minDist = dist;
        closest = name;
      }
    }

    const loc = locations[closest] || locations.Kumbakonam;
    return {
      latitude: loc.lat,
      longitude: loc.lng,
      location_name: closest
    };
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
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
   * Create aggregated order from a requirement
   */
  async createAggregatedOrder(requirementId) {
    const aggregation = await this.aggregateSupply(requirementId);
    
    if (aggregation.total_matched < aggregation.required_quantity * 0.5) {
      throw new Error('Not enough supply to create an order (minimum 50% required)');
    }

    // Create aggregated order
    const orderResult = await run(
      `INSERT INTO aggregated_orders 
       (requirement_id, total_quantity, confirmed_quantity, price, aggregation_location, aggregation_latitude, aggregation_longitude, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        requirementId,
        aggregation.total_matched,
        0,
        aggregation.avg_price,
        aggregation.aggregation_location,
        aggregation.aggregation_latitude,
        aggregation.aggregation_longitude,
        'aggregating'
      ]
    );

    const orderId = orderResult.id;

    // Create order contributions
    for (const contrib of aggregation.contributions) {
      await run(
        `INSERT INTO order_contributions 
         (aggregated_order_id, farmer_id, harvest_id, quantity, price, confirmation_status, pickup_status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          contrib.farmer_id,
          contrib.harvest_id,
          contrib.quantity,
          contrib.price,
          'pending',
          'pending'
        ]
      );
    }

    // Update matches status
    await query(
      `UPDATE matches SET status = 'aggregated' WHERE requirement_id = ? AND status = 'confirmed'`,
      [requirementId]
    );

    // Update requirement status
    await query(
      `UPDATE buyer_requirements SET status = 'aggregating' WHERE id = ?`,
      [requirementId]
    );

    return {
      order_id: orderId,
      ...aggregation
    };
  }

  /**
   * Confirm aggregated order (farmer confirmations)
   */
  async confirmOrder(orderId) {
    // Get order and contributions
    const order = await query('SELECT * FROM aggregated_orders WHERE id = ?', [orderId]);
    if (!order || order.length === 0) {
      throw new Error('Order not found');
    }

    // Get contributions
    const contributions = await query(
      `SELECT oc.*, f.farm_name, u.name as farmer_name
       FROM order_contributions oc
       JOIN farmers f ON oc.farmer_id = f.id
       JOIN users u ON f.user_id = u.id
       WHERE oc.aggregated_order_id = ?`,
      [orderId]
    );

    // Update contribution statuses (simulate farmer confirmations)
    let confirmedQty = 0;
    for (const contrib of contributions) {
      // Simulate confirmation - assume all confirm except maybe one
      const confirmed = Math.random() > 0.1;
      if (confirmed) {
        await run(
          `UPDATE order_contributions SET confirmation_status = 'confirmed', pickup_status = 'pending'
           WHERE id = ?`,
          [contrib.id]
        );
        confirmedQty += contrib.quantity;
      } else {
        await run(
          `UPDATE order_contributions SET confirmation_status = 'rejected' WHERE id = ?`,
          [contrib.id]
        );
      }
    }

    // Update order
    const status = confirmedQty >= order[0].total_quantity * 0.7 ? 'fulfilled' : 'partial';
    await run(
      `UPDATE aggregated_orders SET confirmed_quantity = ?, status = ?
       WHERE id = ?`,
      [confirmedQty, status, orderId]
    );

    // If fulfilled, update requirement
    if (status === 'fulfilled') {
      await query(
        `UPDATE buyer_requirements SET status = 'fulfilled' WHERE id = ?`,
        [order[0].requirement_id]
      );
    }

    return {
      order_id: orderId,
      confirmed_quantity: confirmedQty,
      total_quantity: order[0].total_quantity,
      status: status,
      fulfillment_percentage: (confirmedQty / order[0].total_quantity) * 100
    };
  }
}

module.exports = new AggregationEngine();