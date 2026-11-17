# Virtual Client Telehealth Simulation Platform

**CS 4273 Capstone Design Project, Fall 2026 · Group L**

A prototype for social work students and early-career therapists to practice interviewing a virtual client and use interactive activities inside a simulated telehealth room.

## Run locally

Use Node.js 22 or newer and npm:

```bash
npm ci
cp .env.example .env.local
# Configure Supabase as described below, then:
npm run dev
```

Open [localhost:3000](http://localhost:3000). The app opens `/login`; signing in opens `/sessions/new` to start a practice session.

Development output lives in `.next-dev`; production builds use `.next`. This keeps `npm run build` from overwriting chunks used by a running development server. If a browser was open during a server restart, reload the page to load the current chunks.

## Supabase setup

1. Create a project at [Supabase](https://supabase.com/dashboard). Keep its database password private; this app does not need it for authentication.
2. In the project's **Connect** dialog, copy the project URL and **publishable** key into `.env.local`:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

3. In **Authentication → Providers**, enable email/password and allow new user signups. Keep **Confirm email** enabled for real users.
4. In **Authentication → URL Configuration**, use `http://localhost:3000` as the local Site URL and add `http://localhost:3000/auth/callback` to the allowed Redirect URLs. Add the equivalent callback URL for each deployed environment. Keep the default confirmation email template using `{{ .ConfirmationURL }}`; it confirms the email with Supabase before returning a PKCE code to the app.
5. Visit `/login` and click **Create account**, or open `/signup`. Use a real email address and a password with at least eight characters. Confirm the email in the same browser where you signed up; the callback signs you in and opens `/sessions/new`. If confirmation is disabled in Supabase, signup signs in immediately. For a dummy test account, **Authentication → Users → Add user** with email auto-confirm remains available. Password recovery is not yet implemented.
6. Restart `npm run dev`, visit `/login`, and log in with that account. Invalid passwords must fail; visiting `/practice` while logged out redirects to login. Logged-out API requests return 401, and users can only list/read/update their own transcripts.

7. Add the same two environment variables to your deployment and rebuild. Set the Supabase Auth Site URL to your deployment URL and allow its `/auth/callback` redirect URL.

### Practice sessions and account

After login, optionally name your session and choose **Start practice session**. The app opens a distinct `/practice/<sessionId>` URL and keeps the same conversation while you move between activities.

The **Account** menu provides **Session logs** (a “Coming soon” placeholder) and **Sign out**. The toolbar's **End session** returns to setup while keeping you signed in. Saved history and transcript downloads are deferred until database persistence is implemented.

On Vercel, sessions automatically use browser mode: the active conversation stays in `sessionStorage` for the current tab, including across refreshes. No transcript files or database tables are required. Closing the tab clears that temporary conversation; opening a session URL in another tab does not restore it. Activity canvases and game state are still local to their components.

Local development retains the existing JSON-file store in `data/transcripts` (or `TRANSCRIPT_DIR`) for development and API tests. Set `PRACTICE_STORAGE=browser` locally to test the hosted behavior. `PRACTICE_STORAGE=file` explicitly selects file mode and requires a writable persistent directory. Browser snapshots are temporary conversation context, not authoritative research or grading records.

The integration uses cookie-based browser/server clients and Next.js 15 middleware for session refresh. Missing configuration blocks access. No secret or service-role key is required. Supabase's built-in email service has recipient restrictions and rate limits; configure [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) before offering signup beyond test users. See [Supabase's SSR guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

### Database later

Use `createClient` from `lib/supabase/client.ts` in browser components or `lib/supabase/server.ts` in server code for future Postgres queries. Before storing data, create versioned SQL migrations, enable Row Level Security on every exposed table, and write policies that compare `auth.uid()` with an `owner_id` referencing `auth.users(id)`. Generate database TypeScript types after the schema exists. Do not use editable user metadata to grant instructor/admin permissions.

Database-backed session logs remain future work. Local file-mode transcripts record the authenticated user's ID; older ownerless logs remain inaccessible through the API. Browser-mode conversations are not uploaded to a database or saved as session logs. Future persistence must restore server-authoritative history before adding grading or audit features.

## Current features

- **Room:** Click the illustrated whiteboard, feelings chart, or chessboard to open an activity. Drag the objects to rearrange them; arrow keys move a focused object.
- **Whiteboard:** Draw, erase, move objects, write text, and create shapes with labeled tools, ink colors, line sizes, undo, and redo. Excalidraw loads only in the browser.
- **Feelings:** Select one of twelve feelings or draw over the board. Drawings have ink colors, undo, and clear controls.
- **Chess:** Two players on the same device can click or drag pieces to legal destinations. Includes promotion, game-over detection, move history, undo, and reset.
- **Chat:** Talk to Jacob using an offline mock or a configured Anthropic/OpenAI provider. Hosted conversations stay in the current browser tab; local file mode retains ordered transcripts for development. Saved logs and transcript downloads are coming later.

Feelings drawings, whiteboard scenes, and chess games are local activity state and reset when leaving their routes. Room positions persist while the shared session shell stays mounted. Settings, snapshot, and remote client control are prototype UI placeholders. End session returns to setup; sign-out is available in Account.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Application regression tests use Node's test runner with `tsx`. They create isolated temporary transcripts and mock provider requests, so they never call paid providers or modify saved practice sessions. The first production build needs network access for the existing Google Fonts setup.

The original Python, JavaScript, and TypeScript exercises remain under `unit-tests/`. With Python 3 installed, run:

```bash
npm ci --prefix unit-tests/typescript
npm run test:exercises
```

## Stack and layout

Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, Excalidraw, and chess.js.

| Directory | Purpose |
|---|---|
| `app/` | Pages, layouts, and chat/transcript API routes |
| `components/activities/` | Room, feelings, whiteboard, and chess UI |
| `components/session/` | Shared header, participants, and toolbar |
| `components/chat/` | Chat interface |
| `lib/chat/` | Persona, provider requests, validation, and file-backed transcripts |
| `tests/` | Application regression tests |
| `unit-tests/` | Original cross-stack exercises |
| `public/` | Participant avatars and room artwork |
| `docs/` | API details, architecture, artwork provenance, and original UI references |

## Chat setup and limits

Copy `.env.example` to `.env.local` and configure a provider key if needed. With no key, chat uses deterministic canned replies. See [the chat API documentation](docs/chat-api.md) for configuration, endpoints, and transcript details.

The current chat uses a placeholder persona and unconstrained LLM replies, not the planned deterministic dialogue tree. Practice pages and APIs require Supabase login, and transcript access is limited to the owning user. File storage is intended for a local prototype; it does not persist on serverless hosts. Locks serialize requests only within one server process.

## Planned work

- Research-approved scenarios and a deterministic dialogue tree.
- Persistent transcript storage in Supabase Postgres.
- Ordered activity logs and replay, separate from the canvas renderer.
- Remote collaboration and rubric-based feedback.
