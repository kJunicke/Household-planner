-- Add user_color column to household_members
ALTER TABLE household_members
ADD COLUMN user_color VARCHAR(7) DEFAULT '#4A90E2';

-- Add constraint to ensure valid hex color format
ALTER TABLE household_members
ADD CONSTRAINT valid_hex_color CHECK (user_color ~ '^#[0-9A-Fa-f]{6}$');

-- Set default colors for existing users (different colors for variety)
WITH numbered_users AS (
  SELECT user_id, ROW_NUMBER() OVER (ORDER BY user_id) as row_num
  FROM household_members
)
UPDATE household_members
SET user_color = CASE
  WHEN numbered_users.row_num % 8 = 1 THEN '#4A90E2'
  WHEN numbered_users.row_num % 8 = 2 THEN '#E74C3C'
  WHEN numbered_users.row_num % 8 = 3 THEN '#2ECC71'
  WHEN numbered_users.row_num % 8 = 4 THEN '#F39C12'
  WHEN numbered_users.row_num % 8 = 5 THEN '#9B59B6'
  WHEN numbered_users.row_num % 8 = 6 THEN '#1ABC9C'
  WHEN numbered_users.row_num % 8 = 7 THEN '#E67E22'
  ELSE '#34495E'
END
FROM numbered_users
WHERE household_members.user_id = numbered_users.user_id;
