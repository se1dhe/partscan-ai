ALTER TABLE parts ADD COLUMN IF NOT EXISTS part_scope VARCHAR(64);
ALTER TABLE parts ADD COLUMN IF NOT EXISTS visible_component_name VARCHAR(255);
ALTER TABLE parts ADD COLUMN IF NOT EXISTS assembly_name VARCHAR(255);
ALTER TABLE parts ADD COLUMN IF NOT EXISTS uncertainty_note TEXT;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS search_queries TEXT;

UPDATE parts SET part_scope = 'unknown' WHERE part_scope IS NULL OR part_scope = '';
