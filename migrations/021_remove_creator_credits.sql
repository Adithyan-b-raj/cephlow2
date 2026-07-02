-- 021_remove_creator_credits.sql
-- Migration to remove creator credits and drop the redemption requests table.

ALTER TABLE user_profiles DROP COLUMN creator_name;
ALTER TABLE user_profiles DROP COLUMN creator_credits;
DROP TABLE IF EXISTS redemption_requests;
