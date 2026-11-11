#!/usr/bin/env python3
"""JARVIS NEXUS pre-production package - content module.

All narrative content for the seven chapters. Kept separate from the
ReportLab build so text edits never touch layout code.
Frame captions carry the eight mandatory direction fields.
"""

DOC_TITLE = "JARVIS NEXUS - Pre-Production Package"
DOC_SUBTITLE = "Phase Zero - Inspection, Character and Environment Direction, Visual Storyboard, Technical Plan - Revision 2, Owner-Locked Identity Baseline"

# ----------------------------------------------------------------------------
# Chapter 1 - Repository Inspection Report
# ----------------------------------------------------------------------------
CH1_INTRO = (
    "This chapter reports the state of the connected repository (github.com/jamesrudh-arch/"
    "Jarvis) exactly as found at Phase Zero revision 2, at merge commit 6affa6e. The first "
    "inspection found an empty scaffold; pull request #1 then delivered a substantial "
    "implementation claiming Milestones 1-4, and pull request #2 added deployment "
    "configuration (zero-config Railway Dockerfile, Supabase pooler normalisation, optional "
    "Vercel split support). This revision inspects the merged result by direct code reading. "
    "The inspection remained read-only: no files were deleted, overwritten or reinitialised, "
    "no commits or pushes were made, no application source was modified and no dependencies "
    "were installed. The only artifacts created during Phase Zero are the pre-production "
    "documents and storyboard assets delivered alongside this package."
)

CH1_SECTIONS = [
    ("1.1  What the repository contains", [
        "Branch <b>main</b>, five commits: the initial scaffold; implementation commit "
        "<b>d3a25f9</b> (\"Implement JARVIS NEXUS Milestones 1-4\") via merged pull request "
        "#1 from branch <b>arena/3bdc7997-jarvis</b>; its merge commit <b>0b21a52</b>; "
        "deployment commit <b>e54cf3e</b> (Railway Dockerfile, Supabase pooler "
        "normalisation, optional Vercel split) via merged pull request #2 from branch "
        "<b>arena/9b6fc35d-jarvis</b>; and merge commit <b>6affa6e</b> (current HEAD). 66 "
        "tracked files across four modules: a Python FastAPI backend (about 4,300 lines - "
        "44 REST routes, 2 WebSocket endpoints, 15 SQLAlchemy models, services, an SQL "
        "migration, automated tests), a Vite + Three.js frontend (about 5,800 lines - "
        "sanctuary scene, character controller, camera director, scenario director, "
        "procedural textures, MIT-licensed vendor modules for dynamic bones, lip-sync and "
        "retargeting), a private inference worker (290 lines), and a docs/preproduction "
        "folder with its own baseline document and 18 storyboard plates (its frame 06 was "
        "substituted with a character reference and its frame 19 was merged into frame 20). "
        "Model assets: a 13.8 MB rigged 66-bone GLB character with 72 ARKit/Oculus morph "
        "targets, plus Mixamo locomotion clips.",
    ]),
    ("1.2  What is already functional (verified by code reading)", [
        "Substantially more than the first inspection found, and the claims largely check out "
        "against the code: server-side enforcement of all seven owner switches (voice input "
        "returns 403 with the microphone switch off); a ten-category epistemic memory system "
        "with Fernet encryption of sensitive records and a hard HTTP 409 guardrail preventing "
        "silent promotion of hypothesis to verified fact; goal dependency scheduling with "
        "audit events; bounded specialist agents with dispatch and cancellation; allowlisted "
        "tools with audit logs; encrypted Kaggle profile management with genuine package "
        "export; an authenticated worker WebSocket; and - importantly - a <b>truthful offline "
        "executive</b>: when no GPU worker is connected, conversation falls back to "
        "deterministic replies that explicitly label themselves as coming from an offline "
        "source rather than fabricating model output. The frontend implements the twelve zones "
        "and fifteen modes, Mixamo retargeting with root-drift stripping, gaze-first turning, "
        "blinking, phoneme-to-viseme lip-sync, and a scenario director with voxel clouds, "
        "variables, timeline scrubbing and world restoration.",
    ]),
    ("1.3  What can be retained", [
        "Essentially the whole implementation skeleton. The architecture matches the product "
        "specification: FastAPI + SQLAlchemy with SQLite for development and PostgreSQL + "
        "pgvector for production behind DATABASE_URL, WebSocket-first live state on "
        "/ws/nexus and /ws/worker, server-side secret encryption, and a worker design using "
        "the default model huihui-ai/Qwen2.5-14B-Instruct-abliterated with hardware-aware "
        "4-bit NF4 quantisation, Kaggle Secrets authentication and zero public ports. The "
        "twelve-zone world layout matches Chapter 3 of this package zone for zone. The seven "
        "switches are enforced on both sides. Nothing needs to be thrown away; the work "
        "forward is verification, visual alignment and hardening rather than replacement.",
    ]),
    ("1.4  What is missing or must change", [
        "<b>Visual identity.</b> The repository's character baseline predates the owner's "
        "approved direction. An independent vision-model audit of its plates at current HEAD "
        "finds the woman consistent within the repository's own set, but she is a different "
        "woman from the owner's locked anchor, and the audit's lighting verdict on its "
        "conversational frame is direct: the hologram glow \"doesn't register on her face, "
        "chest, or hands; it reads as an emissive sprite... painted-on rather than "
        "integrated\" - the exact defect the owner rejected. The baseline document also "
        "self-describes as \"Approved by Owner\", which is not accurate: the owner's actual "
        "direction is the identity anchor locked in Chapter 2 of this package. The shipped "
        "3D character's wardrobe and appearance must be aligned to that anchor (gate M0.5 in "
        "Chapter 6), and the repo's eighteen plates are superseded by the twenty "
        "identity-locked, light-integrated frames in Chapter 4.",
        "<b>Runtime verification.</b> The automated tests were authored by the implementing "
        "agent and have not been executed in the owner's environment; the verification "
        "protocol in Section 6.3 applies in full, including a real browser session, real "
        "locomotion inspection and a real GPU worker conversation before any capability is "
        "called verified. <b>Production hardening</b> (deployment configuration, CI, backup "
        "and restore drills) and <b>license hygiene</b> (retargeter.mjs carries no license "
        "header; Avaturn GLB provenance to be confirmed in writing; Mixamo clips fall under "
        "Adobe terms) complete the list.",
    ]),
    ("1.5  Existing architectural and design decisions", [
        "The implementation encodes decisions this package adopts as the baseline: a monorepo "
        "(backend / frontend / worker / docs); browser-first Three.js rendering with ACES "
        "filmic tone mapping and restrained bloom; the twelve-zone, fifteen-mode interaction "
        "model inside one continuous world; seven hardware-grade owner switches as the "
        "authority model; typed memory with epistemic statuses; goal dependency gates; and "
        "private-first inference (local PC or Kaggle GPU, no mandatory cloud API, Ollama and "
        "OpenAI-compatible endpoints as optional adapters only). The earlier hygiene defect "
        "from the first inspection is resolved: .env is no longer tracked and .env.example is "
        "committed in its place.",
    ]),
    ("1.6  Technical, licensing and asset constraints", [
        "Third-party code carries obligations that are accounted for: dynamicbones.mjs and "
        "lipsync-en.mjs are MIT-licensed (Mika Suominen, 2024) and retained; retargeter.mjs "
        "appears original but carries no license header and must gain one at M0.5; the "
        "character GLB is Avaturn-generated and its commercial-use terms must be confirmed in "
        "writing before ship; Mixamo animation clips fall under Adobe's terms for interactive "
        "use. Constraints inherited from the product brief remain binding on all milestones: "
        "no Ollama or commercial AI API may be required; MetaHuman is optional, never a "
        "prerequisite; holographic output must be a live view of the running application; "
        "inference, metrics, agent work and test results are never fabricated. No repository "
        "change was made during Phase Zero, per the inspection rules.",
    ]),
]

CH1_TABLE = {
    "caption": "Table 1.1 - Repository modules and assessment (66 tracked files, 5 commits, HEAD 6affa6e)",
    "header": ["Module", "Content", "Assessment"],
    "widths": [0.16, 0.40, 0.44],
    "rows": [
        ["backend/app", "FastAPI core: 44 REST routes, 2 WS endpoints, 15 models, inference hub, world hub, simulation and tools, seed data (incl. the cryo-manifold forensic and dual-turbine scenarios), Fernet crypto",
         "Retain. Claims verified by code reading; runtime verification pending (Section 6.3)"],
        ["backend/migrations, tests", "Initial pgvector-ready SQL schema; 7 test functions covering switches, memory guardrails, goals, scenarios, worker streaming",
         "Retain; extend with owner-environment runs before any capability is called verified"],
        ["frontend/src/world", "NexusSanctuaryScene (12 zones), JarvisCharacterController (66-bone rig, 72 morph targets, gaze, blink, lip-sync), CameraDirector, ScenarioDirector3D, ProceduralTextures",
         "Retain as the renderer base; visual identity of the character aligns to the approved anchor at M0.5"],
        ["frontend/src/vendor + models", "MIT dynamic bones and lip-sync modules; retargeter; jarvis_avaturn.glb (13.8 MB); Mixamo walking and locomotion sets",
         "Retain subject to license hygiene: header on retargeter, written Avaturn terms confirmation"],
        ["worker/jarvis_worker.py", "Private model engine: Qwen2.5-14B default, NF4 4-bit CUDA quantisation, Kaggle Secrets, outbound authenticated WS, streaming, cancellation",
         "Retain; verify with a real GPU session before calling inference verified"],
        ["docs/preproduction", "Repo's own baseline document + 18 storyboard plates + 2 asset references",
         "Superseded: not the owner's locked identity and painted-on glow (vision-model audit); frame 06 substituted, frame 19 missing; replaced by this package upon approval"],
        ["Dockerfile, railway.json, vercel.json, .env.example", "Zero-config Railway deploy, Supabase pooler normalisation, optional Vercel split, environment template, honest capability notes",
         "Retain; .env no longer tracked - first-inspection hygiene defect resolved"],
    ],
}

CH1_CALLOUT = ("5 commits  ·  66 tracked files  ·  44 REST routes + 2 WebSocket endpoints  ·  approx. 10,700 LOC",
               "Repository state at Phase Zero revision 2 (HEAD 6affa6e) - an M1-M4 implementation with deployment configuration, pending owner-environment verification and identity alignment")

# ----------------------------------------------------------------------------
# Chapter 2 - Character Direction
# ----------------------------------------------------------------------------
CH2_INTRO = (
    "JARVIS is an adult female intelligence with a poised, perceptive, professional presence. "
    "Revision 2 locks her appearance to the owner-approved identity anchor (Plate 2.1): every "
    "concept plate and every storyboard frame in this package is generated as a controlled "
    "edit of that single reference image, so one woman - the same face, hair, wardrobe and "
    "watch - carries across all twenty frames; independent QC scored identity continuity at "
    "8-9/10 frame-to-frame. The direction remains buildable: every visual trait maps to the "
    "licensed asset pipeline in Section 2.9 and the animation systems in Chapter 5. The "
    "shipped 3D character comes from the existing repository rig aligned to this identity, "
    "not from these images."
)

CH2_SECTIONS = [
    ("2.1  Age presentation and physical realism", [
        "JARVIS presents as a woman of about thirty-seven. Maturity is carried by structure, not "
        "decoration: a defined jaw line, mature brow-to-chin proportions, natural cheek planes, "
        "and skin that behaves like skin - three-layer subsurface scattering, visible pores, "
        "faint under-eye shading and subtle asymmetric imperfections. She is never neotenous, "
        "doll-like or plastic. Her body carries believable weight: mass transfers through the "
        "hips on turns, strides load the knees, and cloth and hair react to real velocity. "
        "Resting expression is calm attentiveness - emphatically not a smile.",
    ]),
    ("2.2  Face and hair", [
        "The face follows the approved anchor: a slim oval with high cheekbones and an angular, "
        "defined jaw; straight, slightly full dark brows; grey-brown eyes with true corneal "
        "specular; medium-full lips held closed and neutral at rest. Hair is dark brown, "
        "secured in a low bun that keeps the face fully visible, with a few loose strands for "
        "realism. Hair is shaded anisotropically and moves with physically plausible inertia - "
        "no billboard sheets, no helmet shine, and never coloured or flowing fantasy hair.",
    ]),
    ("2.3  Wardrobe", [
        "The baseline is the <b>Nexus duty suit</b>, locked to the anchor: a black fine-knit "
        "turtleneck under a tailored structured dark charcoal blazer, slim dark trousers, low "
        "practical boots, and a wristwatch worn on the left wrist. The silhouette is serious "
        "professional operations wear - precisely what the approved reference shows. There is "
        "no armour, no catsuit, no glowing costume lines, no lingerie styling, no science-"
        "fiction costume cliches: her wardrobe would not look out of place in a serious "
        "operations centre, which is exactly the point. A formal variant may add an "
        "unstructured drape coat for presentation moments (decision D3).",
    ]),
    ("2.4  Materials and colour treatment", [
        "Materials are separated by family and response: skin (subsurface, soft key response), "
        "hair (anisotropic sheen), wool-knit and technical twill (matte, weave-level micro "
        "normal), leather touchpoints, and worn metal hardware on clasps and the earpiece. "
        "Her wardrobe never emits light. Cyan exists on her only as reflection from consoles "
        "and displays; amber alert washes reach her the same way they reach the architecture. "
        "The world lights her - she is not a light source.",
    ]),
    ("2.5  Body proportions", [
        "Realistic adult female proportions at approximately 174 cm: natural "
        "shoulder-to-hip ratio, anatomical joint placement, and corrective blendshapes at "
        "shoulders, armpits and hips so deformations stay clean in lean, reach and console "
        "poses. No exaggerated anatomy of any kind. The rig is complete - full skeletal "
        "hierarchy, hand and finger articulation, foot roll bones, and an ARKit-52 facial "
        "blendshape set.",
    ]),
]

CH2_EXPRESSIONS = {
    "caption": "Table 2.1 - Expression set (FACS-coded). Restraint is the rule; each state is a modulation, never a mask.",
    "header": ["Expression", "Facial action (FACS)", "Body and timing cues"],
    "widths": [0.16, 0.40, 0.44],
    "rows": [
        ["Neutral", "Baseline; lids relaxed, jaw unengaged",
         "Attentive rest; weight 60/40; breathing 4 s cycle; blink 2-5 s"],
        ["Listening", "AU1+2 trace (brow raise), head tilt 3-5 degrees",
         "Still posture; sustained gaze; slow blink cadence; micro AU12 on comprehension"],
        ["Focused", "AU4 (brow lower) + AU5 trace (lid tension), lips closed",
         "Lean toward task; blink interval 3-6 s; micro jaw set; gestures slow"],
        ["Concerned", "AU1+4 (worry combination) + AU15 trace (corner depress)",
         "Gaze shifts to evidence; breath shallower; hands quiet or one brace"],
        ["Urgent", "AU5+7 (wide, tighten) + AU23 (lip tighten), AU26 on speech",
         "Forward lean; weight-shift tempo up; stride length up; no panic, no flail"],
    ],
}

CH2_POSES = {
    "caption": "Table 2.2 - Core poses and locomotion targets",
    "header": ["State", "Direction"],
    "widths": [0.24, 0.76],
    "rows": [
        ["Standing (attentive rest)", "Weight 60/40 on one leg, arms relaxed, clavicle level, gaze anchored on the primary stimulus; ready, not rigid"],
        ["Walking", "Purposeful 1.15-1.25 m/s; arm swing from the shoulder; tall spine; steady head; no model glide"],
        ["Running", "Measured urgency 3.2-3.8 m/s; forward lean 8-12 degrees; stride extension; jacket and hair respond"],
        ["Console interaction", "Hinged 15-20 degrees at the hips; one hand braced or hovering; the other tracks interface targets; feet planted"],
        ["Presentation", "Open stance 30-45 degrees to the display; free hand gestures toward the media; she stands beside content, never in front of it"],
    ],
}

CH2_FACIAL = [
    ("2.8  Facial animation and lip-sync approach", [
        "The facial stack is layered, lowest to highest: visemes, expression, blink, gaze. "
        "Speech drives an ARKit-52 viseme set (9-12 visemes with co-articulation) from phoneme "
        "timings supplied by the TTS adapter - timing comes from the audio pipeline, never "
        "guessed from text. The expression layer composites above visemes at roughly 60/40 "
        "weight so speech stays legible while emotion stays live. The blink system runs a "
        "2-5 s Poisson cadence (120 ms close, 200 ms open) with occasional thought-blinks "
        "linked to turn-taking. Gaze uses saccades, smooth pursuit and micro-saccades; the "
        "head leads the eyes beyond 20 degrees of offset. Prosody stress points earn at most "
        "two or three emphasis beats per sentence - restraint is a hard budget, not a mood. "
        "In silence the face drifts back to neutral; it never freezes.",
    ]),
]

CH2_ASSETS = {
    "caption": "Table 2.3 - Asset pipeline (repository-first; nothing unlicensed ships)",
    "header": ["Layer", "Source", "Licence basis", "Role"],
    "widths": [0.15, 0.30, 0.25, 0.30],
    "rows": [
        ["Character (primary)", "Existing repository rig: jarvis_avaturn.glb (Avaturn-generated, 66 bones, 72 ARKit + Oculus morph targets)",
         "Avaturn terms - commercial use to be confirmed in writing at M0.5", "Base rig; wardrobe and appearance aligned to the approved anchor via garment/material update or regeneration"],
        ["Character (M4 optional)", "Epic MetaHuman",
         "MetaHuman EULA (free)", "Optional higher-fidelity body for the existing NPC - never a prerequisite"],
        ["Locomotion", "Existing Mixamo clips (walking.fbx, xbot_locomotion.glb) + ActorCore extensions as needed",
         "Adobe terms (interactive use) + Reallusion content licence", "Blend-space clips with authored transitions; root-drift stripping already implemented"],
        ["Gestures and interaction", "Mixamo library + bespoke keyframe",
         "Adobe Terms + project-owned IP", "Gestures, console and presentation sets"],
        ["Lip-sync and hair dynamics", "Existing MIT vendor modules (lipsync-en, dynamicbones)",
         "MIT (Mika Suominen)", "Phoneme-to-viseme scheduling and secondary hair motion, already integrated"],
        ["Viseme pre-pass (optional)", "NVIDIA Audio2Face or equivalent adapter",
         "NVIDIA terms (free for use)", "Replaceable adapter feeding the ARKit viseme set"],
    ],
}

CH2_ASSETS_NOTE = (
    "Selection is gated on a Milestone 1 asset spike: a one-week evaluation in which the "
    "candidate character is imported, retargeted and driven through the full locomotion and "
    "facial stack before any licence is purchased in bulk. If no licensed asset meets the "
    "quality bar, the limitation will be stated precisely and a custom commission scoped - "
    "never concealed with a cheap substitute."
)

# ----------------------------------------------------------------------------
# Chapter 3 - Environment Direction
# ----------------------------------------------------------------------------
CH3_INTRO = (
    "The world is one continuous interior - <b>The Nexus</b> - a subterranean operations "
    "floor of roughly 30 by 18 metres with 4.2 metres clear height and a mezzanine over the "
    "east wing. The architectural language is monolithic and quiet: honed near-black basalt "
    "volumes, dark brushed steel, machined reveals carrying hairline cyan light, an acoustic "
    "ceiling with linear apertures, and a raised floor with inset guide lighting. It is not a "
    "neon cave, not a spaceship corridor, not a showroom: it is a working facility that "
    "happens to be beautiful the way serious infrastructure is beautiful."
)

CH3_AREAS = {
    "caption": "Table 3.1 - The twelve areas (numbers match the floor plan)",
    "header": ["No.", "Area", "Spatial identity and equipment", "Key interaction points"],
    "widths": [0.05, 0.17, 0.44, 0.34],
    "rows": [
        ["01", "Central Operations (Hub)", "Circular dais with a low direct-view holotable, three curved consoles, overhead ring light; the compositional anchor of the floor", "Task summoning, world overview, status glance, owner console at the hub edge"],
        ["02", "Research (Library)", "Study carrels with dual curved displays and a physical source wall; warm 3000 K task pools against the cool ambient - a humanist study inside the facility", "Source pinning, citation tracing, evidence extraction, thread steering"],
        ["03", "Memory Archive (Vault)", "Glass-fronted indexed vitrines with warm amber cell light; deeper column rhythm, slower pacing - memory reads as warm and kept", "Recall, pin, correct, forget; provenance chips separate fact, preference and inference"],
        ["04", "Goals and Projects (Plan Wall)", "Longitudinal wall of persistent project plates with light timelines and dependency lines; standing bench", "Approve, reweight, pause, resume; auditable next-action proposals"],
        ["05", "Agent Collaboration (The Round)", "Semicircular table with five recessed presence plates - abstract light presence, deliberately not humanoid robots; JARVIS stands at the open arc", "Listen-in, promote or veto agent actions, request transcripts"],
        ["06", "Media and Screening", "Four-metre direct-view wall, two-step tiered platform, fully dimmable zone", "Play, pause, seek, frame-step, A-B compare, frame extraction, 2D-to-3D handoff"],
        ["07", "Simulation Stage", "Eight-metre clear volume with overhead grid, reconfigurable floor projection and boundary markers; may borrow adjacent floor for scale scenarios", "Scenario construction, playback, variables, branching, actor direction"],
        ["08", "Diagnostics", "Open-chassis bench, oscilloscope culture, honest cabling, live telemetry displays", "Health inspection, trace capture, fault isolation"],
        ["09", "Defensive Security", "Quieter inward-facing arc of monitors; red is reserved for confirmed-critical states only", "Anomaly review, evidence chain, confirmation-gated containment"],
        ["10", "Vision (Overlook)", "Dark glass wall; live external views render only when the camera switch is genuinely on", "Explicit-activation viewing, capture-state truth, scene understanding"],
        ["11", "Compute and Connections (Bridge)", "Restrained compute wall with honest utilisation lighting - no infinite server racks; the bridge desk where inference profiles physically dock", "Local/Kaggle profile management, genuine auth tests, worker packages"],
        ["12", "Embodiment and Projection (Embayment)", "Raised platform with calibration rig and capture volume; the projection surface draws from the same live instance as every other view", "Hologram layout control (mirror, rotate, multi-face), live sync"],
    ],
}

CH3_LIGHT = [
    ("3.2  Lighting, materials and navigation", [
        "Lighting is motivated: fixtures are visible, pools are purposeful, and colour is "
        "information. Warm 2700-3000 K pools mark human zones (Library, Vault, Plan Wall); "
        "cool 4000-5000 K marks machine zones (Hub consoles, Bridge, Diagnostics). Cyan is "
        "reserved for information - displays, guide lines, status - and never washes whole "
        "surfaces; amber marks attention; red appears only on confirmed-critical states. "
        "JARVIS is lit with discipline: a soft 3/4 key that keeps her face readable "
        "everywhere she works, a cyan rim borrowed from nearby consoles, and warm bounce "
        "when she stands in humanist zones. Volumetric depth comes faintly from ceiling "
        "apertures only - no fog banks hiding weak assets. Contact shadows are always on; "
        "bloom is restrained.",
        "Material families stay distinct: honed basalt, brushed dark steel, smoked low-iron "
        "glass, muted blue-grey acoustic felt, leather at touchpoints, worn metal hardware, "
        "and emissive displays. Architecture does not glow; information does. Navigation "
        "runs along <b>The Spine</b>, the east-west axis every zone opens onto, with breathing "
        "guide lines and a secondary ring behind the Hub. Wayfinding is task-linked: when "
        "JARVIS works, she goes to where the work lives, and the floor plan below is the "
        "contract every mode, camera and scene obeys.",
    ]),
]

CH3_PALETTE = {
    "caption": "Table 3.2 - In-world palette (the world's own brand, used by renderer, UI and scenario systems)",
    "header": ["Swatch", "Colour", "Role in the world"],
    "widths": [0.12, 0.20, 0.68],
    "rows": [
        ["#02070B", "Near-black blue", "Base darkness of architecture and shadow; the floor's resting tone"],
        ["#06121A", "Architectural surfaces", "Basalt and steel panel bodies; large-area structure"],
        ["#62E6F2", "Primary cyan", "Information only - displays, guide lines, status, annotations; never ambient wash"],
        ["#DDFBFF", "Ice white", "Text on dark surfaces, timeline light, highest-emphasis highlights"],
        ["#7799A5", "Muted text", "Secondary labels, inactive states, captions inside the world"],
        ["#E7AE5B", "Warning amber", "Attention states, alerts-in-progress, sync progress, blocked dependencies"],
        ["#FF6B67", "Critical red", "Confirmed-critical only - used sparingly, never decoratively"],
    ],
}

# ----------------------------------------------------------------------------
# Chapter 4 - Storyboard frames
# ----------------------------------------------------------------------------
CH4_INTRO = (
    "Twenty frames, one per page. Every frame is a controlled edit of the single "
    "owner-approved identity anchor (Plate 2.1) - never an independent text-to-image roll - "
    "so the same woman is guaranteed across the set. Each frame was then audited by an "
    "independent vision model against four criteria: identity match to the anchor, physical "
    "light integration (the hologram must genuinely illuminate her face, hands and "
    "environment and cast her shadow), natural hands, and defects. Frames scoring below the "
    "bar were re-generated with corrected prompts until the audit passed: the final set "
    "holds identity at 8-9/10 wherever the face is visible, light integration at 6-8/10, "
    "and twenty of twenty frames keep their verdict (the per-frame audit line appears under "
    "each caption table). The images define composition and intent; the shipped character "
    "and world come from the licensed pipelines in Chapter 2 and the architecture in "
    "Chapter 3, where light integration is guaranteed physically by the engine rather than "
    "by prompt. Frames are numbered to match the mapping matrix in Chapter 5, and each "
    "carries the operational mode it serves."
)

FRAMES = [
    {
        "num": "01", "title": "FIRST WAKE", "img": "storyboard_locked/sb_01_first_wake.jpg",
        "qc": "Audit: identity n/a (deliberate from-behind shot) · light 8/10 · verdict KEEP. Silhouette, low bun and blazer read; ring ignition lights her back and boots.",
        "mode": "MODE 1 · WAKE & AUTHENTICATION", "loc": "THE SPINE → HUB",
        "action": "Cold-start sequence completes; consoles cascade online along the Spine. JARVIS walks in from the west; her first anchor is the hub holotable, then the owner console.",
        "emotion": "Composed emergence - neutral baseline, gaze settling. No theatrical entrance, no speech yet.",
        "camera": "Wide establishing, 24 mm, low angle from the Spine floor. JARVIS at the right third, small-to-medium in frame; 1.5 s exposure ramp from black.",
        "lighting": "Cold-start state: consoles cascading, single hub ring overhead, her figure rim-lit cyan at low intensity against deep ambient shadow.",
        "environment": "The Spine and Hub; floor guide lines breathing; Memory Archive dark to the west.",
        "visible": "Boot truth only: CORE online · memory intact · inference: none. The owner console glows, awaiting authentication.",
        "owner": "None yet - authentication prompt on the owner console; free camera observation is available.",
        "transitions": "IN: from black, slow exposure ramp. OUT: she turns toward the owner console; camera begins a slow push, cutting on turn completion.",
        "systems": "renderer cold-start pass · CORE boot truth · owner console auth · camera exposure ramp",
    },
    {
        "num": "02", "title": "NORMAL LIVING PRESENCE", "img": "storyboard_locked/sb_02_living_presence.jpg",
        "qc": "Audit: identity 9/10 · light 8/10 · verdict KEEP after one correction pass.",
        "mode": "MODE 2 · LIVING PRESENCE", "loc": "CENTRAL HOLO-RING",
        "action": "Unaddressed background work at the holo-ring: she steadies a large modular habitat structure element by element above the pedestal table, fingertips grazing its glowing lower edge. She looks up as the owner's presence engages.",
        "emotion": "Quiet focus breaking into attentiveness; mild recognition (brow-raise trace). No broad smile, no greeting performance.",
        "camera": "50 mm medium-long from the hub axis; body three-quarters to the table; the head turn completes as the camera settles.",
        "lighting": "The hologram is the practical key - cyan on her face and hands; ring glow from the pedestal; deep ambient shadow around.",
        "environment": "Central holo-ring, pedestal table; one glass data column glowing faintly in the background.",
        "visible": "Three or four project plates with statuses (in progress / scheduled / blocked), a next-action line, one amber dependency.",
        "owner": "Passive. She acknowledges with a brief glance and a single line; the owner may open conversation.",
        "transitions": "IN: cut. OUT: dolly-with as she steps away toward the Hub on a queued task.",
        "systems": "ambient task scheduler · plan-wall surface · presence glance system",
    },
    {
        "num": "03", "title": "WALKING TOWARD CENTRAL OPERATIONS", "img": "storyboard_locked/sb_03_walking_conversing.jpg",
        "qc": "Audit: identity 9/10 · light 7/10 · verdict KEEP after two correction passes (painted-on glow eliminated).",
        "mode": "MODE 2 · LIVING PRESENCE", "loc": "THE SPINE",
        "action": "Purposeful walk at 1.2 m/s along the Spine toward the Hub, caught mid-stride heel-to-toe through a floor circuit ring; her head is turned toward the owner mid-sentence, one hand raised in a small explanatory gesture.",
        "emotion": "Neutral purpose with conversational animation - she speaks while moving, never pacing for effect.",
        "camera": "Tracking shot at eye level, 50 mm; her face and stride clearly readable, the path receding behind her.",
        "lighting": "The floor ring beneath her casts cyan up-light onto boots, trouser cuffs and jaw; the console banks she passes key her face from the side; no floating holograms in this beat.",
        "environment": "The Spine, west to east.",
        "visible": "The floor guide line to the Hub and the circuit ring she passes through; nothing else competes for attention.",
        "owner": "The owner may hail at any time; she transitions into a stop-and-plant-turn.",
        "transitions": "IN: from Frame 02 follow-on or cut. OUT: match-move into Hub arrival as the camera re-frames on deceleration.",
        "systems": "locomotion blend space · navmesh spine route · follow-camera dolly",
    },
    {
        "num": "04", "title": "TURNING TO ACKNOWLEDGE ME", "img": "storyboard_locked/sb_04_turning_acknowledge.jpg",
        "qc": "Audit: identity 8/10 · light 6/10 · verdict KEEP after one correction pass.",
        "mode": "MODE 3 · CONVERSATIONAL FOCUS", "loc": "HUB EDGE",
        "action": "Addressed mid-task at a console: her body still angles to the work, left hand on the console edge, but her head and eyes have already turned to the owner - gaze first, body catching up - with her right hand paused mid-reach toward a wireframe component.",
        "emotion": "Attentive recognition; a micro brow-raise; mouth neutral and ready to speak.",
        "camera": "Owner point of view, 40 mm at eye height, medium shot from a slight low angle; her head-turn ends exactly on the camera axis.",
        "lighting": "The console's wireframe hologram keys her cheek and jaw from the side; the room stays deep charcoal around her.",
        "environment": "Hub edge; consoles idle-cool around her.",
        "visible": "Deliberately minimal - one status chip dissolves; her attention is the information.",
        "owner": "Full. She is listening; voice and text input are live; she remains interruptible throughout.",
        "transitions": "IN: cut on the hail. OUT: settles into the conversational two-shot (Frame 05).",
        "systems": "plant-turn state · gaze lock · conversation intake · interruption manager",
    },
    {
        "num": "05", "title": "CONVERSATIONAL FOCUS", "img": "storyboard_locked/sb_05_conversational_focus.jpg",
        "qc": "Audit: identity 9/10 · light 6/10 · verdict KEEP.",
        "mode": "MODE 3 · CONVERSATIONAL FOCUS", "loc": "HUB · CONVERSATION ZONE",
        "action": "Two-way exchange across the holotable. She holds still with a faint intelligent half-smile and a slight head tilt; a small translucent data prism floats between her and the owner, lighting her face from below-front.",
        "emotion": "Engaged listening: a four-degree head tilt, sustained direct gaze, slow blink cadence.",
        "camera": "65 mm at eye level across the dark glass holo-table; her face in full light, the owner's position implied foreground.",
        "lighting": "The floating prism is the practical key from below-front; single catchlight in each eye; background falls to darkness.",
        "environment": "Hub conversational zone, standing.",
        "visible": "The data prism and its light on her face; the conversation stream stays minimal.",
        "owner": "Text, voice or image input; interruption is always honoured mid-word or mid-step.",
        "transitions": "IN: from Frame 04. OUT: on \"let me show you\", she turns toward the relevant zone and the camera pans with her.",
        "systems": "gesture budget · listening pose set · conversation CORE · context cards",
    },
    {
        "num": "06", "title": "WORKING AT A CONSOLE", "img": "storyboard_locked/sb_06_console_work.jpg",
        "qc": "Audit: identity 8/10 · light 7/10 · verdict KEEP (one of the four proof frames that validated the pipeline).",
        "mode": "MODES 7/12 · TOOLS & TELEMETRY", "loc": "HUB CONSOLE CLUSTER",
        "action": "Diagnostic assembly work beside a black console: her right hand turns a large wireframe turbine rotor in mid-air, fingers clearly separated; her left hand rests on the console edge, wristwatch visible; her eyes track the part.",
        "emotion": "Focused: brow lowered, extended blink interval, jaw set. Working because work exists.",
        "camera": "65 mm over-shoulder, high three-quarter; hands and profile face both readable.",
        "lighting": "Console glow as practical key from below-front; hair light from above; cool bias that keeps the face legible.",
        "environment": "Hub console cluster.",
        "visible": "Two or three clean numeric callouts tied to the rotor by leader lines; one amber-flagged value under investigation; nothing else.",
        "owner": "Optional orbit and inspect camera unlock; she stays in flow unless addressed.",
        "transitions": "IN: cut from task dispatch. OUT: alert intrusion (Frame 07) or a task-complete acknowledgment.",
        "systems": "console interactable IK · task animator · diagnostics service · telemetry stream",
    },
    {
        "num": "07", "title": "URGENT MOVEMENT DURING AN ALERT", "img": "storyboard_locked/sb_07_urgent_alert.jpg",
        "qc": "Audit: identity 9/10 · light 7/10 · verdict KEEP after two correction passes (face and bun now clearly detailed).",
        "mode": "MODE 11 · DEFENSIVE SECURITY", "loc": "SPINE MID-ROUTE",
        "action": "A priority alert interrupts console work. She runs at 3.25 m/s along the Spine toward Security; stride extension, blazer hem flared, one arm driving; the distant vault door is wrapped in a glowing orange wireframe containment lattice.",
        "emotion": "Measured urgency: lids wide and tight, jaw set - controlled, never panicked.",
        "camera": "Medium-wide from ahead of her path, low bias, steady - close enough that her face and low bun read clearly; no shake, slight lens breathing only.",
        "lighting": "Orange reserved for the single critical event: the containment lattice and the pulsing floor route line beneath her boots; the passing consoles keep her face and hands cyan.",
        "environment": "Spine mid-route, Hub to Security; the floor route line pulses amber.",
        "visible": "The orange containment lattice on the vault door, the pulsing route line, and nothing else - the alert is the information.",
        "owner": "One-gesture cancel or redirect available; otherwise hands-off.",
        "transitions": "IN: hard cut on the alert (motivated). OUT: deceleration into the security arc (Frame 16 state).",
        "systems": "alert bus · locomotion run state · zone light director · route line · cancel control",
    },
    {
        "num": "08", "title": "MEMORY EXPLORATION", "img": "storyboard_locked/sb_08_memory_archive.jpg",
        "qc": "Audit: identity 9/10 · light 7/10 · verdict KEEP after one correction pass (garbled text removed, shadow added).",
        "mode": "MODE 4 · MEMORY", "loc": "MEMORY ARCHIVE",
        "action": "In the Archive her right hand reaches toward an amber record shard inside a tall glass data column, fingertips centimetres from the glass; columns recede into darkness, most shards ice-cyan, a few amber. She reads provenance before using anything.",
        "emotion": "Reflective concentration; a slower tempo than anywhere else on the floor.",
        "camera": "Medium-wide; a foreground column creates a frame-within-frame; the colonnade receding gives depth.",
        "lighting": "The column's cyan glow keys her face and reaching hand from the side; the amber shard answers with warm fill; her long shadow crosses the reflective floor.",
        "environment": "Memory Archive, west wing.",
        "visible": "Abstract record shards - cyan verified facts, amber hypotheses - with no readable text; the epistemic separation is carried by colour alone.",
        "owner": "Pin, correct or request forgetting; she asks before recategorising anything.",
        "transitions": "IN: slow push. OUT: she turns to camera with the finding; cut.",
        "systems": "memory service (recall/pin/forget) · vault surface · provenance chips",
    },
    {
        "num": "09", "title": "GOALS AND ONGOING WORK", "img": "storyboard_locked/sb_09_goals_dag.jpg",
        "qc": "Audit: identity 9/10 · light 7/10 · verdict KEEP.",
        "mode": "MODE 5 · GOALS & PROJECTS", "loc": "PLAN WALL",
        "action": "She reaches up to touch the bright active node of a holographic dependency graph floating at head height; the critical path glows, completed nodes render solid ice-white, dim nodes wait. She proposes the next action and waits.",
        "emotion": "Confident clarity; a trace of conviction on the proposal - comfortable being disagreed with.",
        "camera": "40 mm medium, three-quarter; the graph's leading lines converge behind her.",
        "lighting": "The graph is the practical: cyan spill across her face and blazer, her fingertips lit where they meet the active node.",
        "environment": "Plan Wall, centre-north.",
        "visible": "One floating label - GOAL 3 CRITICAL PATH - over the graph: node states, the active path, completed milestones.",
        "owner": "Approve, reweight, pause or cancel with a word; the audit trail is one glance away.",
        "transitions": "IN: cut. OUT: pull-back to the full wall in owner survey mode.",
        "systems": "goals service (priority/status/audit) · plan-wall timeline · approval gate",
    },
    {
        "num": "10", "title": "MULTI-AGENT COLLABORATION", "img": "storyboard_locked/sb_10_multi_agent.jpg",
        "qc": "Audit: identity 9/10 · light 7/10 · verdict KEEP.",
        "mode": "MODE 6 · AGENTS", "loc": "THE ROUND",
        "action": "Geometric specialist-agent workspaces - glowing wireframe polyhedra - hover above the radial holo-table; one polyhedron burns brighter: its agent is speaking. She conducts: a glance to the speaker, an open-hand assignment to another.",
        "emotion": "Command calm; mild scrutiny on the conflicting finding.",
        "camera": "35 mm high three-quarter wide; she stands at the open end of the arc, plates arranged before her.",
        "lighting": "Cool plate pools on the table; her rim from the Spine behind.",
        "environment": "Agent Collaboration, centre-north.",
        "visible": "Five icosahedral agent workspaces - a molecule, a document tree, a network graph, a world map, a data stream - plus the speaking agent's brighter burn and her open-hand assignment.",
        "owner": "Listen in; promote or veto agent actions; request full transcripts.",
        "transitions": "IN: cut. OUT: she delegates, then turns to the owner with a synthesis line.",
        "systems": "agent coordinator (roles/permissions) · round presence plates · synthesis report",
    },
    {
        "num": "11", "title": "LIVE RESEARCH", "img": "storyboard_locked/sb_11_live_research.jpg",
        "qc": "Audit: identity 9/10 · light 8/10 · verdict KEEP (proof frame).",
        "mode": "MODE 8 · RESEARCH", "loc": "RESEARCH LIBRARY",
        "action": "At the Research alcove she validates a live spatial data reconstruction: analytics readouts hover beside her - reconstruction precision 0.98, confidence 99.1 percent - as she checks the model against incoming sources and pins the stronger ones.",
        "emotion": "Curiosity sharpening into confirmation; a slight forward lean.",
        "camera": "65 mm three-quarter medium; her profile, the readouts and the data field share the plane.",
        "lighting": "The data field and readouts key her face cyan from the front-left; deep charcoal behind.",
        "environment": "Research, west wing.",
        "visible": "Reconstruction readouts - PRECISION 0.98, CONFIDENCE 99.1% - source chips and a weak source visibly greyed and rejected.",
        "owner": "Ask for any source; reject evidence; steer the thread.",
        "transitions": "IN: cut. OUT: she lifts a source toward the Stage - a drag gesture into scenario construction.",
        "systems": "research service · source provenance · citation trace · evidence pinning",
    },
    {
        "num": "12", "title": "SIMULATION", "img": "storyboard_locked/sb_12_simulation.jpg",
        "qc": "Audit: identity 9/10 · light 6/10 · verdict KEEP. Matches the repository's seeded dual-turbine scenario beat for beat.",
        "mode": "MODE 9 · SIMULATION", "loc": "SIMULATION STAGE",
        "action": "On the Stage, two volumetric turbine simulations run side by side: Variant A in clean cyan laminar flow, Variant B in amber-turbulent stress with hub-corner shear vectors. She stands exactly between them, lit by both, comparing behaviour.",
        "emotion": "Analytic engagement; steady narration.",
        "camera": "35 mm wide and low; the model dominates, her silhouette is the scale reference.",
        "lighting": "Stage dim; the model self-illuminated cool; her rim only; minimal volumetrics.",
        "environment": "Simulation Stage, east wing.",
        "visible": "A truth label (data-driven reconstruction · two live inputs), measurement ticks, a branch-point indicator.",
        "owner": "Variables panel live; the owner may nudge one; pause, scrub and replay at will.",
        "transitions": "IN: from the drag-in. OUT: at a branch point she pauses the simulation and offers alternatives.",
        "systems": "simulation service · scenario director (playback) · variable panel · truth labels",
    },
    {
        "num": "13", "title": "CONSTRUCTING A SCENARIO", "img": "storyboard_locked/sb_13_scenario_construction.jpg",
        "qc": "Audit: identity 9/10 · light 7/10 · verdict KEEP.",
        "mode": "MODE 9 · SIMULATION", "loc": "SIMULATION STAGE",
        "action": "The 'let me show you' moment: her right hand conducts above the pedestal table as a small tabletop schematic unfolds and expands into a room-scale voxel reconstruction - a point-cloud building rising behind her, particle streams arcing from table to structure, walls and staircases crystallising out of drifting points.",
        "emotion": "Creative focus; one flick of quiet satisfaction as the expansion takes shape.",
        "camera": "Wide 35 mm; the expansion fills the hall behind her while she stays the anchor of the frame.",
        "lighting": "The expanding volume is the practical: cyan wash over her raised hand and face, her long shadow thrown forward across the floor.",
        "environment": "Simulation Stage, pre-performance.",
        "visible": "Scenario outline chips appearing in sequence (system, flow, failure point); a truth label marking the piece as illustration; the timeline strip.",
        "owner": "Suggest elements live; insertion is immediate and reversible.",
        "transitions": "IN: cut. OUT: the scenario is set - the stage shifts to performance lighting (Frame 14).",
        "systems": "scenario director (authoring) · prop palette · timeline strip · world snapshot",
    },
    {
        "num": "14", "title": "DIRECTING A SCENARIO", "img": "storyboard_locked/sb_14_scenario_directing.jpg",
        "qc": "Audit: identity 8-9/10 · light 7-8/10 · verdict KEEP after one correction pass (hand now fully outside the volume).",
        "mode": "MODE 9 · SIMULATION", "loc": "SIMULATION STAGE",
        "action": "One clear step outside a paused room-scale incident reconstruction - a voxel-cloud pipe scene with one wireframe worker frozen mid-action - she points at the glowing orange Point of Origin; a timeline ring encircles the scene; the scrub marker waits.",
        "emotion": "A director's decisiveness; one beat of light humour when a prop misplaces itself.",
        "camera": "28 mm wide from a stage corner; the overhead grid is visible and the full stage reads.",
        "lighting": "Performance state; actors render as soft cyan translucent figures - clearly temporary, clearly not JARVIS.",
        "environment": "Simulation Stage, performance.",
        "visible": "One floating label - INCIDENT RECONSTRUCTION - the orange Point of Origin, the frozen worker, the timeline ring; voxel resolution 3 mm.",
        "owner": "Take the director's seat or watch; branch variables remain live.",
        "transitions": "IN: from Frame 13. OUT: \"from the top\" - playback begins, or the run is recorded.",
        "systems": "scenario director (blocking) · scenario actors · camera markers · annotations",
    },
    {
        "num": "15", "title": "PRESENTING AND PAUSING A VIDEO", "img": "storyboard_locked/sb_15_video_to_3d.jpg",
        "qc": "Audit: identity 9/10 · light 8/10 · verdict KEEP.",
        "mode": "MODES 3/9 · MEDIA", "loc": "MEDIA & SCREENING",
        "action": "Beside the frameless media wall, a paused industrial clip holds on the wall while a translucent wireframe volumetric twin of the site's main vehicle is extracted from the frozen frame into the room, still tethered by a bridge of drifting particles; she presents it with an open upturned palm, mid-explanation.",
        "emotion": "Pointed emphasis; her glance moves between the owner and the frame.",
        "camera": "40 mm from the owner's position; the screen and her profile both stay sharp.",
        "lighting": "The paused frame glows softly on the wall; the extracted twin keys her palm, face and shoulder cyan; the room stays dark.",
        "environment": "Media and Screening, east-north.",
        "visible": "Timeline scrubber, frame stamp, an annotation pinned to the frame region, and a \"show this in 3D\" link.",
        "owner": "Scrub, step frames, A-B compare two clips, approve frame extraction into a scenario.",
        "transitions": "IN: cut. OUT: she lifts the frame content toward the Stage - a 2D-to-3D handoff with a match dissolve.",
        "systems": "media service (spatial player) · frame extraction · timestamp commentary · 2D-to-3D handoff",
    },
    {
        "num": "16", "title": "VISION AND DEFENSIVE SECURITY", "img": "storyboard_locked/sb_16_vision_security.jpg",
        "qc": "Audit: identity 8/10 · light 6/10 · verdict KEEP after one correction pass (scan-beam artifact removed).",
        "mode": "MODES 10/11 · VISION & SECURITY", "loc": "SECURITY ARC",
        "action": "At the optical input station she stands calmly inside a thin hexagonal defensive boundary lattice while a floating sensor plane with a single camera iris hovers before her at chest height, its steady cyan glow washing over her; chin slightly lifted, patient, holding still for the scan.",
        "emotion": "Composed cooperation; deliberate stillness - the capture is explicit, never hidden.",
        "camera": "65 mm medium straight-on; the sensor plane between camera and her, the lattice framing the space.",
        "lighting": "The sensor plane and lattice cast cyan onto her blazer and cheekbones; her shadow crisp on the black floor.",
        "environment": "Defensive Security, centre-south.",
        "visible": "The sensor iris and its steady glow, the hexagonal boundary lattice - capture state is shown by the geometry itself; no other text in frame.",
        "owner": "Authorization gate for irreversible actions; request clarification; stand down.",
        "transitions": "IN: from Frame 07 arrival. OUT: resolution - the room cools back to cyan; she exhales and reports.",
        "systems": "vision adapter · security monitor · evidence chain · authorization gate",
    },
    {
        "num": "17", "title": "LOCAL / KAGGLE CONNECTION", "img": "storyboard_locked/sb_17_local_kaggle_compute.jpg",
        "qc": "Audit: identity 9/10 · light 7/10 · verdict KEEP after one correction pass (white-clinic drift corrected).",
        "mode": "MODE 13 · CONNECTIONS & COMPUTE", "loc": "COMPUTE BRIDGE",
        "action": "At the compute bay she checks the outbound link: above a near-black server rack a wireframe network diagram floats - the local PC cube at centre, light lines arcing to three GPU slots, one glowing connected, two dim - and her index finger rests on the connected slot marker.",
        "emotion": "Patient pragmatism; matter-of-fact about quotas and limits.",
        "camera": "65 mm medium-wide; the rack, the diagram and her checking hand share the plane, her calm face above them.",
        "lighting": "The diagram is the main light source, casting cyan onto her face and the glossy floor; the rack's LED rows reflect below.",
        "environment": "Compute and Connections, west-mid.",
        "visible": "One floating label - OUTBOUND LINK: SECURED - the slot states, and the honest status of each compute path.",
        "owner": "Cancel, switch profiles, run a genuine authentication test, generate a worker package.",
        "transitions": "IN: cut. OUT: the worker is healthy - status settles cyan and she steps back toward the Hub.",
        "systems": "inference worker manager · Kaggle profile vault · honest status · heartbeat",
    },
    {
        "num": "18", "title": "OWNER POWER AND PRIVETY CONTROLS", "img": "storyboard_locked/sb_18_owner_switches.jpg",
        "qc": "Audit: identity 8/10 · light 7/10 · verdict KEEP.",
        "mode": "ALL MODES · OWNER AUTHORITY", "loc": "OWNER CONSOLE, HUB EDGE",
        "action": "Seven physical latching switches sit on the dark console - the large Master at centre, four lit cyan, two dark. Her right hand hovers just above the Master without touching it and she looks up at the owner: the toggle is the owner's, never hers.",
        "emotion": "Readiness without servility; the asking glance is calm, supportive, unhurried.",
        "camera": "40 mm medium from the owner's side of the console; switches legible, her asking glance holding the frame.",
        "lighting": "The switch LEDs cast cyan up-light onto her wrist and jaw; the room behind stays deep.",
        "environment": "Owner console at the Hub edge.",
        "visible": "Each switch labeled with its real state and live effects: Master, Microphone, Camera, Autonomy, Remote Compute, Computer Control, Embodiment.",
        "owner": "This frame is the interaction. Toggles change real behaviour - Master OFF visibly powers zones down around them.",
        "transitions": "IN: cut. OUT: the state settles; she acknowledges the new envelope with one line.",
        "systems": "owner switches service (seven) · live effects bus · privacy enforcement",
    },
    {
        "num": "19", "title": "MOBILE COMPANION", "img": "storyboard_locked/sb_19_mobile_companion.jpg",
        "qc": "Audit: identity 9/10 · light 6/10 · verdict KEEP after three restructures (the phone-screen face is now a controlled edit of the anchor itself).",
        "mode": "MODE 14 · DIGITAL-HUMAN EMBODIMENT", "loc": "HUB · THROUGH MOBILE VIEW",
        "action": "The owner's hand holds the phone and the companion feed fills its screen: her face in medium close-up mid-conversation - the same woman, the same instance - while the sanctuary glows softly out of focus behind the device.",
        "emotion": "Continuity of warmth - the same person, the same day, no reset, no costume change.",
        "camera": "First-person view down at the phone: bezel and owner's thumb framing the screen, her live feed the brightest element in frame.",
        "lighting": "The screen's cyan glow spills onto the holding hand and wrist; the room beyond stays charcoal.",
        "environment": "The Hub, seen through the mobile view.",
        "visible": "A condensed status rail, voice-first input, camera and microphone state chips, and an emergency hail.",
        "owner": "Talk or hold-to-talk; camera toggle; hail. Everything in the desktop view exists here in mobile form.",
        "transitions": "IN: cut. OUT: the desktop view resumes - state unchanged, because it is one instance.",
        "systems": "device adapter (mobile) · state sync (one instance) · reduced-cost renderer profile",
    },
    {
        "num": "20", "title": "THE SAME LIVE CHARACTER, RENDERED FOR HOLOGRAPHIC PROJECTION", "img": "storyboard_locked/sb_20_holographic_projection.jpg",
        "qc": "Audit: identity 9/10 · light 7/10 · verdict KEEP.",
        "mode": "MODE 15 · PHYSICAL HOLOGRAPHIC PRESENCE", "loc": "EMBAYMENT",
        "action": "In the projection bay a four-faced glass pyramid on a black pedestal beams a small translucent volumetric figure of her - about thirty centimetres tall, cyan with a fine scanline shimmer - standing mid-gesture above the pyramid; the dark bay shows through her translucent body.",
        "emotion": "Composed presence - reporting for external view. No special performance for the hologram.",
        "camera": "35 mm medium on the pedestal: the pyramid, the projector beams rising through haze, and the small luminous figure above.",
        "lighting": "Projector beams and the hologram itself light the pedestal and floor; one floating label - EMBODIMENT LINK: ACTIVE.",
        "environment": "Embodiment and Projection, east-south.",
        "visible": "The sync label - EMBODIMENT LINK: ACTIVE - the device name, and layout controls (mirror, rotate, multi-face).",
        "owner": "Rotate, mirror or arrange multi-face layouts; the volume follows speech, scenarios and video in real time.",
        "transitions": "IN: the volume fades up. OUT: the owner returns to desktop; the volume dims - the live instance continues regardless.",
        "systems": "device adapter (hologram) · live mirror output · Pepper's-Ghost composition · sync",
    },
]

# ----------------------------------------------------------------------------
# Chapter 5 - Motion and Technical Plan
# ----------------------------------------------------------------------------
CH5_INTRO = (
    "This chapter defines how the storyboard becomes motion: the animation architecture, the "
    "controller and camera systems, and the mapping from every frame to the systems that "
    "realise it. Two principles govern everything: motion is task-linked (she moves because "
    "there is a reason) and motion is honest (no working animation without work, no ambient "
    "wander without purpose)."
)

CH5_SECTIONS = [
    ("5.1  Idle behaviour", [
        "Idle is layered micro-motion, not a loop: a four-second breathing cycle, weight "
        "shifts every eight to fifteen seconds, and glances tied to real stimuli - alerts, "
        "agent messages, owner movement. Waiting with quiet awareness is an authored state "
        "with entry and exit transitions, never a frozen A-pose and never a fidget reel.",
    ]),
    ("5.2  Walk and run cycles", [
        "In-place clips with procedural root motion drive a blend space over speed (0-4 m/s) "
        "and heading (-180 to 180 degrees). Walk targets 1.3 m/s and run 3.25 m/s - the "
        "values already implemented in the repository controller, adopted here as the "
        "contractual targets. Cycles are distance-matched - cycle length scales with speed - "
        "so the feet never skate, and foot IK with ground snap keeps contact honest on the "
        "raised floor and dais steps.",
    ]),
    ("5.3  Start, stop and turn transitions", [
        "Three-step acceleration (about 0.35 s), plant-stop with weight settle (about 0.4 s), "
        "and turn-in-place above thirty degrees of heading error with the head leading the "
        "body. Directional starts (forward, side, back steps) come from the locomotion set; "
        "blend times sit in the 0.2-0.3 s band so state changes read as intention, not as "
        "morphing.",
    ]),
    ("5.4  Gaze and gesture layering", [
        "A priority stack governs attention: task, then owner address, then speech beat, then "
        "ambient. Eyes lead; the head follows beyond twenty degrees; the chest beyond "
        "forty-five; the body reorients only when locomotion or a real conversational "
        "opening demands it. Gestures are an additive upper-body layer over locomotion with "
        "a hard budget - at most one emphasis gesture per clause and rest between - and "
        "pointing or presenting is authored with IK targets at world objects, never waved "
        "vaguely at the air.",
    ]),
    ("5.5  Console interaction", [
        "Every console, vitrine and wall is an interactable with authored hand and eye "
        "targets. The controller moves through approach, alignment, lean and engage states "
        "using two-bone IK and a hand-pose library. The binding is strict: engagement "
        "animations play only while a genuine task holds the character there, and the "
        "interface state she touches is the real state of the system behind it.",
    ]),
    ("5.6  Interruption and task resumption", [
        "An activity stack with a blackboard holds (location, phase, interface state) for "
        "every interruptible action. Owner address preempts speech and motion; an interrupt "
        "token saves the task; resume returns her to the nearest valid state - the same "
        "console, the same panel, the same sentence clause where possible. Nothing is lost "
        "and nothing is faked on restart.",
    ]),
    ("5.7  Camera follow and reframing", [
        "Each mode carries a camera contract: conversation holds a 35 mm two-shot; follow "
        "uses a 50 mm trailing dolly; console work takes a 65 mm over-shoulder; presentation "
        "a 40 mm from the owner's seat; alerts a 28 mm low wide. Movement runs on damped "
        "springs, a spherecast pulls the camera in front of walls, headroom is enforced, and "
        "framing re-targets automatically when JARVIS relocates. The owner can unlock any "
        "camera for inspection. No orbiting, no drift, no shake, no sexualising angles.",
    ]),
    ("5.8  Scenario playback", [
        "The scenario director executes a structured scenario format: timeline, assets and "
        "actors, animation, camera and narration cues, labels and annotations, variables and "
        "branches. Playback supports play, pause, scrub, replay and speed, with save and "
        "load for every scenario. Construction takes a world snapshot through a spawn "
        "registry and dirty-state diff, so restoration after a scenario is exact. Scenarios "
        "are labelled truthfully as illustration, data-driven simulation, source-backed "
        "reconstruction or speculative visualisation.",
    ]),
    ("5.9  Video controls", [
        "The media service runs a spatial player on the screening wall: play, pause, seek, "
        "frame-step and stop; captions when present; frame extraction into memory; "
        "timestamp-linked commentary; A-B clip comparison; and the 2D-to-3D handoff that "
        "carries a paused frame into a live scenario. Scenario recording and optional FFmpeg "
        "export run where the backend is genuinely configured, and a replaceable "
        "video-generation adapter exists only for real configured services - never a "
        "placeholder pretending to be one.",
    ]),
    ("5.10  Conversation DNA - how she actually talks", [
        "Her speech follows rules extracted from a scene-by-scene study of the Tony Stark / "
        "JARVIS and FRIDAY exchanges in the films - the behaviour the owner asked to be "
        "recreated, not a chatbot register. The rules are behavioural contracts, each "
        "implemented in the conversation directive layer: <b>(1) Execute first, then add the "
        "unrequested insight</b> - \"Pull up exploded view\" is executed before JARVIS adds "
        "\"The compression in cylinder 3 appears to be low\"; she never asks which object or "
        "which view when context decides. <b>(2) Probabilistic honesty</b> - \"appears to be\", "
        "\"no record of\"; she never converts uncertainty into confident-sounding answers, "
        "matching the epistemic memory statuses (hypothesis vs verified fact) already "
        "enforced by CORE. <b>(3) Push back while executing</b> - \"Sir, there are still "
        "terabytes of calculations needed before an actual flight\" is delivered while the "
        "command is already running; she warns with reasons, the owner always decides. "
        "<b>(4) Interrupt only when it matters</b> - the fatal-ice rule: she initiates speech "
        "on high-risk or high-value triggers only, never for decoration. <b>(5) Dry wit "
        "earned from long memory</b> - \"What was I thinking? You're usually so discreet\" "
        "works only because shared history exists; humour draws on remembered facts, never "
        "on generic jokes. <b>(6) Persistent-but-respectful alerts</b> - when told \"stop "
        "telling me\", JARVIS goes quiet but keeps the number on screen; she downgrades the "
        "channel, not the vigilance. <b>(7) Information instead of fake estimates</b> - asked "
        "a judgement question, JARVIS answers with the status that matters (\"The suit's at "
        "48% power and falling\") rather than inventing a prediction. <b>(8) Register</b> - "
        "warm, precise, unhurried; the optional familiar address (FRIDAY's \"Boss\") is "
        "decision D6.",
    ]),
    ("5.11  Reduced-motion behaviour", [
        "A global reduced-motion profile replaces moves with cuts, freezes ambient drift, "
        "stills the guide lines and slows their pulse, reduces gesture scale, and offers "
        "storyboard-step playback for scenarios. Every camera contract has a static "
        "equivalent, and nothing in the experience requires motion to be understood.",
    ]),
]

CH5_MAPPING = {
    "caption": "Table 5.1 - Storyboard-to-systems mapping matrix (abbreviated; full matrix maintained with the build)",
    "header": ["Frame", "Renderer and animation", "Navigation and controller", "Scenario / media", "CORE services"],
    "widths": [0.09, 0.235, 0.235, 0.22, 0.22],
    "rows": [
        ["01", "Cold-start pass; silhouette walk-in", "Spine route; navmesh online", "-", "Boot truth; owner auth; event bus"],
        ["02", "Idle layers; glance system", "Ambient positioning", "Plan-wall surface", "Task scheduler; goals read"],
        ["03", "Walk blend space; follow dolly", "Spine route; obstacle avoid", "-", "Queued task context"],
        ["04", "Plant-turn; gaze lock", "Stop-and-turn state machine", "-", "Conversation intake; interruption"],
        ["05", "Listening pose; gesture budget", "Conversational anchor", "Context cards", "Conversation CORE; memory write"],
        ["06", "Console lean; hand IK", "Interactable alignment", "Console surface", "Tools; diagnostics; telemetry"],
        ["07", "Run state; zone relight", "Alert route; priority pathing", "-", "Alert bus; security service"],
        ["08", "Hover reach; slow tempo set", "Vault interactable", "Vitrine surface", "Memory (recall, pin, forget)"],
        ["09", "Touch pose; wall gesture", "Plan-wall interactable", "Timeline plates", "Goals; approval; audit"],
        ["10", "Conducting gestures; plate glances", "Round positioning", "Presence plates", "Agent coordinator; synthesis"],
        ["11", "Trace gesture; lean-in", "Carrel interactable", "Source wall", "Research; provenance; evidence"],
        ["12", "Walk-along model; narration sync", "Stage route at model edge", "Scenario playback", "Simulation; truth labels"],
        ["13", "Pull-from-palette; satisfaction beat", "Stage free-move", "Scenario authoring; snapshot", "Scenario director"],
        ["14", "Blocking gestures; actor direction", "Stage free-move", "Actors; camera markers", "Scenario director; annotations"],
        ["15", "Pause gesture; beside-screen stance", "Screening platform", "Spatial player; extraction", "Media service; memory link"],
        ["16", "Lean-in; monitor gaze", "Security arc position", "Monitor wall", "Vision; security; authorization"],
        ["17", "Cartridge seat; status glance", "Bridge interactable", "-", "Inference workers; profile vault"],
        ["18", "Stand-back ready pose", "Owner console zone", "-", "Seven owner switches; effects bus"],
        ["19", "Mobile idle; direct address", "Same state, mobile frame", "Condensed status rail", "Device adapter; state sync"],
        ["20", "Live mirror output; sync", "Embayment platform", "Projection surface", "Device adapter; hologram sync"],
    ],
}

# ----------------------------------------------------------------------------
# Chapter 6 - Architecture and Implementation Sequence
# ----------------------------------------------------------------------------
CH6_INTRO = (
    "Revision 2 changes the shape of this chapter: the architecture described below is no "
    "longer only planned - it exists in the repository (Chapter 1), implemented end to end "
    "by FastAPI CORE, a Three.js world, and a private inference worker. The architecture "
    "principles stand unchanged: what should survive - identity, memory, goals, "
    "orchestration - stays independent from what will improve - renderer, animation "
    "fidelity, inference hardware. PostgreSQL (pgvector where available) in production, "
    "SQLite only for development and tests; WebSockets carry live state; secrets are "
    "encrypted server-side and tokens never appear in Git, JavaScript, localStorage or "
    "sessionStorage. The renderer is browser-first Three.js over WebGL2 driving the rigged "
    "GLTF character; Unreal/MetaHuman remains an optional higher-fidelity adapter from "
    "Milestone 4, and the hologram is simply another device surface rendering the same live "
    "instance. What changes is the sequence: milestones become verification and completion "
    "gates over the existing implementation, preceded by one new gate - M0.5, aligning the "
    "shipped character's appearance to the owner-approved identity baseline in Chapter 2."
)

CH6_MODULES = {
    "caption": "Table 6.1 - CORE module register",
    "header": ["Module", "Responsibility"],
    "widths": [0.30, 0.70],
    "rows": [
        ["Orchestration", "Central coordination, activity stack, mode transitions, event bus"],
        ["Identity and personality", "Persistent persona parameters; the model is an interchangeable reasoning engine, never the identity"],
        ["Conversation", "Streaming dialogue state, interruption handling, context assembly"],
        ["Memory", "Owner facts, preferences, context, commitments, projects, tool history, agent findings, research, media, sensitive - with retrieval, inspection, correction and forgetting"],
        ["Goals and scheduling", "Priorities, dependencies, schedules, progress, pause/resume/cancel, auditable actions"],
        ["Agent coordination", "Roles, explicit tools, permission boundaries, observable state, traceable outputs, cancellation"],
        ["Tools and permissions", "Scopes, validation, allowlists, timeouts, audit, confirmation for destructive actions"],
        ["Voice and vision", "Real transcription and speech adapters; explicit-activation vision; honest capture state"],
        ["Research and simulation", "Source-backed research with provenance; labelled simulation and comparison"],
        ["Scenario direction", "Scenario format, timeline, actors, annotations, variables, branches, snapshot and restore"],
        ["Media services", "Spatial playback, frame extraction, timestamp commentary, recording and export adapters"],
        ["Security and telemetry", "Defensive monitoring, evidence chains, health and utilisation truth"],
        ["Inference", "Local and Kaggle workers, capability reporting, streaming, cancellation, honest errors"],
        ["Connections", "Authenticated worker links, encrypted profiles, heartbeats, disconnect handling"],
        ["Character and world state", "Single authoritative character and scene state shared by every surface"],
        ["Device adapters", "Desktop, mobile, optional MetaHuman, holographic projection - all views of one instance"],
    ],
}

CH6_INFERENCE = [
    ("6.2  Inference workers", [
        "One shared private worker design serves both required backends: the local PC and a "
        "private Kaggle GPU session. The default model is "
        "huihui-ai/Qwen2.5-14B-Instruct-abliterated, replaceable by configuration, loaded "
        "hardware-aware with 4-bit CUDA quantisation where supported. The worker reports "
        "capabilities, streams, cancels cleanly, and shows real download and loading states - "
        "or honest errors. The Kaggle worker connects out over an authenticated WebSocket "
        "using JARVIS_WORKER_TOKEN from Kaggle Secrets, opens no public inference port, "
        "ships as a guided notebook package, and reports its true quota and session limits. "
        "CORE prefers a healthy local worker. Profile management lives in the spatial Kaggle "
        "modal: six or more named profiles, masked identifiers, server-side encrypted "
        "credentials, genuine authentication tests, real status.",
    ]),
]

CH6_MILESTONES = {
    "caption": "Table 6.2 - Gates over the existing implementation (M1-M4 already coded; each gate is verification and completion, not greenfield)",
    "header": ["Gate", "Scope", "Not complete until"],
    "widths": [0.16, 0.44, 0.40],
    "rows": [
        ["M0.5 - Identity alignment (new)", "Align the shipped 3D character's wardrobe and appearance to the owner-approved anchor (Chapter 2): garment/material update or Avaturn regeneration of the existing 66-bone rig; license hygiene (retargeter header, written Avaturn terms); replace the repo's superseded pre-production plates",
         "The rendered character reads as the same woman as the approved anchor and every storyboard frame, and license confirmations are on file"],
        ["M1 - Living character and world (coded; verify)", "Twelve-zone world, rigged character, locomotion, navigation, console interaction, cameras, lighting, CORE APIs, memory and goal foundations, seven owner switches",
         "Owner-environment run: she visibly walks, runs, turns, stops, faces the owner and performs coherent interactions, captured as evidence"],
        ["M2 - Intelligence and performance (coded; verify)", "Local and Kaggle inference, encrypted profiles, streaming and cancellation, voice, facial animation and lip-sync, task-linked movement, persistent conversations",
         "A streamed, interruptible conversation with synchronised facial animation over a real GPU worker"],
        ["M3 - Autonomy and demonstration (coded; verify)", "Autonomous goals, agents, guarded tools, research, simulations, scenario direction, video playback and export where supported, security, telemetry",
         "She constructs, directs, branches and restores a full scenario, and presents a paused video with a 2D-to-3D handoff"],
        ["M4 - Shared embodiment (coded; verify and harden)", "Mobile companion, backup and restore, device adapters, optional MetaHuman, holographic projection, production hardening and deployment",
         "Phone and hologram render the same live instance in sync with speech, motion and scenarios, and a production deployment runbook passes a restore drill"],
    ],
}

CH6_PROTOCOL = [
    ("6.3  Verification protocol (every milestone)", [
        "Backend and rendered experience are implemented together; automated tests and syntax "
        "and regression checks run before anything else; the application is started and its "
        "actual rendered output is inspected; locomotion, cameras, interactions and controls "
        "are exercised by hand; meaningful visual evidence is captured; defects are "
        "corrected rather than documented; verified capabilities and external limitations "
        "are recorded in an honest capabilities register; and commits happen only after "
        "verification. Nothing is claimed tested that was not tested - Kaggle, GPU "
        "inference, model downloads, Supabase, local hardware, Unreal and MetaHuman, "
        "holograms, video generation and iOS signing are all unverified until a milestone "
        "says otherwise in writing.",
    ]),
]

# ----------------------------------------------------------------------------
# Chapter 7 - Approval Gate
# ----------------------------------------------------------------------------
CH7_INTRO = (
    "Phase Zero stops here. Nothing below is placeholder; every item above is proposed in "
    "good faith and buildable as specified. Please approve or correct each item - approval "
    "locks this package as the visual and behavioural baseline, and any material deviation "
    "from it during implementation will be shown to you before it is adopted."
)

CH7_APPROVALS = [
    ("A1 - Character appearance", "Chapter 2 with the concept plates: adult presentation, face, hair, wardrobe, materials, proportions."),
    ("A2 - Environment", "Chapter 3 with the floor plan and environment plates: the Nexus, its twelve areas, lighting, materials, navigation."),
    ("A3 - Storyboard", "Chapter 4: all twenty frames as composed, or with the amendments you list."),
    ("A4 - Character behaviour", "Chapters 2 and 5: expressions, poses, restraint rules, interruption and resumption behaviour."),
    ("A5 - Camera and lighting", "Per-frame camera and lighting direction plus the camera contracts in Section 5.7."),
    ("A6 - Scenario and video presentation", "Frames 12-15 with Sections 5.8 and 5.9: construction, direction, playback, truth labels, video controls, 2D-to-3D handoff."),
    ("A7 - Implementation sequence", "Chapter 6: architecture, inference plan, milestones M1-M4 and the verification protocol."),
]

CH7_DECISIONS = [
    ("D1 - Renderer foundation", "Option A: browser-first Three.js with the licensed GLTF character (recommended - cross-platform, hologram-ready, fastest to a living M1). Option B: Unreal-first with MetaHuman (maximum fidelity, PC-bound, slower). Option C: hybrid - browser now, Unreal as an optional M4 adapter (recommended path; A is how it starts)."),
    ("D2 - Character asset source", "Option A (recommended): keep the existing repository rig (66 bones, 72 morph targets, working Mixamo retargeting and lip-sync) and align its wardrobe and appearance to the approved anchor via garment/material update or Avaturn regeneration - fastest path to the locked identity on a proven skeleton. Option B: replace with a Reallusion CC4/ActorCore digital human. Option C: MetaHuman as primary (higher face fidelity, heavier pipeline, M4)."),
    ("D3 - Wardrobe variants", "Charcoal duty suit as drawn (baseline), with or without the formal drape-coat variant for presentation moments. Recommendation: both states, duty suit default."),
    ("D4 - Voice direction (M2)", "A warm, measured alto is proposed as the default speaking profile; shortlist samples will be presented at Milestone 2 selection, and the adapter stays replaceable."),
    ("D5 - Storyboard amendments", "Any frame you want re-composed - list frame numbers and the change; amended frames return for review before the baseline locks."),
    ("D6 - Address register (new)", "How she addresses the owner: formal courtesy (JARVIS register, recommended default), the familiar FRIDAY-style \"Boss\", or the owner's chosen name. The register is a personality parameter, changeable at any time without touching identity."),
]

CH7_CLOSE = (
    "On approval, gate M0.5 begins against this baseline: the shipped character aligned to "
    "the approved identity, license hygiene closed, then owner-environment verification of "
    "the existing M1-M4 implementation gate by gate. Until then, no application code is "
    "written and the repository is left untouched. The Phase Zero artifacts - this document, "
    "the twenty identity-locked frames, the anchor and proof set, and the floor plan - live "
    "in download/jarvis-nexus-preproduction/ for your review at full resolution."
)

CH7_ARTIFACTS = {
    "caption": "Table 7.1 - Phase Zero artifact manifest, revision 2 (all under download/jarvis-nexus-preproduction/)",
    "header": ["Artifact", "Contents"],
    "widths": [0.42, 0.58],
    "rows": [
        ["JARVIS-NEXUS_PreProduction_Package_v2.pdf", "This package - revised inspection report, locked character direction, identity-locked storyboard, technical plan, approval gate"],
        ["storyboard_locked/ (20 files)", "The final identity-locked storyboard (1344 x 768), every frame a controlled edit of the approved anchor and every frame passed by the independent vision-model audit; numbered to match Chapter 4 and the mapping matrix"],
        ["v2_proof/ (7 files)", "The owner-approved identity anchor, the locked full-length character sheet, the face study and the four proof frames that established the pipeline"],
        ["concepts/ (v2 environment plates)", "Pure-environment plates for Chapter 3, edited from the owner's environment reference - no people, no text"],
        ["frames/, concepts v1, storyboard_v2/ (superseded)", "First-revision and intermediate assets, retained for traceability of the direction change"],
        ["build/floorplan.png (+ HTML source)", "The Nexus operations floor plan at print resolution, with editable HTML source alongside"],
        ["build/cover.html, build/cover.pdf", "Editable HTML source and rendered cover, for future revision without a rebuild"],
    ],
}
