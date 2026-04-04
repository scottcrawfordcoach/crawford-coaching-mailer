-- ============================================================
-- Migration 003: Add edition_slug to sent_campaigns
-- Run after 002_mailing_tables.sql
-- ============================================================

-- Add edition_slug to sent_campaigns so the landing page can
-- join campaign analytics rows to storage edition folders.
-- Nullable: general emails and older campaigns have no slug.

ALTER TABLE sent_campaigns
  ADD COLUMN IF NOT EXISTS edition_slug text;

-- Index for fast lookup by slug (e.g. landing page joining
-- storage folder list to most recent campaign per edition).
CREATE INDEX IF NOT EXISTS idx_sent_campaigns_edition_slug
  ON sent_campaigns (edition_slug)
  WHERE edition_slug IS NOT NULL;
