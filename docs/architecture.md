# Architecture and permissions

## Data model
- `projects`: one analysed team per project.
- `project_members`: user-to-project membership and role.
- `teams`: canonical team records, unique by project and normalized team name.
- `matches`: opponent, analysed team and YouTube source.
- `event_types`: project-configurable bilingual event catalogue.
- `match_events`: timestamp, event type, court zone, phase, associated `team_id`, attacking/defending teams, author and direct YouTube timestamp URL.
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
