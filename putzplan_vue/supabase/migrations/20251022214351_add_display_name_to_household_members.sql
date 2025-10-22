-- Add display_name column to household_members table
ALTER TABLE household_members
ADD COLUMN display_name TEXT;

-- Set default display_name to 'Unbekannt' for existing members
UPDATE household_members
SET display_name = 'Unbekannt'
WHERE display_name IS NULL;
