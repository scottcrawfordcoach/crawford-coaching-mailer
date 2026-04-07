-- ============================================================
-- Migration 004: Expand campaign_events for Resend webhooks
-- Run after 003_edition_slug.sql
-- ============================================================

-- Widen the event_type CHECK constraint to accept Resend webhook events.
-- Existing values (open, click, unsubscribe) are preserved.
-- New values: delivered, bounced, complained

ALTER TABLE campaign_events
  DROP CONSTRAINT IF EXISTS campaign_events_event_type_check;

ALTER TABLE campaign_events
  ADD CONSTRAINT campaign_events_event_type_check
  CHECK (event_type IN ('open', 'click', 'unsubscribe', 'delivered', 'bounced', 'complained'));

-- Add a column to store Resend's email ID for webhook cross-referencing
ALTER TABLE campaign_recipients
  ADD COLUMN IF NOT EXISTS resend_email_id text;
