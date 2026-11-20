# Architecture and permissions

## Data model
- `projects`: one analysed team per project.
- `project_members`: user-to-project membership and role.
- `teams`: canonical team records, unique by project and normalized team name.
- `matches`: opponent, analysed team and YouTube source.
- `event_types`: project-configurable bilingual event catalogue.
- `match_events`: timestamp, event type, court zone, phase, associated `team_id`, attacking/defending teams, author and direct YouTube timestamp URL.
- `squad_players`: project roster with FPF reference IDs and names; birth dates and photos are deliberately not stored.
- `live_match_clocks`: authoritative elapsed match clock with running/paused/finished state.
- `match_player_stints`: per-player on-court intervals measured against the match clock.
- `profiles`: user display name and preferred language.

## Roles
| Permission | admin | analyst | configurator | viewer |
| --- | --- | --- | --- | --- |
| Read matches/events | Yes | Yes | Yes | Yes |
| Create/edit matches | Yes | Yes | No | No |
| Register events | Yes | Yes | No | No |
| Configure event types | Yes | No | Yes | No |
| Manage project members | Yes | No | No | No |
| Delete own events | Yes | Yes | No | No |

Database Row Level Security is the enforcement boundary. UI role selection in demo mode is only a preview, not authentication or authorization.

## Collaboration
The Supabase Realtime publication streams inserts/deletes on `match_events`. All event writes retain the author id and server-side creation timestamp. Clients must not use service-role secrets.

## YouTube
The browser loads the official YouTube IFrame Player API. Event timestamps are captured in seconds and transformed into links using the `t=Ns` query parameter. Some videos disable embedding; those videos cannot play inside the app.

## First administrator
Create the first Supabase Auth user, then call `create_analysis_project('Nome do projeto', 'Nome da equipa')` from an authenticated session. The RPC assigns the caller the admin role in the new project. Invite additional users and assign roles through the `project_members` table using an administrative workflow.

## Current implementation boundary
The first commit contains a local-browser demo workspace plus the initial Supabase schema/client foundation. Cloud project selection, sign-in UI and match creation workflows must be completed before multi-user persistence can be considered production-ready.


## Event capture v2
The event capture screen places the YouTube player at full content width. Below it, event shortcuts are grouped by moment and each event/zone combination is a direct one-click action; there is no separate Register button. An optional free-text outcome is captured with the next event.

Default combination rules:
- Kick-ins (Lateral) and corners (Canto): left/right only.
- The corresponding opposition events (names ending in Contra): defensive moment; same zone restrictions.
- Free kicks and attacks: left/center/right.
- Kick-off (Saída de bola): center only.
- Goalkeeper net release (Saída de redes) and goal kick (Saída de baliza): left/center/right.
- Goal (Golo): left/center/right.
- All event types marked as opposition/counter are stored as defensive moment; all other defaults are stored as attacking moment.
- For defensive/counter events, the opponent is stored as attacking team and the analysed team as defending team.

Apply migration `supabase/migrations/0002_event_moment_and_outcome.sql` after the initial schema migration. It adds the `event_moment` enum and `outcome` column, backfills existing events, and seeds the three additional event types.


## Team history association
Each match event is stored against one canonical team in `match_events.team_id`:
- `moment = attack`: the associated team is the project's analysed team.
- `moment = defense`: the associated team is the match opponent.
- `attacking_team` and `defending_team` retain both sides for tactical context.
The `teams` table is scoped to a project and has a unique normalized name, so the same opponent across multiple matches reuses one team record. This supports later team-level match/event history and statistics.

Apply `supabase/migrations/0003_team_event_association.sql` after migrations `0001` and `0002`. It creates canonical team records, backfills old match events to their relevant team, applies RLS, and adds team-based indexes.


## Public match links

A match editor (`admin` or `analyst`) can create or revoke an unlisted public URL for one match. Share tokens are stored in `match_public_shares`, separate from `matches`, with no direct API privileges for `anon` or `authenticated`. The public client calls `get_public_match_analysis(token)`, a security-definer RPC which returns a restricted JSON projection for the matching token only: teams, YouTube URL and event timeline fields. It does not return project identifiers, users, authors, membership data or other matches.

Apply `supabase/migrations/0004_public_match_sharing.sql` after migrations `0001`, `0002` and `0003`. Editors use `create_match_share` and `revoke_match_share`; the read-only public page is `/share/[token]`.


## AI-assisted goal detection

The editor invokes Firebase AI Logic from the browser using the saved YouTube URL as a `fileData` input to `gemini-3.5-flash-lite`. Public and unlisted YouTube URLs are supported by the Gemini Developer API through Firebase AI Logic. Image frames and the audio track are analysed together. The application does not download or proxy the source video.

AI results are suggestions only. An editor confirms the scoring side and event details before the normal `match_events` insertion path is called. This preserves the existing invariant: `attack` belongs to the analysed team; `defense` belongs to the opponent. The editor provides the kit colours as prompt context. A candidate with an uncertain scoring side cannot be saved until the editor selects a team.

Firebase App Check is initialised with the reCAPTCHA Enterprise provider. See [ai-goal-detection.md](ai-goal-detection.md) for Firebase, App Check and Vercel configuration, free-tier data handling and known limitations.


## Live match time tracking

Live match tracking is implemented separately from the authenticated analysis schema by `0006_public_live_match_access.sql`. The public `/jogo-ao-vivo` page does not call Supabase Auth or check project roles. It calls security-definer RPCs (`list_public_live_matches`, `create_public_live_match`, `get_public_live_match`, `start_public_live_clock`, `pause_public_live_clock`, `set_public_live_player`, `finish_public_live_clock`) that are granted to `anon` and `authenticated`. The underlying `public_live_*` tables have RLS enabled and no direct table grants; the RPCs return only match metadata, player names, clock and player stint intervals.

This design intentionally gives every visitor read/write access to every match in the public live area. Visitors can create matches and modify clocks/substitutions, but the RPCs cannot access or modify the separate project analysis tables. The five-player limit is enforced while holding a row lock on the match clock. Player names are seeded globally; dates of birth, photographs, FPF IDs and user/project identifiers are not included in the public roster projection.
