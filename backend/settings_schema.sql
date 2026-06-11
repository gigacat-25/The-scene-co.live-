-- Create Settings table in D1
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed default global settings from HTML
INSERT OR REPLACE INTO settings (key, value) VALUES
('site_name', 'THE SCENE CO. LIVE'),
('logo_nav', '/logo-nav.png'),
('logo_hero', '/logo-hero.png'),
('email', 'thejaswinps@gmail.com'),
('phone', '+1 (800) 555-SCENE'),
('whatsapp', 'https://wa.me/1234567890'),
('footer_desc', 'Spatial event architects, engineers, and production leads translating radical creative concepts into high-fidelity physical reality.'),
('hero_title', 'We build <span class="magenta-text">temporary worlds</span> for <span class="yellow-text">permanent memories</span>.'),
('hero_subtitle', 'An end-to-end production studio engineering premium live experiences — from arena concert stages and brand activations to luxury architectural events.');
