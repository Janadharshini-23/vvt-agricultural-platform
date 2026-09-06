const { run, query, initDatabase } = require('./database');
const bcrypt = require('bcryptjs');

// Tamil Nadu locations
const LOCATIONS = {
  Kumbakonam: { lat: 10.9625, lng: 79.3823 },
  Thanjavur: { lat: 10.7870, lng: 79.1378 },
  Papanasam: { lat: 10.9200, lng: 79.2700 },
  Mayiladuthurai: { lat: 11.1031, lng: 79.6552 },
  Ramanathapuram: { lat: 9.3715, lng: 78.8304 },
  Chennai: { lat: 13.0827, lng: 80.2707 },
  Tiruvarur: { lat: 10.7632, lng: 79.6375 },
  Nagapattinam: { lat: 10.7649, lng: 79.8430 },
  Ariyalur: { lat: 11.1568, lng: 79.0354 },
  Perambalur: { lat: 11.2332, lng: 78.8828 }
};

const seedDatabase = async () => {
  try {
    console.log('🌱 Seeding database...');
    await initDatabase();

    // Clear existing data
    await run('DELETE FROM payments');
    await run('DELETE FROM orders');
    await run('DELETE FROM logistics');
    await run('DELETE FROM order_contributions');
    await run('DELETE FROM aggregated_orders');
    await run('DELETE FROM matches');
    await run('DELETE FROM buyer_requirements');
    await run('DELETE FROM harvests');
    await run('DELETE FROM transporters');
    await run('DELETE FROM buyers');
    await run('DELETE FROM farmers');
    await run('DELETE FROM users');

    console.log('📦 Creating users...');

    const hash = (pwd) => bcrypt.hashSync(pwd, 10);
    
    const users = [
      // Farmers
      { name: 'Ravi Kumar', phone: '9876543210', email: 'ravi@farm.com', password: 'farmer123', role: 'farmer', verified: 1 },
      { name: 'Meena', phone: '9876543211', email: 'meena@farm.com', password: 'farmer123', role: 'farmer', verified: 1 },
      { name: 'Suresh', phone: '9876543212', email: 'suresh@farm.com', password: 'farmer123', role: 'farmer', verified: 1 },
      { name: 'Lakshmi', phone: '9876543213', email: 'lakshmi@farm.com', password: 'farmer123', role: 'farmer', verified: 1 },
      { name: 'Arun', phone: '9876543214', email: 'arun@farm.com', password: 'farmer123', role: 'farmer', verified: 1 },
      // Buyers
      { name: 'Kaveri Fresh Foods', phone: '9876543220', email: 'kaveri@buyer.com', password: 'buyer123', role: 'buyer', verified: 1 },
      { name: 'Chennai Retail', phone: '9876543221', email: 'chennai@retail.com', password: 'buyer123', role: 'buyer', verified: 1 },
      // Transporters
      { name: 'Kumar Logistics', phone: '9876543222', email: 'kumar@logistics.com', password: 'trans123', role: 'transporter', verified: 1 },
      // Admin
      { name: 'Admin', phone: '9876543223', email: 'admin@vvt.com', password: 'admin123', role: 'admin', verified: 1 }
    ];

    const userIds = {};
    for (const user of users) {
      const result = await run(
        'INSERT INTO users (name, phone, email, password, role, verified) VALUES (?, ?, ?, ?, ?, ?)',
        [user.name, user.phone, user.email, hash(user.password), user.role, user.verified]
      );
      userIds[user.name] = result.id;
    }

    console.log('👨‍🌾 Creating farmers...');

    const farmerData = [
      { name: 'Ravi Kumar', farm: 'Ravi Farm', location: 'Kumbakonam', crops: 'Tomatoes, Rice, Chillies' },
      { name: 'Meena', farm: 'Meena Farms', location: 'Thanjavur', crops: 'Tomatoes, Onions, Brinjal' },
      { name: 'Suresh', farm: 'Suresh Agri', location: 'Papanasam', crops: 'Tomatoes, Paddy, Groundnut' },
      { name: 'Lakshmi', farm: 'Lakshmi Farm', location: 'Kumbakonam', crops: 'Tomatoes, Rice, Sugarcane' },
      { name: 'Arun', farm: 'Arun Organic', location: 'Mayiladuthurai', crops: 'Tomatoes, Banana, Coconut' }
    ];

    const farmerIds = {};
    for (const f of farmerData) {
      const loc = LOCATIONS[f.location] || LOCATIONS.Kumbakonam;
      const result = await run(
        `INSERT INTO farmers (user_id, farm_name, location_name, latitude, longitude, land_area, primary_crops, verification_status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userIds[f.name], f.farm, f.location, loc.lat, loc.lng, 2.5 + Math.random() * 3, f.crops, 'verified']
      );
      farmerIds[f.name] = result.id;
    }

    console.log('📦 Creating harvests for each farmer...');

    const harvestData = [
      { farmer: 'Ravi Kumar', crop: 'Tomatoes', qty: 500, grade: 'A', price: 24, harvest: '2026-09-12', available: '2026-09-13' },
      { farmer: 'Ravi Kumar', crop: 'Rice', qty: 1000, grade: 'A', price: 32, harvest: '2026-09-10', available: '2026-09-15' },
      { farmer: 'Meena', crop: 'Tomatoes', qty: 800, grade: 'A', price: 24, harvest: '2026-09-12', available: '2026-09-13' },
      { farmer: 'Meena', crop: 'Onions', qty: 300, grade: 'B', price: 18, harvest: '2026-09-08', available: '2026-09-14' },
      { farmer: 'Suresh', crop: 'Tomatoes', qty: 700, grade: 'A', price: 25, harvest: '2026-09-11', available: '2026-09-13' },
      { farmer: 'Suresh', crop: 'Chillies', qty: 200, grade: 'A', price: 45, harvest: '2026-09-09', available: '2026-09-14' },
      { farmer: 'Lakshmi', crop: 'Tomatoes', qty: 1200, grade: 'A', price: 24, harvest: '2026-09-12', available: '2026-09-13' },
      { farmer: 'Lakshmi', crop: 'Sugarcane', qty: 2000, grade: 'A', price: 12, harvest: '2026-09-05', available: '2026-09-18' },
      { farmer: 'Arun', crop: 'Tomatoes', qty: 900, grade: 'A', price: 25, harvest: '2026-09-11', available: '2026-09-13' },
      { farmer: 'Arun', crop: 'Banana', qty: 400, grade: 'A', price: 28, harvest: '2026-09-07', available: '2026-09-14' }
    ];

    for (const h of harvestData) {
      const farmerId = farmerIds[h.farmer];
      const loc = LOCATIONS[farmerData.find(f => f.name === h.farmer)?.location || 'Kumbakonam'];
      await run(
        `INSERT INTO harvests (farmer_id, crop, quantity, remaining_quantity, grade, harvest_date, available_date, expected_price, quality_notes, latitude, longitude, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [farmerId, h.crop, h.qty, h.qty, h.grade, h.harvest, h.available, h.price, 'Fresh harvest, premium quality', loc.lat, loc.lng, 'available']
      );
    }

    console.log('🏢 Creating buyers...');

    const buyerData = [
      { name: 'Kaveri Fresh Foods', company: 'Kaveri Fresh Foods', type: 'bulk', location: 'Chennai' },
      { name: 'Chennai Retail', company: 'Chennai Retail Mart', type: 'retailer', location: 'Chennai' }
    ];

    const buyerIds = {};
    for (const b of buyerData) {
      const loc = LOCATIONS[b.location] || LOCATIONS.Chennai;
      const result = await run(
        `INSERT INTO buyers (user_id, company_name, buyer_type, delivery_location, latitude, longitude, verification_status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userIds[b.name], b.company, b.type, b.location, loc.lat, loc.lng, 'verified']
      );
      buyerIds[b.name] = result.id;
    }

    console.log('📋 Creating buyer requirements...');

    const reqResult = await run(
      `INSERT INTO buyer_requirements (buyer_id, crop, required_quantity, grade, min_price, max_price, delivery_location, delivery_latitude, delivery_longitude, required_date, quality_requirements, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [buyerIds['Kaveri Fresh Foods'], 'Tomatoes', 10000, 'A', 26, 28, 'Chennai', LOCATIONS.Chennai.lat, LOCATIONS.Chennai.lng, '2026-09-15', 'Fresh, Grade A tomatoes, no blemishes', 'open']
    );

    const requirementId = reqResult.id;

    console.log('🤝 Creating matches...');

    // Get all tomato harvests
    const tomatoHarvests = await query(
      `SELECT h.*, f.id as farmer_id, f.farm_name, f.location_name, f.latitude, f.longitude 
       FROM harvests h 
       JOIN farmers f ON h.farmer_id = f.id 
       WHERE h.crop = 'Tomatoes' AND h.status = 'available'`
    );

    const matchScores = [92, 88, 85, 90, 87, 82, 84, 86];
    let totalMatched = 0;
    
    for (let i = 0; i < tomatoHarvests.length; i++) {
      const h = tomatoHarvests[i];
      const score = matchScores[i % matchScores.length];
      const price = 24 + Math.floor(Math.random() * 3);
      const quantity = Math.min(h.quantity, 10000 - totalMatched);
      
      if (totalMatched < 10000) {
        await run(
          `INSERT INTO matches (requirement_id, harvest_id, farmer_id, matched_quantity, offered_price, match_score, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [requirementId, h.id, h.farmer_id, quantity, price, score, 'pending']
        );
        totalMatched += quantity;
      }
    }

    // Update matched quantity
    await run(
      'UPDATE buyer_requirements SET matched_quantity = ? WHERE id = ?',
      [totalMatched, requirementId]
    );

    console.log('🚚 Creating transporter...');

    const transLoc = LOCATIONS.Kumbakonam;
    await run(
      `INSERT INTO transporters (user_id, company_name, vehicle_number, vehicle_type, capacity, current_latitude, current_longitude, availability_status, verification_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userIds['Kumar Logistics'], 'Kumar Logistics', 'TN 49 AB 1234', '10-ton truck', 10000, transLoc.lat, transLoc.lng, 'available', 'verified']
    );

    console.log('✅ Seeding complete!');
    console.log(`   - ${users.length} users created`);
    console.log(`   - ${farmerData.length} farmers created`);
    console.log(`   - ${harvestData.length} harvests created`);
    console.log(`   - ${buyerData.length} buyers created`);
    console.log(`   - 1 buyer requirement created (${totalMatched}kg matched)`);
    console.log(`   - ${tomatoHarvests.length} matches created`);
    console.log(`   - 1 transporter created`);
    console.log('\n📝 Login Credentials:');
    console.log('   Farmer: ravi@farm.com / farmer123');
    console.log('   Buyer: kaveri@buyer.com / buyer123');
    console.log('   Transporter: kumar@logistics.com / trans123');

  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  seedDatabase().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { seedDatabase };