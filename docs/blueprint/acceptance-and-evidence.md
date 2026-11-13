PART 13 — SEVEN OWNER SWITCHES

The seven switches are mandatory backend-enforced permissions.

Switch	OFF behaviour
Master	Everything except health and login denied
Microphone	No audio capture
Camera	No video capture
Autonomy	Direct requests only
Remote Compute	No remote workers
Computer Control	No computer or tool actions
Embodiment	JARVIS has no body in the world

Microphone and Camera must default OFF on every new session and restart.

No frontend-only enforcement.

Every switch must have:

* Backend enforcement.
* Automated tests.
* Audit log entries.
* Persistent configuration where appropriate.
* Correct restart behaviour.

Never bypass the switches.

PART 14 — SECURITY AND RELIABILITY

Audit every API route and WebSocket.

Implement or verify:

* Owner authentication.
* Route authorisation.
* Secure token handling.
* Explicit CORS.
* Rate limiting.
* Audit logs.
* Worker authentication.
* Tool allowlists.
* Approval tokens.
* Session expiry.
* Backup.
* Restore.
* Permission enforcement.
* Input validation.
* Error handling.
* Secret management.

Only approved health endpoints should be public.

Never print secrets in logs.

Never request credentials unnecessarily.

Use authorised environment variables and secret-management facilities.

Do not hardcode credentials.

A backup must be restored and verified on a separate copy.

PART 15 — PERFORMANCE AND OPTIMISATION

Default vertical-slice targets:

Metric	Target
Resolution	1080p
Average FPS	60
Minimum FPS	30
Simulation tick	Under 16 ms
Save time	Under 5 seconds
Load time	Under 30 seconds

These are targets to measure, not results to claim.

Measure:

* CPU.
* RAM.
* GPU.
* VRAM.
* FPS.
* 1% low FPS.
* Simulation tick.
* Agent processing time.
* Network latency.
* Save time.
* Load time.

Use:

* LOD.
* Instancing.
* World Partition.
* Streaming.
* Culling.
* Mass-compatible distant population.
* Efficient simulation updates.
* Appropriate tick rates.
* Asset optimisation.

Do not simulate every distant inhabitant at full fidelity.

Do not sacrifice simulation correctness to achieve performance.

PART 17 — VISUAL EVIDENCE AND DELIVERABLES

Required captures must come from the actual running build.

No internet images.

No fabricated renders.

No static mockups presented as functioning software.

Evidence requirements:

1. World map.
2. Regional map.
3. Capital overview.
4. Industrial city overview.
5. Technology city overview.
6. Coastal port overview.
7. Residential street.
8. Commercial street.
9. House interior.
10. Shop interior.
11. School or university.
12. Hospital or public facility.
13. People performing activities.
14. Animal activity.
15. Traffic.
16. JARVIS in the world.
17. Day and night.
18. Weather variation.
19. Laboratory experiment.

Items beyond the implemented slice must be labelled NOT STARTED until their relevant phases begin.

PART 20 — REQUIRED PHASE REPORT

At the end of every phase, deliver a report containing:

1. Files created.
2. Files modified.
3. Repositories integrated.
4. Commands executed.
5. Tests passed.
6. Tests failed.
7. Test counts.
8. Runtime evidence.
9. Screenshots and capture paths.
10. Hardware used.
11. Performance measurements.
12. Blockers.
13. Rollback command.
14. Remaining work.
15. Requirement status labels.

Use these exact status labels:

* IMPLEMENTED AND VERIFIED
* IMPLEMENTED BUT NOT VERIFIED
* PARTIALLY IMPLEMENTED
* BLOCKED BY ENVIRONMENT
* BLOCKED BY EXTERNAL DEPENDENCY
* NOT STARTED
* REQUIRES OWNER APPROVAL

Never claim IMPLEMENTED AND VERIFIED without actual evidence.

PART 21 — ACCEPTANCE STANDARD

The project must be assessed across:

* Correctness.
* Visual quality.
* Performance.
* Reliability.
* Security.
* Maintainability.
* Licence compliance.
* Compatibility.
* Testing.
* Rollback capability.

A subsystem is not complete merely because its code exists.

It must be integrated and tested.

A phase is not complete until its DONE WHEN criteria are met.

The vertical slice is the first major acceptance milestone.

Do not expand the world to additional cities while fundamental vertical-slice functionality remains broken.
