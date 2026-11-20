# Deployment guide (free tiers)

## 1. Supabase
1. Create a Supabase project on the free plan.
2. Open SQL Editor and run the migrations in order: `0001_initial_schema.sql`, `0002_event_moment_and_outcome.sql`, then `0003_team_event_association.sql`, `0004_public_match_sharing.sql`, `0005_live_player_time_tracking.sql`, `0006_public_live_match_access.sql`, `0007_live_player_display_names.sql`, `0008_public_live_twelfth_player.sql`, `0009_portela_senior_roster_and_match_selection.sql` and `0010_amportela_juniores_roster_and_fixed_analysed_team.sql`, `0011_live_match_home_away_flag.sql` and `0012_amportela_iniciados_and_callups.sql` and `0013_live_match_squad_up_to_twelve.sql` and `0014_delete_scheduled_live_match.sql` and `0015_amportela_infantis_sub13_roster.sql` and `0016_amportela_benjamins_traquinas_rosters.sql` e `0017_live_match_callup_limits_by_age_group.sql` e `0018_live_match_halftime_reports.sql` e `0019_import_finished_public_live_matches.sql` e `0020_repair_live_match_import.sql` e `0021_use_live_clock_status_for_archive.sql`.
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

Apply `0006_public_live_match_access.sql` after the existing migrations, then apply `0007_live_player_display_names.sql`, `0008_public_live_twelfth_player.sql` and `0009_portela_senior_roster_and_match_selection.sql`. This migration creates a separate public data model (`public_live_matches`, `public_live_players`, `public_live_clocks` and `public_live_player_stints`) and narrow security-definer RPCs. The public live area does not use Supabase Auth, project membership or user roles. Anyone can open `/jogo-ao-vivo`, create a fixture, start/pause/finish a clock and record player entries/exits. Anyone can also open a game's public view at `/jogo-ao-vivo/<id>`.

**Operational consequence:** this is intentionally open access. Any visitor can modify any match listed in this public area, including the clock and substitutions. Do not use it for private fixtures or where edit permissions must be restricted. The public RPCs do not expose the other SportAnalist project tables, team analysis, video events, user IDs or private project data. The roster stores player names only; no dates of birth or photographs are stored. The five-player limit is enforced by the database. Migration `0007_live_player_display_names.sql` adds concise default names (for example, Afonso Cidade and Daniel Ferreira) and per-match editable display labels; labels are saved through `set_public_live_player_name` and appear in the public match view too. The operational player area shows up to 15 player cards in three columns on mobile and six columns on wider screens; each entire green/orange card toggles court status. Migration `0008_public_live_twelfth_player.sql` adds an editable twelfth slot to the Sub-17 roster. Migration `0009_portela_senior_roster_and_match_selection.sql` adds the Portela senior roster and allows selection of up to 12 players when creating a fixture. Migration `0010_amportela_juniores_roster_and_fixed_analysed_team.sql` rebrands the Sub-17 squad for the AMPortela client, adds the 14-player Juniores Sub-19 squad, fixes AMPortela as the analysed team and exposes only the players selected for each public match. Migration `0011_live_match_home_away_flag.sql` adds a home/away flag to match creation so `home_team` and `away_team` correctly reflect whether AMPortela plays at home or away. Migration `0012_amportela_iniciados_and_callups.sql` adds the Iniciados Sub-15 squad. Migration `0013_live_match_squad_up_to_twelve.sql` changes the matchday selection to allow between one and twelve players, selected from the competition squad plus the immediately younger squad only: Juniores into Seniores, Juvenis into Juniores and Iniciados into Juvenis. It also restricts the available-matches list to fixtures whose clocks have not yet started; live and finished match records and their public URLs are retained. Migration `0014_delete_scheduled_live_match.sql` adds a delete action for scheduled fixtures only; the database rejects deletion after the clock has started or player stints have been recorded. Migration `0015_amportela_infantis_sub13_roster.sql` adds the 21-player Infantis Sub-13 squad and extends the call-up rule so Infantis players may be selected for Iniciados fixtures. Migration `0016_amportela_benjamins_traquinas_rosters.sql` adds the 26-player Benjamins Sub-11 roster (shared by `CD | SUB 11 FUTSAL` and `FOOTLOURES | FUTSAL | 2026 | SUB 11`) and the 9-player Traquinas roster for `ENCONTROS MINI FUTSAL - TRAQUINAS`. The call-up chain is extended so Benjamins may be selected for Infantis and Traquinas for either Benjamins competition. Migration `0017_live_match_callup_limits_by_age_group.sql` applies the maximum call-up sizes by age group: Seniores 14; Juniores, Juvenis, Iniciados and Infantis 12; Benjamins and Traquinas 15. Migration `0018_live_match_halftime_reports.sql` stores the single halftime boundary, updates the pause RPC to distinguish a normal pause from the interval and exposes the boundary in the public match data. The live interface confirms the start, pause and end actions, generates first-half, second-half and total player-time tables, creates PNG images and supports CSV export. Migration `0020_repair_live_match_import.sql` synchronises finished AMPortela public fixtures into the current project's match history. Those matches can be opened without a video, display the original live player-time data, and accept a YouTube URL later so event analysis can begin in the same match record.

The live match form is configured for the AMPortela client: AMPortela is always the analysed team, while the opponent and fixture details are entered for each match. The roster is selected by competition: Traquinas, Benjamins Sub-11 (two competition names share one squad), Infantis Sub-13, Iniciados Sub-15, Juvenis Sub-17, Juniores Sub-19 or Seniores Masculinos. A checkbox can reveal the immediately younger squad for eligible call-ups.
