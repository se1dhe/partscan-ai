CREATE TABLE IF NOT EXISTS parts(
 id UUID PRIMARY KEY,
 name VARCHAR(255),
 manufacturer VARCHAR(255),
 article_number VARCHAR(255),
 category VARCHAR(255),
 confidence DOUBLE PRECISION,
 image_url TEXT
);
