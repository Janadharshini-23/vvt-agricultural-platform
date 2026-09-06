const express = require('express');
const router = express.Router();
const { query, run } = require('../database');
const matchingEngine = require('../matching-engine');

// GET all requirements
router.get('/', async (req, res) => {
  try {
    const { crop, status } = req.query;
    let sql = `
      SELECT br.*, b.company_name, b.buyer_type,
             (SELECT COUNT(*) FROM matches WHERE requirement_id = br.id) as match_count
      FROM buyer_requirements br
      JOIN buyers b ON br.buyer_id = b.id
      WHERE 1=1
    `;
    const params = [];
    
    if (crop) {
      sql += ` AND br.crop = ?`;
      params.push(crop);
    }
    if (status) {
      sql += ` AND br.status = ?`;
      params.push(status);
    }
    
    sql += ` ORDER BY br.created_at DESC`;
    
    const requirements = await query(sql, params);
    res.json(requirements);
  } catch (error) {
    console.error('Error fetching requirements:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET requirement by ID with matches
router.get('/:id', async (req, res) => {
  try {
    const requirement = await query(`
      SELECT br.*, b.company_name, b.buyer_type, b.delivery_location,
             (SELECT COUNT(*) FROM matches WHERE requirement_id = br.id) as match_count
      FROM buyer_requirements br
      JOIN buyers b ON br.buyer_id = b.id
      WHERE br.id = ?
    `, [req.params.id]);
    
    if (!requirement || requirement.length === 0) {
      return res.status(404).json({ error: 'Requirement not found' });
    }
    res.json(requirement[0]);
  } catch (error) {
    console.error('Error fetching requirement:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST create requirement
router.post('/', async (req, res) => {
  try {
    const { 
      buyer_id, crop, required_quantity, grade, min_price, max_price,
      delivery_location, delivery_latitude, delivery_longitude, required_date,
      quality_requirements
    } = req.body;

    console.log('📝 Creating requirement:', { buyer_id, crop, required_quantity });

    // Validate
    if (!buyer_id || !crop || !required_quantity) {
      return res.status(400).json({ error: 'Missing required fields: buyer_id, crop, required_quantity' });
    }

    // Check if buyer exists
    const buyer = await query('SELECT * FROM buyers WHERE id = ?', [buyer_id]);
    if (!buyer || buyer.length === 0) {
      return res.status(404).json({ error: 'Buyer not found' });
    }

    // Insert requirement
    const result = await run(
      `INSERT INTO buyer_requirements 
       (buyer_id, crop, required_quantity, matched_quantity, grade, min_price, max_price,
        delivery_location, delivery_latitude, delivery_longitude, required_date,
        quality_requirements, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [buyer_id, crop, required_quantity, 0, grade, min_price, max_price,
       delivery_location, delivery_latitude, delivery_longitude, required_date,
       quality_requirements || '', 'open']
    );

    const requirementId = result.id;
    console.log('✅ Requirement created with ID:', requirementId);

    // Run matching engine
    let matchesResult = null;
    try {
      console.log('🔄 Running matching engine...');
      matchesResult = await matchingEngine.createMatches(requirementId);
      console.log('✅ Matching completed:', matchesResult.total_matched, 'kg matched from', matchesResult.matches?.length || 0, 'farms');
    } catch (matchError) {
      console.error('❌ Matching error:', matchError.message);
      console.error(matchError.stack);
    }

    // Get the created requirement with match count
    const newRequirement = await query(`
      SELECT br.*, b.company_name,
             (SELECT COUNT(*) FROM matches WHERE requirement_id = br.id) as match_count
      FROM buyer_requirements br
      JOIN buyers b ON br.buyer_id = b.id
      WHERE br.id = ?
    `, [requirementId]);

    // Get matches for response
    const matches = await query(`
      SELECT m.*, f.farm_name, f.location_name, u.name as farmer_name
      FROM matches m
      JOIN farmers f ON m.farmer_id = f.id
      JOIN users u ON f.user_id = u.id
      WHERE m.requirement_id = ?
    `, [requirementId]);

    res.status(201).json({ 
      id: requirementId, 
      message: `Requirement posted! Found ${matchesResult?.matches?.length || 0} matching farms with ${Math.round(matchesResult?.total_matched || 0)}kg`,
      requirement: newRequirement[0] || null,
      matches: matches || [],
      matching_summary: matchesResult ? {
        total_matched: matchesResult.total_matched,
        farm_count: matchesResult.matches?.length || 0,
        fulfillment_percentage: matchesResult.fulfillment_percentage
      } : null
    });
  } catch (error) {
    console.error('❌ Error creating requirement:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET requirement matches
router.get('/:id/matches', async (req, res) => {
  try {
    const matches = await query(`
      SELECT m.*, h.crop, h.grade, h.harvest_date, h.available_date,
             f.farm_name, f.location_name, f.latitude, f.longitude,
             u.name as farmer_name, u.verified as farmer_verified
      FROM matches m
      JOIN harvests h ON m.harvest_id = h.id
      JOIN farmers f ON m.farmer_id = f.id
      JOIN users u ON f.user_id = u.id
      WHERE m.requirement_id = ?
      ORDER BY m.match_score DESC
    `, [req.params.id]);
    
    console.log(`📊 Found ${matches.length} matches for requirement ${req.params.id}`);
    res.json(matches);
  } catch (error) {
    console.error('Error fetching matches:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;