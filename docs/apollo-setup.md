# Apollo setup (prospecting view)

n8n talks to Apollo through an **adapter** (LXG-01). Two modes, chosen by `LEAD_SOURCE_MODE` in `.env`:

| Mode | When | How |
|---|---|---|
| `csv` (default) | Any Apollo plan; simplest; good for the first weeks | Build a search in Apollo, **export contacts to CSV**, put the file in `./import/`, run (or wait for) LXG-01. Re-importing the same file is harmless (already-seen rows are skipped). |
| `apollo_api` | Plan with API access | LXG-01 calls Apollo's API on a schedule. |

## API mode — what the workflow calls (per Apollo's public docs, checked during development)

1. `POST https://api.apollo.io/api/v1/mixed_people/api_search` — People API Search. Header `x-api-key`. **Uses no credits** but
   **returns no email addresses**. Parameters used: `person_titles`, `person_locations`, `q_organization_keyword_tags`,
   `organization_num_employees_ranges`, `page`, `per_page` (≤100).
2. `POST https://api.apollo.io/api/v1/people/bulk_match` — enrichment, up to 10 people per call, returns `email`, `email_status`,
   `organization`. **Costs credits** (≈1 credit per revealed email). The workflow only enriches people not already on the Intake tab,
   and never more than `APOLLO_MAX_PER_RUN` per run, to protect credits.

### Known limitations / things to verify on the client's plan
* API access and which endpoints are allowed depend on the Apollo plan and on the **type of API key**. In Apollo: Settings → Integrations → API → create a key and enable the endpoints above (a master key works for all). If a call returns 401/403/422, the plan/key lacks access → use **CSV mode**; nothing else changes.
* `q_organization_keyword_tags` is documented for Apollo's organization search; it was **not confirmed** for the people search page during development. If Apollo ignores/rejects it, remove it from *LXG-01 → Config* and rely on `person_titles` + `person_locations` + the Qualification step (or use CSV).
* Rate limits are plan-dependent; enrichment batches are spaced 1.5 s apart.
* Apollo's data (titles, industries, keywords) is imperfect — that is why LXG-02 re-checks title and business type.
* Nothing in this repo calls undocumented endpoints. The live API calls have **not** been executed during development (no credentials were supplied) — run LXG-01 manually in `apollo_api` mode once and check the execution output before scheduling it.

## Recommended Apollo search (CSV mode or to mirror in Config)

* **Location:** United Kingdom. **Employees:** 1–200.
* **Job titles:** Owner, Founder, Co-founder, Director, Managing Director, Buyer, Head of Buying, Purchasing Manager, Retail Buyer, General Manager.
* **Keywords / industries:** golf, pro shop, country club, private members club, equestrian, motorsport, boutique fitness, gym,
  gift shop, hotel, yacht club, sailing, sporting goods, menswear, lifestyle boutique.
* **Email status:** Verified only.
* Exclude companies: supermarkets, discount/budget, fast fashion, mass-market chains (the qualifier also blocks these by name/keyword).

## CSV columns understood (case/space-insensitive)

First Name, Last Name, Title, Company (or Company Name), Email, Email Status, Industry, Keywords, Website, City, Country (or
Company Country), # Employees, Apollo Contact Id. Other columns are ignored. `import/sample-sandbox-export.csv` is a fake-data example.

## Changing targeting later

* API search: *LXG - 01 → Config*. Acceptance rules: *LXG - 02 → Qualify & Dedupe* (CONFIG block) + `.env` (`ALLOWED_COUNTRIES`, `ALLOWED_EMAIL_STATUS`).
* New regions: see ARCHITECTURE.md → Expansion.
