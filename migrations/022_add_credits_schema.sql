-- Migration: Add credit cost columns to workspaces and action_type to ledgers

-- 1. Add credit cost columns to workspaces table
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS generation_cost numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS email_cost numeric NOT NULL DEFAULT 0.2,
  ADD COLUMN IF NOT EXISTS whatsapp_cost numeric NOT NULL DEFAULT 0.5;

-- 2. Add action_type column to ledgers table to trace what action consumed the credits
ALTER TABLE public.ledgers
  ADD COLUMN IF NOT EXISTS action_type text CHECK (action_type IN ('generation', 'email', 'whatsapp'));
