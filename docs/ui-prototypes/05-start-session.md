# Start practice session — design draft

This document preserves the original design proposal and image-generation prompt. The session setup is now implemented at `/sessions/new`, with Account navigation and a Session logs placeholder at `/sessions`; active practice routes use `/practice/[sessionId]`. See README.md for current behavior. The proposal below describes the earlier design stage.

## Repository findings

- This is a clinical education simulator for learners, not a real-client scheduling portal (`AGENTS.md`).
- Login and successful email confirmation currently lead to `/practice` (`lib/auth/supabaseAuth.ts`, `app/auth/callback/route.ts`).
- The current client is Jacob, a 12-year-old adjusting to middle school (`lib/chat/persona.ts`). Older artwork and prototypes use Alex; use Jacob in new interface copy. Do not expose hidden persona instructions in the setup page.
- `ChatPanel` generates a session ID, stores it in per-user `sessionStorage`, and reuses it within the tab. Its New session action generates another ID (`components/chat/ChatPanel.tsx`).
- Loading a transcript with GET creates it when absent, including the opening client line (`app/api/transcripts/[sessionId]/route.ts`). Storage is one JSON file per session, with owner and persona IDs (`lib/chat/transcriptStore.ts`).
- End session currently calls sign-out (`components/session/SessionToolbar.tsx`). Authentication and practice-session completion need separate actions in the proposed flow.
- Current design tokens are cream `#F7F6F2`, sage `#88A294`, terracotta `#C97C63`, charcoal `#293C35`, Inter typography, and 8px panel corners (`tailwind.config.ts`).

## Recommended screen

Proposed flow: Log in → Session setup → Start practice session → Existing welcome room and activities → End session → Session setup.

Use a centered, approximately 560px white card on cream, with the existing 56px header. Header: Practice Room at left, Simulation at right, plus a separate Sign out action. Keep the setup page outside the active session shell: mounting the current shell also mounts chat and initiates transcript loading. Show cameras, chat, activity controls, and End session only after starting.

```text
Practice Room                                  Simulation   Sign out

                   Start a practice session
                   Practice interviewing with a virtual client.

                   ┌──────────────────────────────────────────┐
                   │ VIRTUAL CLIENT                           │
                   │ Jacob                                    │
                   │ Age 12 · Adjusting to middle school      │
                   │                                          │
                   │ Session name (optional)                  │
                   │ [ e.g., Rapport-building practice      ] │
                   │ Helps you find this transcript later.    │
                   │                                          │
                   │ Chat messages and supported activity     │
                   │ events are recorded in this session's    │
                   │ transcript.                              │
                   │                                          │
                   │ [         Start practice session       ] │
                   └──────────────────────────────────────────┘
```

Jacob is a fixed client summary, not a dropdown: the current code has one default persona. The name is optional and need not be unique. Keep timestamps and generated IDs out of the form. The button creates the session before navigating to the welcome room. Show “Starting session…” while pending; on failure preserve the input and show “Could not start your session. Please try again.” Do not enter the room until creation succeeds.

An alternate, future version can place a compact “Continue your session” card above the new-session card with Jacob, the saved session name, last activity time, and Resume. Only offer it after implementing an explicit session status and restoration of supported state. Current transcript listing alone cannot distinguish active from completed sessions, and restoring a transcript does not restore the whiteboard, chess game, or room state.

## Prompt for ChatGPT Images

Create one high-fidelity desktop UI mockup for a new page in the existing “Practice Room” virtual-client telehealth simulation app for social work students. This is the page after login and before entering the simulation. It is a learner practice-session setup screen.

Use a complete straight-on 1440 × 900 application screenshot, no device frame or presentation board. Match these actual app tokens exactly: cream #F7F6F2 background, white panels, charcoal #293C35 text and primary button, sage #88A294 accents, terracotta #C97C63 reserved for errors or destructive actions. Inter-style sans-serif typography, 8px panel corners, thin charcoal borders at low opacity, precise spacing, modest type sizes, and minimal shadows. The existing app has restrained, practical UI; avoid gradients, decorative leaves, marketing illustrations, medical branding, and compliance badges.

At the top, place a 56px cream header with a thin bottom border. Left: “Practice Room”. Right: muted “Simulation” and a separate understated “Sign out” action.

Center a roughly 560px content column below the header. Heading: “Start a practice session”. Subheading: “Practice interviewing with a virtual client.” Below it, one white bordered card with 32px padding.

Inside the card, show a small label “VIRTUAL CLIENT”, the name “Jacob”, and the description “Age 12 · Adjusting to middle school”. This is a fixed summary, not a client-selection dropdown. Separate this section from a single text field with a subtle divider. Field label: “Session name (optional)”. Placeholder: “e.g., Rapport-building practice”. Helper text: “Helps you find this transcript later.”

Below the field, place a subtle sage-tinted information area reading: “Chat messages and supported activity events are recorded in this session’s transcript.” End with a full-width charcoal button with cream text: “Start practice session”. Leave generous cream whitespace around the card.

Do not include cameras, chat, a live timer, the active-session bottom toolbar, activity navigation, client search, appointment scheduling, a transcription toggle, or a session-ID input. These controls do not belong on this setup screen. Make the result look like a realistic extension of the existing Next.js app, with readable typeset text.

Optional visual reference attachments: a screenshot of the current login page and `docs/ui-prototypes/01-practice-room-v2.png`. Use login for form styling and the prototype only for palette and typography; the live app has since changed some room artwork and labels.

## Session behavior for later implementation

1. Add a protected setup route outside the active practice layout (for example `/sessions/new`). Update login, signup with immediate authentication, and email-confirmation redirects. Extend middleware coverage and verify authentication in the new route.
2. Add an authenticated session-creation POST. The server assigns a UUID and authenticated owner ID, pins the current persona, stores the optional display name and start timestamp, and returns the session ID. Prevent duplicate creations on retries with an idempotency key and a database uniqueness constraint.
3. Let the session shell consume that explicit ID instead of letting chat silently create one. Keep the same ID across chat, feelings, whiteboard, and chess navigation; reloads must restore it through an explicit route or equivalent durable session reference. Unknown IDs should not create sessions through a transcript GET.
4. In the database, use the session UUID as the primary key; link ordered transcript entries to it. Keep names non-unique. Retain owner authorization on every read and update. A short display reference, if later added, must not replace the full primary key.
5. End session should set a completion timestamp/status and return to setup while keeping the learner signed in. Sign out remains separate. Route the existing chat New session action through setup with deliberate handling of an unfinished session.
6. Do not claim full activity replay or recovery: existing activity transcript events and accepted tool actions do not persist every local canvas or game state.
