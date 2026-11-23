# SCP LIFE — brief shared by every studio agent (read first)

Game: SCP LIFE, a first-person psychological-horror life simulation in an SCP containment site. Browser game (Three.js r128),
also shipped as an Android WebView APK (android/) and as a claude.ai artifact. All in-game text is Russian.

Where things are (Web/js):
- core.js — math (V), Room, Door, Facility, NavAgent, Npc, EventLog, Memory, events (EV)
- professions.js — professions, departments, duties, work rooms; people.js — population, schedules, shifts, hiring
- map.js — facility layout: level 3 (sectors A/B/C + south gallery), level 4 (technical, D-2, D-3, wing T-2, isolators С-4), level −9
- jobs.js — step-based duty jobs shared by NPCs and the player: K(kind, { build, tickStep, stepDone, done })
- scplife.js — SCP LIFE administration: task assignment, cases/investigations, decisions log, research requests, staffing, stories
- brain.js — NPC decisions (decide/think/act), needs, conversations; world.js — main loop, crowd navigation, doors, saves
- anomalies.js, cognitive.js, tallyman.js, living.js — SCP objects and their behaviour; ai/llm.js, ai/profiles.js, ai/minds.js — LLM gateway, SCP minds, AI OVERSEER
- medical.js — injuries, death, bodies, morgue, staff replacement, incident reports; arms.js — weapons, rules of engagement, security response, MTF
- director.js — Task Director: every task's initiator, reason, place, profession, access, priority, tools, participants, complications, success/failure conditions, consequences, log
- infra.js — power, faults, repairs; horror.js — horror director; content.js — world creation, cameras, player setup
- browser side: render.js, humans.js (skinned staff), creatures.js, armsview.js, audio.js, game.js (UI, input, HUD, terminal, PDA)

Tests (run from repo root): node Web/tests/sim-test.js (3 days of life, ~6 min) · ai-test.js · nav-test.js · med-test.js · arms-test.js ·
node Web/tests/browser-smoke.js <outDir> (Playwright, Chromium preinstalled; env ROOMS, DEATH, WEAPON).

Rules that always apply:
- Do not rebuild the game or remove working systems. Extend the existing modules.
- The simulation is deterministic: use w.rng, never Math.random, inside Web/js sim modules.
- NPCs move physically through the navigation system; never teleport people to "complete" something.
- A mechanic is real only if it changes the world state and can be observed/tested; no "task done" text stubs.
- The local simulation must work without any language model; LLM output is data, always validated against real mechanics.
- Licensed assets only (CC0 / CC BY with credit in Docs/ASSETS.md and the in-game credits). No API keys in client code or the APK.
- Mobile performance matters (Android WebView): no per-frame allocations in hot paths, bounded loops, LOD.
- Studio agents do not commit or push. Each agent edits only the files its task names; the lead (main Claude) integrates.
- Write reports in Russian or English, but cite real sources and mark: ФАКТ (verified), МНЕНИЕ ИГРОКОВ (user opinion), ПРЕДПОЛОЖЕНИЕ (own inference).
