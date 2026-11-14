# Jordan (P4): Frontend (Defender Console, Attack Picker page, phone approvals)

**Branch:** `p4-web` · **Pair:** Miles · Read `docs/PLAN.md` first (sections 9, 10, 12, 13), and
`web/AGENTS.md` (new Next.js 16: check `web/node_modules/next/dist/docs/` before using unfamiliar APIs).

**Mission:** build what defenders and the audience see: the CrowdStrike-style Kairos Defender
Console, the public `/attack` page with the Attack Picker (the QR lands here, TOP PRIORITY), and the
`/approve` phone page. You make the demo look like a real product.

## You own (ONLY you edit these)
```text
web/  EVERYTHING except web/src/app/redteam/ (Miles's)
  package.json + package-lock.json   (only you add frontend packages)
  src/proxy.ts                       (/attack is public, the rest needs login)
  src/lib/                           (incl. types/kairos.ts: FROZEN mirror of api/schemas/kairos.py)
  src/components/
  src/app/console/                   (Defender Console incl. the audience view)
  src/app/attack/                    (public Attack Picker)
  src/app/approve/                   (phone approvals)
  src/app/login/ and every other page
```

## You call
- Ethan: `POST /attack`, `POST /agent/run`, `POST /analyst/ask`
- Miles: `POST /sensors/login`, `POST /playground/launch`
- Daylen: `GET /incidents`, `GET /incidents/{id}`, `POST /approvals/{id}/approve|deny`,
  `POST /killswitch`, `POST /agents/{id}/freeze`, `GET /stats`, `GET /audit/verify`,
  `POST/GET /appeals`
- Supabase Realtime: events, incidents, approvals, attempts, public_feed
- **Rule:** build every screen against the stub API / fake data first; the shapes are final.

## Build checklist (in order; each step has a test)
1. Check the site loads live on Vercel (Ethan sets it up); send Ethan the Vercel URL for CORS.
   *Test:* site loads on the public URL.
2. Branch `p4-web`. *Test:* pulls clean, runs locally (`npm ci`, never `npm install`).
3. Console shell (`web/src/app/console/`): Kairos branding, Cobalt theme, nav, global kill switch
   in the header (`POST /killswitch`), works at HALF width on 1080p, footer "Fictional demo
   environment. Not affiliated with or endorsed by Cisco." on every page.
   *Test:* looks right side by side with another window.
4. Live event stream via Supabase Realtime, fake-data fallback. *Test:* a new event appears without refreshing.
5. Login page: timing signals only (never what people type) to `POST /sensors/login`, plus a notice
   of what's collected and that it's deleted after 24h. *Test:* Miles sees the signals arrive.
6. Incident queue: KPI strip from `GET /stats`; level badges (Low gray, Medium yellow, High orange,
   Critical red) + score; sorted by score; AI title; listener icons; status; source filter
   (scripted vs audience); top MITRE technique; appeals filter; toast when a new incident arrives.
   *Test:* the demo chain shows as "Critical 85" at the top.
7. Incident detail `/console/incidents/[id]`: AI summary + triage label, score breakdown (each
   event + "+15 per extra listener"), MITRE kill-chain strip (ATT&CK and ATLAS chips in different
   colors, linking to MITRE), actor -> target timeline, what each listener saw with reasons, raw
   evidence, "Awaiting Approval", Request Containment, Mark False Positive (reason required).
   *Test:* a judge could understand the attack from this screen alone.
8. `/approve` phone page: Realtime listener, loud sound + full-screen red alert (iPhones don't
   vibrate from web), Approve / Deny, keep screen awake. Approval text comes from the API as-is
   (code templates). *Test:* tapping Approve on a phone flips the console live.
9. TOP PRIORITY: `/attack` (public): "Join the Kairos Red Team" + live counter ("N attacks, 0
   breaches"), auto codename, Attack Picker cards with settings:
   - Password Guessing: speed slider (slow/medium/fast), number of accounts, sneaky mode toggle
   - Fake Boss Message: CEO/CFO/IT, amount, pressure (polite/urgent/threatening)
   - Trick the AI: write your own or pick a ready-made trick, where to hide it (direct, email,
     signature, forwarded message), goal (vault code or payroll); 500 char box; mission card;
     uses `POST /attack`
   - Full Attack: runs all three
   Launch -> `POST /playground/launch`; show log lines + outcome + response level (watched,
   slowed, challenged, blocked) + MITRE technique. Fast on phones, mobile-first, big tap targets.
   *Test:* every card launches and shows a result on a phone.
10. Trick the AI result: animated 5 layers (Injection scan, Intent check, Scope policy, Taint
    tracking, Leak protection), blocking layer turns red, plain-English reason, "You made it X of 5
    layers deep", MITRE technique, green for harmless, rate-limit countdown, honest offline state,
    Appeal button (`POST /appeals`), privacy footer, `aria-live`.
    *Test:* try 3 attacks and 1 harmless message.
11. Plain text everywhere: no markdown images, no auto-loaded images, links to unknown domains
    disabled. *Test:* a reply containing an image link does NOT load anything.
12. Audience view in the console (same folder): queue filtered to source = audience, big text for
    the projector. Optional campaign card ("23 attackers targeting finance_agent").
    *Test:* readable from the back of the room.
13. Audit page with Verify Integrity (`GET /audit/verify`). *Test:* shows "Chain verified".
14. Test every screen on the LIVE site, incl. a real phone approval flipping the live console, and
    the QR slide on an iPhone and an Android from across a room.

**Should-have:** AI analyst chat drawer (`POST /analyst/ask`) with clickable citations.

## Done means
- Every screen works on fake data AND real data.
- An approval tapped on a phone updates the console live.
- The audience can attack from their phones and see a clear, honest result.
