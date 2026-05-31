ALTER TABLE parts ADD COLUMN IF NOT EXISTS normalized_name VARCHAR(255);
ALTER TABLE parts ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS condition VARCHAR(255);
ALTER TABLE parts ADD COLUMN IF NOT EXISTS needs_better_photo BOOLEAN;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS identification_reason TEXT;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS visible_markings TEXT;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS compatible_vehicles TEXT;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS source_hints TEXT;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS photo_tips TEXT;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS alternatives TEXT;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS raw_analysis TEXT;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS review_status VARCHAR(64);
ALTER TABLE parts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

UPDATE parts SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL;
UPDATE parts SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE parts SET review_status = 'pending' WHERE review_status IS NULL OR review_status = '';

CREATE TABLE IF NOT EXISTS part_feedback(
 id UUID PRIMARY KEY,
 part_id UUID NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
 is_correct BOOLEAN,
 suggested_name VARCHAR(255),
 suggested_manufacturer VARCHAR(255),
 suggested_article_number VARCHAR(255),
 suggested_category VARCHAR(255),
 note TEXT,
 created_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS part_market_listings(
 id UUID PRIMARY KEY,
 part_id UUID NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
 source VARCHAR(64) NOT NULL,
 title TEXT,
 price NUMERIC(12,2),
 currency VARCHAR(16),
 url TEXT,
 location VARCHAR(255),
 image_url TEXT,
 published_at VARCHAR(255),
 matched_query VARCHAR(255),
 created_at TIMESTAMP WITH TIME ZONE,
 updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_market_listings_part_id ON part_market_listings(part_id);
CREATE INDEX IF NOT EXISTS idx_market_listings_source ON part_market_listings(source);
