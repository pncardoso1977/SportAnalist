# Architecture and permissions

## Data model
- `projects`: one analysed team per project.
- `project_members`: user-to-project membership and role.
- `matches`: opponent, analysed team and YouTube source.
- `event_types`: project-configurable bilingual event catalogue.
- `match_events`: timestamp, event type, court zone, attacking/defending team, author and direct YouTube timestamp URL.
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
