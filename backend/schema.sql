-- D1 Schema for The Scene Co. Live CMS

-- 1. Users table (Admin auth)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Projects table
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  location TEXT NOT NULL,
  image_url TEXT NOT NULL,
  col_span INTEGER DEFAULT 3,
  card_class TEXT DEFAULT 'card-magenta',
  sort_order INTEGER DEFAULT 0
);

-- 3. Services table
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  card_class TEXT DEFAULT 'card-lime',
  sort_order INTEGER DEFAULT 0
);

-- 4. Inquiries table
CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  project_type TEXT NOT NULL,
  budget TEXT NOT NULL,
  timeline TEXT NOT NULL,
  details TEXT NOT NULL,
  status TEXT DEFAULT 'unread',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed Initial Projects
INSERT INTO projects (title, description, category, location, image_url, col_span, card_class, sort_order) VALUES
('AURA', 'A multi-sensory warehouse takeover featuring kinetic laser displays and reactive acoustic flooring, designed to launch a luxury electric automotive line.', 'Immersive Brand Activation', 'New York City', 'https://lh3.googleusercontent.com/aida-public/AB6AXuBTFKl4SRNnhkXb6Zi6fgh1HBb2ib3PiVphyd_1Iz7pOCPdCnR0KbQ4HzkmUuo-LIgG3CpVrcUHGYe1Sp8vnjgfacN8k7Sy3KM0GaRu91UL5hKeiGzxL51WvN0veCwcAF3fuSK2_3Ca_RfCEBB4miJ4Q4TWiORNj44ejxQN-zCLWODjYO5YEgDr32Sj7sj9yJaW3cgOHUqU8-2Xh9x3LkXmKFJbfeJ_ZsFzrMYIKeZiOyjnuu76QUIfbYtVvKfgUrZttPJxw_-C2Wrq', 4, 'card-magenta', 1),
('MONOLITH', 'A minimalist stage design utilizing an 80-meter seamless LED curved screen to deliver a global keynote.', 'Corporate Summit', 'London', 'https://lh3.googleusercontent.com/aida-public/AB6AXuCmZIOui4BQO6tRzfZj_1pXMCIE_GOW8OP876C3h0PceTVum4Bffd0zmL9_eU_tDyTRsRN8cDJaaMe9jg93_fKpCmBbUmERf2PB-u4iQ_7W-B9WXX-GEC6Hn6H0NFFc-aQKs7MA4HlIurw5DeuDq0fWsAnOt17m0-3HJ6ZQ0-_tHTbKBVCUx8dix_Rek9RodYnyqfBungUwaMGlzPcWsQZAXTVRZtCsQfbbKwvTGXHUQBdx5XBmtlwPr6jxE16Db_cE1fPu2bhk493I', 2, 'card-yellow', 2),
('NOCTURNE', 'An outdoor dining pavilion wrapped in custom structural glass, illuminated by thousands of suspended, fiber-optic light points mirroring the night sky.', 'Luxury Wedding', 'Lake Como', 'https://lh3.googleusercontent.com/aida-public/AB6AXuCkJRcY5ctpT5jQqMc0nYah0eqnVSN53_Arg6NtqmRTFdmmnb9F35sqnR30kWu3KslTxU_rTXS0Rh9utvbzDKE8mjRghR7NNF3ADZAwd_sKz0xk2eJVooNHKqjLdGDRRSUa6MJ5rO6dQge8cAjQ_Lxh_bl9M-GUY1CAFZ1hf8x6_GbJT2y0yef4QVsW1gTF4pai6yEDcqFTgXw7nxiP28c1wnRSRAS7hXcSVQupfwzP6y0smaodV46bUKpsA0FIDlSmyDYbdy3uJT5g', 3, 'card-orange', 3),
('PRISM', 'Full stage design, lighting choreography, and sound engineering for a sold-out arena tour featuring 3D holographic projection systems.', 'Arena Live Show', 'Tokyo', 'https://images.unsplash.com/photo-1506157786151-b8491531f063?q=80&w=800&auto=format&fit=crop', 3, 'card-blue', 4),
('ECHOES', 'A brutalist concrete runway set design featuring real-time generative ambient light-projections mapping the models'' movements.', 'Fashion Runway', 'Paris', 'https://images.unsplash.com/photo-1509631179647-0177331693ae?q=80&w=800&auto=format&fit=crop', 2, 'card-lime', 5),
('SANCTUARY', 'A premium desert oasis structure built from scratch, combining traditional Middle Eastern elements with modern climate-controlled dome architecture.', 'VIP Brand Activation', 'Dubai', 'https://images.unsplash.com/photo-1518173946687-a4c8a383392e?q=80&w=800&auto=format&fit=crop', 4, 'card-orange', 6);

-- Seed Initial Services
INSERT INTO services (title, description, icon, card_class, sort_order) VALUES
('Corporate Events', 'Translating corporate strategy into immersive physical narratives. Keynotes, summits, VIP dinners, and brand milestones executed at scale.', 'corporate_fare', 'card-lime', 1),
('Wedding Production', 'Architectural beauty meets flawless logistics. Custom stages, floral installations, and full spatial choreography for unforgettable celebrations.', 'favorite', 'card-magenta', 2),
('Brand Activations', 'Interactive retail pop-ups and sensory galleries built to capture attention, engage audiences, and spark digital growth.', 'campaign', 'card-orange', 3),
('Concerts & Live Shows', 'Stadium-scale mainstage setups, laser design, tour rigs, pyrotechnic coordination, and artist backstage logistics.', 'theater_comedy', 'card-blue', 4),
('Stage, Sound & Lighting', 'The acoustic and visual spine. Programmed moving lights, custom LED arrays, and high-fidelity spatial audio setups.', 'precision_manufacturing', 'card-yellow', 5),
('Venue Styling & Decor', 'Complete spatial shifts. Sourcing and fabricating custom furniture, drapes, and installations that alter the room''s volume.', 'spatial_tracking', 'card-magenta', 6),
('Artist Management', 'Seamless coordination of world-class performers, contractual riders, travel schedules, and stage cues.', 'star', 'card-blue', 7),
('Exhibition & Setup', 'High-traffic exhibition stands, trade show pavilions, and gallery configurations designed for optimal visitor circulation.', 'grid_view', 'card-lime', 8),
('End-to-End Execution', 'Complete operational ownership. Site scoping, permit acquisition, vendor coordination, live stage direction, and strike.', 'verified', 'card-orange', 9);
