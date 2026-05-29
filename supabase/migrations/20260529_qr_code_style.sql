ALTER TABLE trucks
ADD COLUMN IF NOT EXISTS qr_code_style text NOT NULL DEFAULT 'standard';
