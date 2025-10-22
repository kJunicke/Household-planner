-- Update NULL display_names with email prefix
UPDATE household_members hm
SET display_name = SPLIT_PART((SELECT email FROM auth.users WHERE id = hm.user_id), '@', 1)
WHERE display_name IS NULL;
