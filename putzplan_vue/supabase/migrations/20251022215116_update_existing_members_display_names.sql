-- Update existing household_members without display_name
-- Set display_name to email prefix from auth.users
UPDATE household_members hm
SET display_name = COALESCE(
    SPLIT_PART((SELECT email FROM auth.users WHERE id = hm.user_id), '@', 1),
    'Unbekannt'
)
WHERE display_name IS NULL OR display_name = '';
