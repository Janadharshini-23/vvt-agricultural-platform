-- USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  email TEXT UNIQUE,
  password TEXT,
  role TEXT NOT NULL CHECK(role IN ('farmer', 'buyer', 'transporter', 'admin')),
  verified INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- FARMERS TABLE
CREATE TABLE IF NOT EXISTS farmers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  farm_name TEXT,
  location_name TEXT,
  latitude REAL,
  longitude REAL,
  land_area REAL,
  primary_crops TEXT,
  verification_status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- BUYERS TABLE
CREATE TABLE IF NOT EXISTS buyers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  company_name TEXT,
  buyer_type TEXT CHECK(buyer_type IN ('retailer', 'restaurant', 'industry', 'bulk', 'consumer')),
  delivery_location TEXT,
  latitude REAL,
  longitude REAL,
  verification_status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- TRANSPORTERS TABLE
CREATE TABLE IF NOT EXISTS transporters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  company_name TEXT,
  vehicle_number TEXT,
  vehicle_type TEXT,
  capacity REAL,
  current_latitude REAL,
  current_longitude REAL,
  availability_status TEXT DEFAULT 'available',
  verification_status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- HARVESTS TABLE
CREATE TABLE IF NOT EXISTS harvests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farmer_id INTEGER NOT NULL,
  crop TEXT NOT NULL,
  quantity REAL NOT NULL,
  remaining_quantity REAL,
  grade TEXT,
  harvest_date DATE,
  available_date DATE,
  expected_price REAL,
  quality_notes TEXT,
  image_url TEXT,
  latitude REAL,
  longitude REAL,
  status TEXT DEFAULT 'available',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (farmer_id) REFERENCES farmers(id)
);

-- BUYER_REQUIREMENTS TABLE
CREATE TABLE IF NOT EXISTS buyer_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_id INTEGER NOT NULL,
  crop TEXT NOT NULL,
  required_quantity REAL NOT NULL,
  matched_quantity REAL DEFAULT 0,
  grade TEXT,
  min_price REAL,
  max_price REAL,
  delivery_location TEXT,
  delivery_latitude REAL,
  delivery_longitude REAL,
  required_date DATE,
  quality_requirements TEXT,
  status TEXT DEFAULT 'open',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (buyer_id) REFERENCES buyers(id)
);

-- MATCHES TABLE
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requirement_id INTEGER NOT NULL,
  harvest_id INTEGER NOT NULL,
  farmer_id INTEGER NOT NULL,
  matched_quantity REAL NOT NULL,
  offered_price REAL,
  match_score REAL,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (requirement_id) REFERENCES buyer_requirements(id),
  FOREIGN KEY (harvest_id) REFERENCES harvests(id),
  FOREIGN KEY (farmer_id) REFERENCES farmers(id)
);

-- AGGREGATED_ORDERS TABLE
CREATE TABLE IF NOT EXISTS aggregated_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requirement_id INTEGER NOT NULL,
  total_quantity REAL NOT NULL,
  confirmed_quantity REAL DEFAULT 0,
  price REAL,
  aggregation_location TEXT,
  aggregation_latitude REAL,
  aggregation_longitude REAL,
  status TEXT DEFAULT 'aggregating',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (requirement_id) REFERENCES buyer_requirements(id)
);

-- ORDER_CONTRIBUTIONS TABLE
CREATE TABLE IF NOT EXISTS order_contributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aggregated_order_id INTEGER NOT NULL,
  farmer_id INTEGER NOT NULL,
  harvest_id INTEGER NOT NULL,
  quantity REAL NOT NULL,
  price REAL,
  confirmation_status TEXT DEFAULT 'pending',
  pickup_status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (aggregated_order_id) REFERENCES aggregated_orders(id),
  FOREIGN KEY (farmer_id) REFERENCES farmers(id),
  FOREIGN KEY (harvest_id) REFERENCES harvests(id)
);

-- LOGISTICS TABLE
CREATE TABLE IF NOT EXISTS logistics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aggregated_order_id INTEGER NOT NULL,
  transporter_id INTEGER,
  vehicle_number TEXT,
  pickup_time DATETIME,
  aggregation_time DATETIME,
  dispatch_time DATETIME,
  expected_delivery DATETIME,
  current_latitude REAL,
  current_longitude REAL,
  status TEXT DEFAULT 'scheduled',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (aggregated_order_id) REFERENCES aggregated_orders(id),
  FOREIGN KEY (transporter_id) REFERENCES transporters(id)
);

-- ORDERS TABLE
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aggregated_order_id INTEGER NOT NULL,
  buyer_id INTEGER NOT NULL,
  total_quantity REAL NOT NULL,
  total_amount REAL,
  payment_status TEXT DEFAULT 'pending',
  delivery_status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (aggregated_order_id) REFERENCES aggregated_orders(id),
  FOREIGN KEY (buyer_id) REFERENCES buyers(id)
);

-- PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  status TEXT DEFAULT 'escrow',
  released_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_harvests_farmer_id ON harvests(farmer_id);
CREATE INDEX IF NOT EXISTS idx_harvests_crop ON harvests(crop);
CREATE INDEX IF NOT EXISTS idx_requirements_buyer_id ON buyer_requirements(buyer_id);
CREATE INDEX IF NOT EXISTS idx_requirements_crop ON buyer_requirements(crop);
CREATE INDEX IF NOT EXISTS idx_matches_requirement_id ON matches(requirement_id);
CREATE INDEX IF NOT EXISTS idx_matches_farmer_id ON matches(farmer_id);
CREATE INDEX IF NOT EXISTS idx_aggregated_orders_requirement_id ON aggregated_orders(requirement_id);
CREATE INDEX IF NOT EXISTS idx_order_contributions_order_id ON order_contributions(aggregated_order_id);