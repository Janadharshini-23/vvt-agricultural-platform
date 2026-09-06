const { query, run } = require('./database');

class MatchingEngine {
  calculateMatchScore(harvest, requirement) {
    let score = 0;

    // 1. Crop match (40%)
    if (harvest.crop && requirement.crop) {
      const cropMatch = harvest.crop.toLowerCase() === requirement.crop.toLowerCase();
      score += cropMatch ? 40 : 0;
    }

    // 2. Quantity match (15%)
    if (harvest.quantity > 0 && requirement.required_quantity > 0) {
      const ratio = Math.min(harvest.quantity / requirement.required_quantity, 1);
      score += ratio * 15;
    }

    // 3. Grade match (15%)
    if (harvest.grade && requirement.grade) {
      const gradeMatch = harvest.grade === requirement.grade;
      score += gradeMatch ? 15 : 0;
    }

    // 4. Price match (10%)
    if (harvest.expected_price && requirement.min_price && requirement.max_price) {
      const price = harvest.expected_price;
      const inRange = price >= requirement.min_price && price <= requirement.max_price;
      if (inRange) {
        score += 10;
      } else {
        const mid = (requirement.min_price + requirement.max_price) / 2;
        const diff = Math.abs(price - mid);
        const range = requirement.max_price - requirement.min_price;
        if (range > 0) {
          const closeness = Math.max(0, 1 - (diff / (range * 2)));
          score += closeness * 10;
        }
      }
    }

    // 5. Location match (10%)
    if (harvest.latitude && harvest.longitude && requirement.delivery_latitude && requirement.delivery_longitude) {
      const distance = this.calculateDistance(
        harvest.latitude, harvest.longitude,
        requirement.delivery_latitude, requirement.delivery_longitude
      );
      const locationScore = Math.max(0, 10 * (1 - Math.min(distance / 200, 1)));
      score += locationScore;
    }

    // 6. Delivery date match (10%)
    if (harvest.available_date && requirement.required_date) {
      const harvestDate = new Date(harvest.available_date);
      const requiredDate = new Date(requirement.required_date);
      if (harvestDate <= requiredDate) {
        score += 10;
      } else {
        const diffDays = (harvestDate - requiredDate) / (1000 * 60 * 60 * 24);
        if (diffDays <= 3) {
          score += 10 * (1 - diffDays / 3);
        }
      }
    }

    return Math.round(Math.min(score, 100));
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

  async findMatches(requirementId) {
    // Get the requirement
    const requirementResult = await query(
      `SELECT * FROM buyer_requirements WHERE id = ?`,
      [requirementId]
    );

    if (!requirementResult || requirementResult.length === 0) {
      throw new Error('Requirement not found');
    }

    const req = requirementResult[0];
    console.log(`🔍 Finding matches for requirement ${requirementId}: ${req.crop}, ${req.required_quantity}kg`);

    // Find available harvests for the same crop
    const harvests = await query(
      `SELECT h.*, f.id as farmer_id, f.farm_name, f.location_name, f.latitude, f.longitude,
              u.name as farmer_name, u.verified as farmer_verified
       FROM harvests h
       JOIN farmers f ON h.farmer_id = f.id
       JOIN users u ON f.user_id = u.id
       WHERE h.crop = ? AND h.status = 'available' AND h.remaining_quantity > 0
       ORDER BY h.created_at DESC`,
      [req.crop]
    );

    console.log(`📦 Found ${harvests.length} available harvests for crop ${req.crop}`);

    const matches = [];
    let totalMatched = 0;

    for (const harvest of harvests) {
      // Calculate match score
      const score = this.calculateMatchScore(harvest, req);
      
      // Determine offered price
      let offeredPrice = harvest.expected_price || req.min_price || 0;
      if (req.min_price && offeredPrice < req.min_price) {
        offeredPrice = req.min_price;
      }
      if (req.max_price && offeredPrice > req.max_price) {
        offeredPrice = req.max_price;
      }

      // Calculate how much we can take from this harvest
      const availableQty = harvest.remaining_quantity || harvest.quantity;
      const neededQty = req.required_quantity - totalMatched;
      const quantity = Math.min(availableQty, neededQty);

      if (quantity > 0 && score > 0) {
        matches.push({
          harvest_id: harvest.id,
          farmer_id: harvest.farmer_id,
          farmer_name: harvest.farmer_name,
          farm_name: harvest.farm_name,
          location: harvest.location_name,
          latitude: harvest.latitude,
          longitude: harvest.longitude,
          crop: harvest.crop,
          quantity: harvest.quantity,
          matched_quantity: Math.round(quantity * 100) / 100,
          grade: harvest.grade,
          offered_price: Math.round(offeredPrice * 100) / 100,
          match_score: score,
          harvest_date: harvest.harvest_date,
          available_date: harvest.available_date,
          farmer_verified: harvest.farmer_verified || 0,
          status: 'pending'
        });

        totalMatched += quantity;
        console.log(`  ✅ Matched ${quantity}kg from ${harvest.farmer_name} (score: ${score}%)`);
        
        if (totalMatched >= req.required_quantity) {
          console.log(`🎯 Requirement fully matched!`);
          break;
        }
      }
    }

    console.log(`📊 Total matched: ${totalMatched}kg from ${matches.length} farms`);

    // Sort by match score descending
    matches.sort((a, b) => b.match_score - a.match_score);

    return {
      requirement: req,
      matches: matches,
      total_matched: Math.min(totalMatched, req.required_quantity),
      fulfillment_percentage: Math.min((totalMatched / req.required_quantity) * 100, 100)
    };
  }

  async createMatches(requirementId) {
    console.log(`🔄 Creating matches for requirement ${requirementId}`);
    
    // First, delete any existing matches for this requirement
    await run('DELETE FROM matches WHERE requirement_id = ?', [requirementId]);
    console.log(`🗑️ Deleted existing matches`);

    // Find matches
    const result = await this.findMatches(requirementId);
    
    // Insert matches into database
    let insertedCount = 0;
    for (const match of result.matches) {
      try {
        await run(
          `INSERT INTO matches 
           (requirement_id, harvest_id, farmer_id, matched_quantity, offered_price, match_score, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            requirementId, 
            match.harvest_id, 
            match.farmer_id, 
            match.matched_quantity, 
            match.offered_price, 
            match.match_score, 
            'pending'
          ]
        );
        insertedCount++;
      } catch (err) {
        console.error(`❌ Error inserting match:`, err);
      }
    }

    console.log(`✅ Inserted ${insertedCount} matches`);

    // Update requirement with matched quantity
    await run(
      'UPDATE buyer_requirements SET matched_quantity = ? WHERE id = ?',
      [result.total_matched, requirementId]
    );
    console.log(`📊 Updated requirement matched_quantity to ${result.total_matched}`);

    // Verify matches were saved
    const verify = await query('SELECT COUNT(*) as count FROM matches WHERE requirement_id = ?', [requirementId]);
    console.log(`🔍 Verification: ${verify[0].count} matches in database`);

    return {
      ...result,
      inserted_count: insertedCount
    };
  }
}

module.exports = new MatchingEngine();