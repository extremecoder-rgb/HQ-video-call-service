# PRD: Minimalist Web Video Calling App
**Version:** 1.0
**Timeline:** 10 days (solo build)
**Architecture base:** LiveKit (self-hosted, open source SFU)

---

## 1. Goal

Build a minimal web app where multiple people can join a room and have a smooth, low-latency video call — comparable to WhatsApp/Meet call quality — without a paid third-party API. Optimize for **shipping in 10 days**, not feature completeness.

## 2. Why this architecture

| Requirement | Choice | Reason |
|---|---|---|
| Media routing | **SFU** (not mesh, not MCU) | Scales past 3-4 people, low server CPU (no transcoding), industry standard (Meet/Teams/Zoom all use this) |
| SFU implementation | **LiveKit (self-hosted)** | Open source, production-grade congestion control + simulcast already solved, you don't rebuild RTP/DTLS/SRTP internals in 10 days |
| Signaling | Built into LiveKit server | No need to hand-roll WebSocket signaling separately |
| Audio priority | Opus codec (LiveKit default) + audio-first bitrate allocation | This is *why WhatsApp feels smooth* — audio degrades last, video degrades first under bad network |
| Adaptive quality | Simulcast (LiveKit default) | Each viewer gets the best resolution their bandwidth supports, without you writing bitrate logic |

**Explicitly out of scope for v1:** building a custom SFU from scratch. That's a multi-month systems project — wrong tool for a 10-day timeline. Revisit only after v1 ships and you understand your real usage patterns.

## 3. Core Features (v1 — what actually ships in 10 days)

1. Create a room (auto-generated room link, e.g. `/room/abc123`)
2. Join a room via link — enter name, no login/signup required for v1
3. Camera + mic on/off toggle
4. Grid view of all participants (auto-adjusts layout by participant count)
5. Screen share (LiveKit supports this natively — low extra effort)
6. Leave call
7. Basic connection quality indicator (LiveKit exposes this from its SDK)

## 4. Explicitly NOT in v1 (cut to hit 10 days)

- Chat during call
- Recording
- Authentication / user accounts
- Meeting scheduling
- Live captions / AI features
- Mobile app (web-only, responsive)
- Waiting room / host controls / kick participant

*(These are natural v2 additions once the core call quality is proven — LiveKit supports Egress for recording and has room for chat via data channels later.)*

## 5. Tech Stack

**Frontend**
- Next.js + React
- `@livekit/components-react` + `livekit-client` (official SDKs — don't hand-roll RTCPeerConnection logic)
- Tailwind for styling (fast to build minimal UI)

**Backend**
- Node.js (thin layer) — only job is to generate LiveKit access tokens per user/room and serve the room API
- LiveKit server (self-hosted, Go binary or Docker) — does all the actual media SFU work

**Infrastructure**
- 1 VPS to start (Hetzner or Hostinger KVM, 4 vCPU/8GB range) running LiveKit server via Docker
- coturn (TURN server) — self-hosted, needed for users behind strict NATs
- Redis — only needed if you scale to multiple LiveKit nodes later; **skip for v1**, single node is fine

## 6. Architecture Diagram

```
┌─────────────┐        HTTPS/WSS        ┌──────────────────┐
│  Next.js App │ ──────────────────────▶ │  Node.js API      │
│  (browser)   │◀────token────────────── │  (token generator) │
└──────┬───────┘                          └──────────┬────────┘
       │                                              │
       │ WebRTC media (UDP)                    admin API
       ▼                                              ▼
┌─────────────────────────────────────────────────────┐
│              LiveKit Server (self-hosted)             │
│         [SFU: routes audio/video between users]        │
└──────────────────────┬────────────────────────────────┘
                        │
                        ▼
                  coturn (TURN, for
                  NAT traversal fallback)
```

## 7. 10-Day Build Plan (local-first, deploy late)

Build and test everything **free, on your own laptop** first. Only pay for a VPS once the app already works — this avoids burning server cost/time during the messiest early debugging days.

| Day | Task | Environment |
|---|---|---|
| 1 | Run `livekit-server --dev` locally (Docker or brew). Scaffold Next.js app, install LiveKit React SDK. Confirm two browser tabs on `localhost` can see/hear each other. | Local |
| 2 | Build Node.js token-generation API (LiveKit JWT tokens per room/user), using the `--dev` mode's built-in test API key/secret. | Local |
| 3 | Build "create room" + "join room" flow (generate room ID, form to enter name). | Local |
| 4 | Build grid layout UI for participant video tiles (auto-adjust for 2, 4, 8+ people). | Local |
| 5 | Add camera/mic toggle buttons, leave-call button. | Local |
| 6 | Add screen share button (LiveKit SDK has this built-in — mostly UI work). | Local |
| 7 | Add connection quality indicator + basic error states (camera denied, disconnected, reconnecting). Test with 4-6 tabs across Chrome/Firefox/Safari. | Local |
| 8 | Provision VPS, deploy LiveKit server + coturn via Docker Compose. Set up domain + HTTPS (mandatory — WebRTC needs a secure context). Point frontend at the real server. | VPS |
| 9 | Real cross-network testing — get 2-3 friends on different networks/devices to join a call. Throttle network in devtools to simulate bad connections. Fix bugs found. | VPS |
| 10 | Final polish, monitor bandwidth usage from day one of real traffic, smoke test end-to-end, ship. | VPS |

**Optional shortcut for Days 1-7:** if you want to test with someone outside your laptop *before* Day 8, tunnel your local server temporarily with `ngrok` or `Tailscale` instead of deploying early — still free, still no VPS cost yet.

## 8. Non-Functional Requirements

- **HTTPS mandatory** — browsers block camera/mic access and WebRTC on non-secure origins.
- **Latency target:** under 200ms for same-region calls (achievable out of the box with LiveKit + TURN configured correctly).
- **Concurrent capacity for v1:** design for ~20-30 concurrent participants total across all rooms on one VPS — enough to validate the product before investing in multi-node scaling.
- **Browser support:** Chrome, Firefox, Safari, Edge (all have solid WebRTC support currently).

## 9. Ownership Note (why this isn't "using a third-party API")

`livekit-server` is **not** a hosted API call — it's an Apache 2.0 open-source Go program you deploy and run on your own VPS. All media traffic flows through your own server only; LiveKit Inc.'s cloud is never touched. This is the same relationship you have with Postgres or Redis — open-source software you self-host and control, not a third-party dependency you pay per-use.

- If you later need to customize internals (e.g. congestion control, simulcast layer selection, custom AI hooks in the media path), you can fork the Go source directly — it's fully yours to modify.
- For v1, running it via Docker (rather than a hand-copied fork) is recommended: you get free security/bug-fix updates from upstream, with zero loss of ownership.

## 10. Capacity Expectations

- **Per room:** LiveKit comfortably supports up to ~100-150 participants technically; for a genuinely usable interactive grid call, target **under 20-30 people per room** in v1.
- **Total concurrent capacity on one v1 VPS (4 vCPU / 8GB):** roughly **20-30 concurrent participants** across all active rooms before you need to watch bandwidth/scale up. Bandwidth (not CPU) will be the real ceiling — monitor your VPS provider's monthly cap from day one of real traffic.
- Scaling beyond this is a config change later (multi-node LiveKit + Redis), not a rewrite.

## 11. Risks / Watch-outs

- **TURN server is not optional** — skipping it means some % of real users (behind strict corporate/mobile NATs) simply can't connect. Budget time for it on Day 8, don't skip it under deadline pressure.
- **Bandwidth costs** — video calling is bandwidth-heavy; check your VPS provider's bandwidth cap/overage pricing before real usage (this was flagged for Hostinger specifically — confirm the cap fits your expected usage).
- **Don't build your own SFU during this cycle** — biggest scope-creep risk for a 10-day timeline. LiveKit's Go source is available to read/fork later if you need deep customization.

## 12. Post-v1 Roadmap (not now, just so it's not forgotten)

- Recording via LiveKit Egress
- In-call chat (LiveKit data channels)
- Auth + persistent rooms
- Multi-region LiveKit deployment + Redis for coordination
- AI features (live captions via STT, meeting summaries) — kept as a separate service off the media path