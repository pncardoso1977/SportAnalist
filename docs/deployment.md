# Deployment guide (free tiers)

## 1. Supabase
1. Create a Supabase project on the free plan.
2. Open SQL Editor and run the migrations in order: `0001_initial_schema.sql`, `0002_event_moment_and_outcome.sql`, then `0003_team_event_association.sql` and `0004_public_match_sharing.sql`.
3. In Authentication settings, configure the allowed site URL and email confirmation policy.
4. Copy the Project URL and publishable key. Do not expose a service-role key in browser code.

## 2. Vercel
1. Import `pncardoso1977/SportAnalist` into Vercel using the GitHub integration.
2. Keep the framework preset as Next.js.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to Production, Preview and Development environments.
4. Deploy the `main` branch.
5. Add the Vercel domain to Supabase Auth redirect/site URL settings.

Once Git integration is configured, pushes to `main` trigger automatic deployments. Pull requests can be configured for preview deployments.

## 3. First administrator and team
1. Open the deployed application and create the first user account.
2. Confirm the email if confirmation is enabled.
3. Sign in and create the analysis project. The first project creator receives the `admin` role.
4. Add additional users to `project_members` from Supabase Table Editor or SQL, assigning `analyst`, `configurator` or `viewer`.

## 4. Firebase AI Logic (YouTube goal detection)

Follow [ai-goal-detection.md](ai-goal-detection.md) to register a Firebase Web app, enable Firebase AI Logic with the Gemini Developer API, configure App Check with reCAPTCHA v3 and add the four `NEXT_PUBLIC_FIREBASE_*` variables to Vercel. Do not place a Gemini standalone API key, service-account credential or reCAPTCHA secret in the frontend. The AI feature remains disabled until these variables are present.

## 5. Free-tier constraints
Free tiers have resource, bandwidth, build and database limits. Availability, suspension/pausing rules, and quotas are controlled by the providers and may change. Check the current provider limits before using this for a competition or production season.

## Public match sharing

Editors with the `admin` or `analyst` role can create a separate public link for an active match. The link opens `/share/<token>` and exposes only that match's teams, YouTube source and event timeline. It does not provide edit access or project-wide access. The editor can revoke the link at any time; revocation deletes the token and immediately makes the URL unusable.

Migration `0004_public_match_sharing.sql` creates a private token table and narrowly scoped RPC functions. Do not add anonymous SELECT policies to `matches`, `match_events` or `match_public_shares`; the public page reads through the sanitized `get_public_match_analysis` function only.

## 6. Operational safety
- Enable database backups/export before a competition.
- Keep the repository public only if the code is intended to be public.
- Never commit `.env.local`, access tokens, passwords or the Supabase service-role key.
- Use RLS; frontend role choices are not a security boundary.
