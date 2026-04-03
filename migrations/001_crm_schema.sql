-- ============================================================
-- Crawford Coaching CRM — Migration 001
-- Run once in Supabase SQL editor or via Supabase CLI:
--   supabase db push
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";


-- ============================================================
-- contacts
-- Core identity record. One row per person.
-- ============================================================
create table if not exists contacts (
  id                        uuid primary key default gen_random_uuid(),

  -- Legacy ID from contacts_master.csv — preserved for accounting script compatibility
  contact_id                varchar(10) unique,

  -- Identity
  first_name                text,
  last_name                 text,
  email                     text unique,
  phone                     text,

  -- Status
  contact_status            text not null default 'active'
                              check (contact_status in ('active', 'previous_client', 'lead', 'inactive')),

  -- E-transfer name used in bank statements (for reconcile.py lookup)
  etransfer_name            text,

  -- Newsletter / marketing
  newsletter_enabled        boolean not null default false,
  newsletter_status         text check (newsletter_status in ('subscribed', 'unsubscribed', 'cleaned')),
  newsletter_optin_at       timestamptz,     -- OPTIN_TIME from Mailchimp
  newsletter_changed_at     timestamptz,     -- LAST_CHANGED / UNSUB_TIME / CLEAN_TIME from Mailchimp
  source_subscribed         boolean default false,
  source_unsubscribed       boolean default false,
  source_cleaned            boolean default false,

  -- Billing config
  billing_enabled           boolean not null default false,
  default_rate              numeric(10, 2),
  default_hst_rate          numeric(5, 4) default 0.13,
  billing_frequency         text default 'monthly',
  default_service_description text,
  payment_terms_days        integer default 7,
  billing_email_override    text,

  -- Household billing: points to the contact who pays this person's invoice
  -- Null = self-paying. Used for Carrie Silver → Pete Silver, Suzanne Thorson → Eric Thorson
  billing_payer_id          uuid references contacts(id) on delete set null,
  billing_note              text,

  -- Operational notes (human-readable only — NOT for AI preference context)
  notes                     text,

  -- Future: Growth Zone / Smart Journal account link (unused in phase 1)
  auth_user_id              uuid,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

comment on column contacts.contact_id is
  'Legacy CT0001-style ID preserved for accounting script compatibility during migration.';
comment on column contacts.billing_payer_id is
  'Points to the contact who pays this person''s invoice. Null = self-paying.';
comment on column contacts.auth_user_id is
  'Reserved for Growth Zone / Smart Journal Supabase Auth link. Unused in phase 1.';
comment on column contacts.notes is
  'Human-readable operational remarks only. AI preference context goes in client_profiles (future table).';
comment on column contacts.newsletter_optin_at is
  'OPTIN_TIME from Mailchimp export. Populated during seed; updated when contact subscribes via web form.';
comment on column contacts.newsletter_changed_at is
  'Most recent newsletter status change timestamp. LAST_CHANGED (subscribed), UNSUB_TIME, or CLEAN_TIME from Mailchimp.';


-- ============================================================
-- enrollment
-- Group training enrollment. Separate from contacts because:
--   - enrolled group ≠ attending group for 5 clients
--   - some clients are enrolled in 2 groups
--   - billing is always against enrolled group, not attending
--   - supports historical records (temp schedules, returns from absence)
-- ============================================================
create table if not exists enrollment (
  id                uuid primary key default gen_random_uuid(),
  contact_id        uuid not null references contacts(id) on delete cascade,

  -- What they're enrolled in and billed for
  enrolled_group    text,                    -- e.g. 'M/W/F 6:15'
  enrolled_days     text,                    -- e.g. 'MON,WED,FRI' (comma-separated)

  -- What they actually attend (null = same as enrolled)
  attending_group   text,                    -- e.g. 'TH 9' (only set when different)
  attending_days    text,                    -- e.g. 'THU' (only set when different)

  is_active         boolean not null default true,
  started_at        date,
  ended_at          date,                    -- null = currently active

  -- Billing override note for this enrollment
  -- e.g. '1x/week only', 'temp schedule; billed at enrolled', '+FRI cross-group'
  billing_note      text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column enrollment.enrolled_days is
  'Comma-separated day list: MON,WED,FRI. Used for billing calculation and group capacity.';
comment on column enrollment.attending_group is
  'Only populated when actual attendance differs from enrolled group. Billing ignores this field.';


-- ============================================================
-- contact_tags
-- Tags stored as individual rows with category.
-- Replaces the semicolon-delimited tags string in contacts_master.csv.
-- Categories: day | slot | program | status
-- ============================================================
create table if not exists contact_tags (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid not null references contacts(id) on delete cascade,
  tag           text not null,
  category      text not null check (category in ('day', 'slot', 'program', 'status')),
  created_at    timestamptz not null default now(),

  unique (contact_id, tag)
);

comment on column contact_tags.category is
  'day=MON/TUE etc, slot=group time e.g. M/W/F 6:15, program=Synergize Fitness etc, status=ACTIVE/INVOICE_CLIENT etc';


-- ============================================================
-- engagements
-- Event log for website interactions, form submissions,
-- newsletter signups, assistant interactions.
-- contact_id is nullable — anonymous visitors generate events too,
-- linked retroactively via email_hint when they become a contact.
-- ============================================================
create table if not exists engagements (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid references contacts(id) on delete set null,

  -- Capture email before contact exists (for retroactive linking)
  email_hint    text,

  source        text,     -- e.g. 'crawford-site/contact', 'assistant', 'newsletter'
  offer         text,     -- e.g. 'synergize', 'whole', 'coaching', 'growth-zone'
  action        text,     -- e.g. 'form_submit', 'newsletter_signup', 'assistant_chat'
  metadata      jsonb,    -- arbitrary additional context

  occurred_at   timestamptz not null default now()
);

comment on column engagements.contact_id is
  'Nullable — anonymous visitors can generate engagement events before they are known contacts.';
comment on column engagements.email_hint is
  'Email captured from form or assistant before contact record exists. Used for retroactive linking.';


-- ============================================================
-- Indexes
-- ============================================================

-- contacts — frequent lookup patterns
create index if not exists idx_contacts_contact_id   on contacts(contact_id);
create index if not exists idx_contacts_email         on contacts(email);
create index if not exists idx_contacts_etransfer     on contacts(etransfer_name);
create index if not exists idx_contacts_status        on contacts(contact_status);
create index if not exists idx_contacts_billing       on contacts(billing_enabled) where billing_enabled = true;
create index if not exists idx_contacts_payer         on contacts(billing_payer_id) where billing_payer_id is not null;

-- enrollment
create index if not exists idx_enrollment_contact    on enrollment(contact_id);
create index if not exists idx_enrollment_active     on enrollment(is_active) where is_active = true;
create index if not exists idx_enrollment_group      on enrollment(enrolled_group);

-- tags
create index if not exists idx_tags_contact          on contact_tags(contact_id);
create index if not exists idx_tags_tag              on contact_tags(tag);
create index if not exists idx_tags_category         on contact_tags(category);

-- engagements
create index if not exists idx_engagements_contact   on engagements(contact_id);
create index if not exists idx_engagements_source    on engagements(source);
create index if not exists idx_engagements_occurred  on engagements(occurred_at desc);


-- ============================================================
-- updated_at trigger
-- Automatically updates updated_at on contacts and enrollment
-- ============================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger contacts_updated_at
  before update on contacts
  for each row execute function set_updated_at();

create trigger enrollment_updated_at
  before update on enrollment
  for each row execute function set_updated_at();


-- ============================================================
-- Row Level Security
-- Disabled for now — all access goes through the data-handler
-- Edge Function which uses the service role key (bypasses RLS).
-- Enable and configure when direct client access is needed
-- (Growth Zone / Smart Journal phase).
-- ============================================================
alter table contacts      disable row level security;
alter table enrollment    disable row level security;
alter table contact_tags  disable row level security;
alter table engagements   disable row level security;
