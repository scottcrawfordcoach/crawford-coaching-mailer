# Change Update — 9 April 2026

Applies to: **crawford-coaching-mailer**, **crawford-site** (webapp CRM queries)

---

## 1. recipients.py — Newsletter query widened

**File:** `recipients.py` → `_newsletter_contacts()`

**Change:** The `newsletter` recipient mode previously filtered `contact_status = active` only. It now includes `previous_client` as well.

```python
# Before
.eq("contact_status", "active")

# After
.in_("contact_status", ["active", "previous_client"])
```

**Reason:** Previous clients who remain subscribed (newsletter_enabled=true) should continue to receive the newsletter. First affected contact: Pam Paterson (CT0120).

**Action for crawford-site:** Any webapp routes that resolve newsletter recipients (e.g. `/api/contacts/resolve` with a newsletter context) should apply the same logic if they ever filter by contact_status.

---

## 2. Subscription field clarification — source of truth

After a full audit, the canonical fields for determining newsletter send eligibility are:

| Field | Table | Role |
|---|---|---|
| `newsletter_enabled` | `contacts` | **Primary send gate** — used by `recipients.py` |
| `newsletter_status` | `contacts` | Mirror of enabled state; kept in sync |
| `contact_status` | `contacts` | Must be `active` OR `previous_client` |
| `email_consent` | `contacts` | General email permission flag (not checked by `recipients.py` today — but kept in sync with newsletter_enabled for subscribed contacts) |
| `contact_subscriptions.newsletter` | `contact_subscriptions` | Future preference-centre / unsubscribe-link target. Not currently read by `recipients.py`. |

The three marketing sub-types (`marketing_synergize`, `marketing_coaching`, `marketing_whole`) in `contact_subscriptions` are populated but not yet consumed by any send path. Safe to leave unpopulated for contacts seeded from Mailchimp.

**Supabase is the source of truth.** `crm/contacts_master.csv` is a derived export — run `db_export.py` to refresh before querying locally.

---

## 3. Contact data changes (Supabase)

All changes made via REST API. Audit entries logged to `subscription_changes`.

| Contact | ID | Change |
|---|---|---|
| Kelsy Flewitt | CT0164 | **Added** — newsletter_enabled=True, newsletter_status=subscribed, email_consent=True; contact_subscriptions rows added for newsletter + marketing_synergize; tag corrected from `TU/TH 6:15` → `TU/TH 7:30` |
| Scott Crawford (scott.synergize) | CT0032 | newsletter + contact_subscriptions.newsletter set to subscribed |
| Scott Crawford (scottcrawford1976) | CT0033 | contact_subscriptions.newsletter corrected from unsubscribed → subscribed |
| Lisa Arbo | CT0004 | **Unsubscribed** — email_consent and newsletter_enabled aligned to False; newsletter_status=unsubscribed |
| Robert Reid | CT0132 | **Unsubscribed** — same as above |

---

## 4. Current subscriber counts (post-changes)

| Status | Count |
|---|---|
| `newsletter_enabled=true`, `contact_status` in (active, previous_client) | **149** (send list) |
| `newsletter_status=unsubscribed` | 14 |
| `newsletter_status=cleaned` (bounced) | 2 |
| No newsletter status set | 0 |

---

## 5. No webapp schema changes required

No database migrations needed. All changes are data-only. No new columns, tables, or edge function deployments required as a result of this update.
