# Bench — Campus Resource Hub

A front-end demo of a campus resource-matching platform: plain-language
requests get parsed into structured intent, matched against a mock
registry of equipment/spaces/people, routed through booking + approval,
and confirmed with a scannable QR code. Includes a HackNorth hackathon
registration flow that auto-generates the permissions a team's plan
requires, plus a faculty-facing camera QR scanner.

## Run it

1. Unzip this folder.
2. Open the folder in VS Code.
3. Install the **Live Server** extension (Ritwick Dey) if you don't have it.
4. Right-click `index.html` → **Open with Live Server**.

That's it — no build step, no npm install. It's plain HTML/CSS/JS.

The QR generation (`qrcode` library) and camera scanning (`html5-qrcode`
library) load from a CDN, so you'll need an internet connection the
first time each loads. Camera access works on `localhost`, which is
exactly what Live Server serves on.

## Where everything lives

- `index.html` — page structure and all views (Request, Discover,
  Find a person, My requests, Approvals, Hackathon, Scan & verify,
  Guided demo).
- `css/styles.css` — all styling. One dark instrument-panel theme;
  no CSS framework.
- `js/data.js` — the mock resource/people registry and campus
  distance table. Edit this to add your own equipment, rooms, or
  mentors.
- `js/app.js` — everything else: the intent parser, the matching +
  ranking engine, booking flow, owner approvals, notifications,
  hackathon permission rules, QR generation, and the QR scanner.

## Try it in this order

1. **Request** — type something like *"I need an oscilloscope
   tomorrow morning"* or tap one of the example chips.
2. **Discover** — see it parsed and ranked; toggle the availability
   and distance filters.
3. Click **Request** on a card, pick a slot, and send it.
4. **Approvals** — approve, deny, or suggest an alternative for that
   request (this stands in for the faculty/owner view).
5. **My requests** — watch the status update live, and open the QR
   code for the approved booking.
6. **Hackathon** — register a team, tick a few on-site needs, and see
   the exact permissions Bench works out you'll need, plus a
   registration QR.
7. **Scan & verify** — scan either QR code with your camera (or paste
   its ID manually) to see the faculty-side check.
8. **Guided demo** — plays the entire oscilloscope example
   automatically, end to end.

All requests, approvals, and registrations are kept in your browser's
`localStorage`, so they'll still be there if you refresh. Clear your
browser storage for this page to reset the demo.

## Swapping in real data

Everything in `js/data.js` is a stand-in for a real backend. To wire
this up to something real, replace `RESOURCE_REGISTRY` and
`PEOPLE_REGISTRY` with API calls, and swap the `localStorage` calls in
`js/app.js` (`loadState` / `saveState`) for real requests to your
booking and notifications service.
