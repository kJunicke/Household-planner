-- Add UPDATE policy for household_members so users can update their own display_name
CREATE POLICY "Users can update their own member profile"
ON household_members FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
