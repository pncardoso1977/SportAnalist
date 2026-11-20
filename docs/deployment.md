# Deployment guide (free tiers)

## 1. Supabase
1. Create a Supabase project on the free plan.
2. Open SQL Editor and run the migrations in order: `0001_initial_schema.sql`, `0002_event_moment_and_outcome.sql`, then `0003_team_event_association.sql`, `0004_public_match_sharing.sql` and `0005_live_player_time_tracking.sql`.
3. In Authentication settings, configure the allowed site URL and email confirmation policy.
4. Copy the Project URL and publishable key. Do not expose a service-role key in browser code.

## 2. Vercel
1. Import `pncardoso1977/SportAnalist` into Vercel using the GitHub integration.
2. Keep the framework preset as Next.js and set **Node.js Version** to `24.x` (the repository also pins this in `package.json` and `.nvmrc`).
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to Production, Preview and Development environments.
4. Add the Firebase AI variables listed in [ai-goal-detection.md](ai-goal-detection.md) if enabling AI goal detection.
5. Deploy the `main` branch.
6. Add the Vercel domain to Supabase Auth redirect/site URL settings.

Once Git integration is configured, pushes to `main` trigger automatic deployments. Pull requests can be configured for preview deployments.

## 3. First administrator and team
1. Open the deployed application and create the first user account.
2. Confirm the email if confirmation is enabled.
3. Sign in and create the analysis project. The first project creator receives the `admin` role.
4. Add additional users to `project_members` from Supabase Table Editor or SQL, assigning `analyst`, `configurator` or `viewer`.

## 4. Firebase AI Logic (YouTube goal detection)

Follow [ai-goal-detection.md](ai-goal-detection.md) to register a Firebase Web app, enable Firebase AI Logic with the Gemini Developer API, configure App Check with reCAPTCHA Enterprise and add the four `NEXT_PUBLIC_FIREBASE_*` variables to Vercel. Do not place a Gemini standalone API key, service-account credential or reCAPTCHA secret in the frontend. The AI feature remains disabled until these variables are present.

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


## Public live match and player time tracking

Apply `0006_public_live_match_access.sql` after the existing migrations, then apply `0007_live_player_display_names.sql`. This migration creates a separate public data model (`public_live_matches`, `public_live_players`, `public_live_clocks` and `public_live_player_stints`) and narrow security-definer RPCs. The public live area does not use Supabase Auth, project membership or user roles. Anyone can open `/jogo-ao-vivo`, create a fixture, start/pause/finish a clock and record player entries/exits. Anyone can also open a game's public view at `/jogo-ao-vivo/<id>`.

**Operational consequence:** this is intentionally open access. Any visitor can modify any match listed in this public area, including the clock and substitutions. Do not use it for private fixtures or where edit permissions must be restricted. The public RPCs do not expose the other SportAnalist project tables, team analysis, video events, user IDs or private project data. The roster stores player names only; no dates of birth or photographs are stored. The five-player limit is enforced by the database. Migration `0007_live_player_display_names.sql` adds concise default names (for example, Afonso Cidade and Daniel Ferreira) and per-match editable display labels; labels are saved through `set_public_live_player_name` and appear in the public match view too. The active mobile operator view uses a compact three-column player grid, short controls and a viewport-height layout to minimise scrolling.

The first form defaults to the supplied fixture: `CD II DIVISÃO | SUB 17 FUTSAL`, Associação Marista vs Portela, Jornada 7, 21 November 2026 at 17:00, Pavilhão Externato Marista Lisboa. Confirm the fixture details before creating the match.
