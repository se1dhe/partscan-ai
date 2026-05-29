CREATE TABLE IF NOT EXISTS part_feedback(
 id UUID PRIMARY KEY,
 part_id UUID NOT NULL,
 is_correct BOOLEAN,
 suggested_name VARCHAR(255),
 suggested_manufacturer VARCHAR(255),
 suggested_article_number VARCHAR(255),
 suggested_category VARCHAR(255),
 note TEXT,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_part_feedback_part_id ON part_feedback(part_id);
