-- ============================================================
-- Migration 002: Mailing Tool Tables
-- Run after 001_crm_schema.sql
-- ============================================================

-- sent_campaigns
-- One row per send operation (general email or newsletter)
CREATE TABLE IF NOT EXISTS sent_campaigns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_type    text NOT NULL CHECK (campaign_type IN ('general', 'newsletter')),
  subject          text NOT NULL,
  from_name        text NOT NULL DEFAULT 'Scott Crawford Coaching',
  from_email       text NOT NULL DEFAULT 'scott@crawford-coaching.ca',
  html_body        text NOT NULL,
  text_body        text,
  recipient_count  integer NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'sent'
                     CHECK (status IN ('draft', 'sending', 'sent', 'failed')),
  sent_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- campaign_recipients
-- One row per (campaign × contact)
CREATE TABLE IF NOT EXISTS campaign_recipients (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES sent_campaigns(id) ON DELETE CASCADE,
  contact_id   uuid REFERENCES contacts(id) ON DELETE SET NULL,
  email        text NOT NULL,
  first_name   text,
  status       text NOT NULL DEFAULT 'sent'
                 CHECK (status IN ('sent', 'bounced', 'unsubscribed')),
  sent_at      timestamptz NOT NULL DEFAULT now()
);

-- campaign_events
-- Tracking events: open, click, unsubscribe
CREATE TABLE IF NOT EXISTS campaign_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    uuid NOT NULL REFERENCES sent_campaigns(id) ON DELETE CASCADE,
  recipient_id   uuid REFERENCES campaign_recipients(id) ON DELETE SET NULL,
  event_type     text NOT NULL CHECK (event_type IN ('open', 'click', 'unsubscribe')),
  url            text,
  ip             text,
  user_agent     text,
  occurred_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_events_campaign     ON campaign_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_events_recipient    ON campaign_events(recipient_id);
CREATE INDEX IF NOT EXISTS idx_campaign_events_type         ON campaign_events(event_type);
