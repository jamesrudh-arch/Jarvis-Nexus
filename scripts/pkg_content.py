#!/usr/bin/env python3
"""JARVIS NEXUS pre-production package - content module.

All narrative content for the seven chapters. Kept separate from the
ReportLab build so text edits never touch layout code.
Frame captions carry the eight mandatory direction fields.
"""

DOC_TITLE = "JARVIS NEXUS - Pre-Production Package"
DOC_SUBTITLE = "Phase Zero - Inspection, Character and Environment Direction, Visual Storyboard, Technical Plan"

# ----------------------------------------------------------------------------
# Chapter 1 - Repository Inspection Report
# ----------------------------------------------------------------------------
CH1_INTRO = (
    "This chapter reports the state of the connected repository exactly as found, before any "
    "production work began. The inspection was read-only: no files were deleted, overwritten or "
    "reinitialised, no commits or pushes were made, no application source was modified and no "
    "dependencies were installed. The only artifacts created during Phase Zero are the "
    "pre-production documents and storyboard assets delivered alongside this package."
)

CH1_SECTIONS = [
    ("1.1  What the repository contains", [
        "The workspace is a Git repository on branch <b>main</b> with a single commit, "
        "<b>d14bcd0 \"Initial commit\"</b> (10 November 2026). The working tree is clean and "
        "contains exactly three tracked files. No remote URL is configured at the Git level; the "
        "GitHub connection exists at the platform level rather than as an origin remote. The "
        "repository is therefore a scaffold, not an application.",
    ]),
    ("1.2  What is already functional", [
        "Nothing. There is no application source, no package manifest, no build tooling, no "
        "tests, no CI, no documentation and no assets. The scaffold boots nothing and renders "
        "nothing. This is a clean start, and it is reported as such rather than dressed up.",
    ]),
    ("1.3  What can be retained", [
        "The repository skeleton itself, its (trivial) history, and the directory conventions "
        "already in place. Two implicit decisions are worth retaining because they align with "
        "the product brief: the ignore rules anticipate a Node-based toolchain at the repository "
        "root, which is consistent with a browser-delivered real-time 3D front end, and the "
        "environment file declares a <b>DATABASE_URL</b> key, which signals persistent storage "
        "intent matching the production PostgreSQL requirement. Nothing needs to be migrated, "
        "merged or refactored before Milestone 1 begins.",
    ]),
    ("1.4  What is missing", [
        "Everything the product requires: the CORE backend (orchestration, memory, goals, "
        "agents, tools, inference), the real-time 3D renderer and world, the character asset "
        "and animation pipeline, the inference workers for local and Kaggle backends, database "
        "migrations, environment templates, README, CI and tests. The gap between the current "
        "scaffold and Milestone 1 is a full greenfield build, and the implementation sequence "
        "in Chapter 6 is planned accordingly.",
    ]),
    ("1.5  Existing architectural and design decisions", [
        "No explicit decisions exist - no code, no config beyond the ignore rules, no "
        "documentation. Three implicit signals are recorded above (monorepo root, Node "
        "toolchain expectation, database intent). No prior art-direction, naming, dependency "
        "or licensing decisions constrain this package; the visual and behavioural baseline "
        "therefore starts from this document once approved.",
    ]),
    ("1.6  Technical, licensing and asset constraints", [
        "Because no third-party code exists in the repository, there are no inherited licensing "
        "obligations. Asset licensing starts from zero and the register in Chapter 2 applies: "
        "properly licensed character, animation and environment assets only; nothing ripped, "
        "scraped or uncredited will ever ship. One hygiene defect must be flagged now: "
        "<b>the .env file is tracked in Git.</b> It currently holds only a placeholder "
        "DATABASE_URL key, but tracked environment files are a secrets-management defect. The "
        "Milestone 1 plan replaces it with a committed .env.example plus a Git-ignored .env, "
        "and any value ever committed to any branch must be rotated. No repository change is "
        "made during Phase Zero, per the inspection rules.",
        "Constraints inherited from the product brief and binding on all milestones: no "
        "Ollama or commercial AI API may be required (they may exist as optional adapters); "
        "MetaHuman is optional, never a prerequisite; holographic output must be a live view "
        "of the running application; inference, metrics, agent work and test results are never "
        "fabricated.",
    ]),
]

CH1_TABLE = {
    "caption": "Table 1.1 - Tracked repository contents and assessment",
    "header": ["Path", "Content", "Assessment"],
    "widths": [0.16, 0.36, 0.48],
    "rows": [
        [".env", "One line: DATABASE_URL key (value not inspected or printed)",
         "Placeholder only; should become .env.example with .env Git-ignored at M1"],
        [".gitignore", "Ignores skills/ and node_modules/",
         "Retain; signals expected Node toolchain at repo root"],
        ["download/README.md", "One-line workspace placeholder",
         "Harmless; superseded by real project README at M1"],
    ],
}

CH1_CALLOUT = ("1 commit  ·  3 tracked files  ·  0 functional components  ·  0 licensing obligations inherited",
               "Repository state at Phase Zero inspection - a clean scaffold")

# ----------------------------------------------------------------------------
# Chapter 2 - Character Direction
# ----------------------------------------------------------------------------
CH2_INTRO = (
    "JARVIS is an adult female intelligence with a poised, perceptive, professional presence. "
    "The direction below is written to be buildable: every visual trait maps to a licensed "
    "asset pipeline, a rig feature or an animation system listed in Chapter 5. The concept "
    "plates in this chapter are AI-assisted studies that fix silhouette, wardrobe language, "
    "materials and attitude; the shipped character comes from the licensed pipelines in "
    "Section 2.11, not from these images."
)

CH2_SECTIONS = [
    ("2.1  Age presentation and physical realism", [
        "JARVIS presents as a woman of about thirty-six. Maturity is carried by structure, not "
        "decoration: a defined jaw line, mature brow-to-chin proportions, natural cheek planes, "
        "and skin that behaves like skin - three-layer subsurface scattering, visible pores, "
        "faint under-eye shading and subtle asymmetric imperfections. She is never neotenous, "
        "doll-like or plastic. Her body carries believable weight: mass transfers through the "
        "hips on turns, strides load the knees, and cloth and hair react to real velocity. "
        "Resting expression is calm attentiveness - emphatically not a smile.",
    ]),
    ("2.2  Face and hair", [
        "The face is an oval with a balanced, defined jaw; straight, slightly full brows; "
        "grey eyes with true corneal specular; medium-full lips held closed and neutral at "
        "rest. Hair is near-black with a cool brown sheen, mid-length, secured in a low clasp "
        "that keeps the face fully visible, with a few loose strands for realism. Hair is "
        "shaded anisotropically and moves with physically plausible inertia - no billboard "
        "sheets, no helmet shine.",
    ]),
    ("2.3  Wardrobe", [
        "The baseline is the <b>Nexus duty suit</b>: a tailored matte-charcoal jacket in "
        "technical twill with quietly structural seams, over a dark fine-knit underlayer, with "
        "slim graphite trousers and low practical boots. A single earpiece with a tiny, "
        "honestly-driven status dot is the only jewellery. A formal variant adds an "
        "unstructured drape coat for presentation moments. There is no armour, no catsuit, no "
        "lingerie styling, no science-fiction costume cliches - her wardrobe would not look "
        "out of place in a serious operations centre, which is exactly the point.",
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
    ("2.6  Facial animation and lip-sync approach", [
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
    "caption": "Table 2.3 - Proposed licensed asset pipeline (verified at acquisition; nothing unlicensed ships)",
    "header": ["Layer", "Proposed source", "Licence basis", "Role"],
    "widths": [0.15, 0.30, 0.25, 0.30],
    "rows": [
        ["Character (M1 primary)", "Reallusion Character Creator 4 + ActorCore digital human",
         "Reallusion content licence (commercial)", "Rigged adult female, ARKit-compatible facial shapes, GLTF export to the web renderer"],
        ["Character (M4 optional)", "Epic MetaHuman",
         "MetaHuman EULA (free)", "Optional higher-fidelity body for the existing NPC - never a prerequisite"],
        ["Locomotion", "ActorCore mocap locomotion sets (idle, walk, run, start, stop, turn-in-place)",
         "Reallusion content licence", "Blend-space clips with authored transitions"],
        ["Gestures and interaction", "Mixamo library + bespoke keyframe (Blender)",
         "Adobe Terms (free for interactive use; no raw redistribution) + project-owned IP", "Gestures, console and presentation sets"],
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
    "Twenty frames, one per page. Each frame is an individually composed concept study that "
    "fixes action, emotion, camera, lighting, environment, visible information, owner "
    "interaction and transitions. The images define composition and intent; the shipped "
    "character and world come from the licensed pipelines in Chapter 2 and the architecture "
    "in Chapter 3. Frames are numbered to match the mapping matrix in Chapter 5, and each "
    "carries the operational mode it serves."
)

FRAMES = [
    {
        "num": "01", "title": "FIRST WAKE", "img": "frames/f01_first_wake.png",
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
        "num": "02", "title": "NORMAL LIVING PRESENCE", "img": "frames/f02_living_presence.png",
        "mode": "MODE 2 · LIVING PRESENCE", "loc": "PLAN WALL",
        "action": "Unaddressed background work: reviewing project plates at the Plan Wall, mid-annotation. She glances up as the owner's presence engages.",
        "emotion": "Quiet attentiveness; mild recognition (brow-raise trace). No broad smile, no greeting performance.",
        "camera": "50 mm medium-long from the hub axis; body three-quarters to the wall; the head turn completes as the camera settles.",
        "lighting": "Warm 3000 K task pool over the wall against cool ambient; face fully readable with a soft 3/4 key.",
        "environment": "Plan Wall, centre-north; hub ring glow behind camera.",
        "visible": "Three or four project plates with statuses (in progress / scheduled / blocked), a next-action line, one amber dependency.",
        "owner": "Passive. She acknowledges with a brief glance and a single line; the owner may open conversation.",
        "transitions": "IN: cut. OUT: dolly-with as she steps away toward the Hub on a queued task.",
        "systems": "ambient task scheduler · plan-wall surface · presence glance system",
    },
    {
        "num": "03", "title": "WALKING TOWARD CENTRAL OPERATIONS", "img": "frames/f03_walk_to_hub.png",
        "mode": "MODE 2 · LIVING PRESENCE", "loc": "THE SPINE",
        "action": "Purposeful walk at 1.2 m/s along the Spine toward the Hub; earpiece dot amber (task queued); arm swing natural, stride matched to distance.",
        "emotion": "Neutral purpose; baseline face. Moving because there is a reason, never pacing for effect.",
        "camera": "Tracking dolly, 50 mm, trailing three-quarter rear at 2.5 m with a slight low bias; stabilised, no drift.",
        "lighting": "Guide lines beneath, intermittent ceiling apertures casting soft pools; passing consoles as cool rim sources.",
        "environment": "The Spine, west to east.",
        "visible": "Floor guide line to the Hub; one task chip (compiling morning digest). Nothing else competes for attention.",
        "owner": "The owner may hail at any time; she transitions into a stop-and-plant-turn.",
        "transitions": "IN: from Frame 02 follow-on or cut. OUT: match-move into Hub arrival as the camera re-frames on deceleration.",
        "systems": "locomotion blend space · navmesh spine route · follow-camera dolly",
    },
    {
        "num": "04", "title": "TURNING TO ACKNOWLEDGE ME", "img": "frames/f04_turn_acknowledge.png",
        "mode": "MODE 3 · CONVERSATIONAL FOCUS", "loc": "HUB EDGE",
        "action": "Addressed mid-stride: deceleration, plant-turn of roughly 120 degrees in place. Head leads, eyes lock the owner camera, weight settles.",
        "emotion": "Attentive recognition; a micro brow-raise; mouth neutral and ready to speak.",
        "camera": "Owner point of view, 40 mm at eye height, medium-close. Her turn ends exactly on the camera axis.",
        "lighting": "Hub ring key overhead, soft; cyan rim from the console behind her; face fully readable.",
        "environment": "Hub edge; consoles idle-cool around her.",
        "visible": "Deliberately minimal - one status chip dissolves; her attention is the information.",
        "owner": "Full. She is listening; voice and text input are live; she remains interruptible throughout.",
        "transitions": "IN: cut on the hail. OUT: settles into the conversational two-shot (Frame 05).",
        "systems": "plant-turn state · gaze lock · conversation intake · interruption manager",
    },
    {
        "num": "05", "title": "CONVERSATIONAL FOCUS", "img": "frames/f05_conversational_focus.png",
        "mode": "MODE 3 · CONVERSATIONAL FOCUS", "loc": "HUB · CONVERSATION ZONE",
        "action": "Two-way exchange. She holds still; measured hand gestures on key phrases only; no pacing, no nod-per-sentence, no frozen smile.",
        "emotion": "Engaged listening: a four-degree head tilt, sustained gaze, slow blink cadence.",
        "camera": "Static two-shot profile, 65 mm over the owner's shoulder; her face in full light, the owner's presence implied foreground-left.",
        "lighting": "Soft key from displays; warm practical behind the owner's shoulder; balanced contrast on her face.",
        "environment": "Hub conversational zone, standing.",
        "visible": "One contextual card at the frame edge (current project); the conversation stream stays minimal.",
        "owner": "Text, voice or image input; interruption is always honoured mid-word or mid-step.",
        "transitions": "IN: from Frame 04. OUT: on \"let me show you\", she turns toward the relevant zone and the camera pans with her.",
        "systems": "gesture budget · listening pose set · conversation CORE · context cards",
    },
    {
        "num": "06", "title": "WORKING AT A CONSOLE", "img": "frames/f06_console_work.png",
        "mode": "MODES 7/12 · TOOLS & TELEMETRY", "loc": "HUB CONSOLE CLUSTER",
        "action": "A diagnostic task at a curved console: hands on holo-panels, hinged-lean stance, periodic glance up to camera and back to work.",
        "emotion": "Focused: brow lowered, extended blink interval, jaw set. Working because work exists.",
        "camera": "65 mm over-shoulder, high three-quarter; hands and profile face both readable.",
        "lighting": "Console glow as practical key from below-front; hair light from above; cool bias that keeps the face legible.",
        "environment": "Hub console cluster.",
        "visible": "Diagnostic tree, telemetry traces, one amber-flagged node under investigation.",
        "owner": "Optional orbit and inspect camera unlock; she stays in flow unless addressed.",
        "transitions": "IN: cut from task dispatch. OUT: alert intrusion (Frame 07) or a task-complete acknowledgment.",
        "systems": "console interactable IK · task animator · diagnostics service · telemetry stream",
    },
    {
        "num": "07", "title": "URGENT MOVEMENT DURING AN ALERT", "img": "frames/f07_urgent_alert.png",
        "mode": "MODE 11 · DEFENSIVE SECURITY", "loc": "SPINE MID-ROUTE",
        "action": "A priority alert interrupts console work. She pushes off into a run at 3.5 m/s toward Security; stride extension, jacket edge lifting.",
        "emotion": "Measured urgency: lids wide and tight, jaw set - controlled, never panicked.",
        "camera": "Low wide 28 mm from ahead of her path; steady, no shake; slight lens breathing only.",
        "lighting": "The zone relights amber; cyan suppressed to forty percent; red reserved for confirmed-critical.",
        "environment": "Spine mid-route, Hub to Security; the floor route line pulses amber.",
        "visible": "Alert chip - perimeter anomaly · sector 3 · two sources - plus the route line and a cancellation control.",
        "owner": "One-gesture cancel or redirect available; otherwise hands-off.",
        "transitions": "IN: hard cut on the alert (motivated). OUT: deceleration into the security arc (Frame 16 state).",
        "systems": "alert bus · locomotion run state · zone light director · route line · cancel control",
    },
    {
        "num": "08", "title": "MEMORY EXPLORATION", "img": "frames/f08_memory_archive.png",
        "mode": "MODE 4 · MEMORY", "loc": "MEMORY ARCHIVE",
        "action": "In the Vault her hand hovers over a vitrine; a memory plate surfaces in amber light. She reads provenance before using anything.",
        "emotion": "Reflective concentration; a slower tempo than anywhere else on the floor.",
        "camera": "85 mm medium-close; a foreground column creates a frame-within-frame; shallow but readable.",
        "lighting": "Warm amber vitrine glow as key; cool Spine spill from behind.",
        "environment": "Memory Archive, west wing.",
        "visible": "Vitrine tag (owner-provided · Nov 2025); provenance chips separating fact, preference and inference.",
        "owner": "Pin, correct or request forgetting; she asks before recategorising anything.",
        "transitions": "IN: slow push. OUT: she turns to camera with the finding; cut.",
        "systems": "memory service (recall/pin/forget) · vault surface · provenance chips",
    },
    {
        "num": "09", "title": "GOALS AND ONGOING WORK", "img": "frames/f09_goals_wall.png",
        "mode": "MODE 5 · GOALS & PROJECTS", "loc": "PLAN WALL",
        "action": "She touches a project plate; its timeline extends; dependency lines light. She proposes the next action and waits.",
        "emotion": "Confident clarity; a trace of conviction on the proposal - comfortable being disagreed with.",
        "camera": "40 mm profile medium; the wall's leading lines converge behind her.",
        "lighting": "The wall itself is the practical: soft ice-white line light; her key from wall bounce.",
        "environment": "Plan Wall, centre-north.",
        "visible": "Goals with priority, status and progress; a blocked dependency in amber; the proposed next action awaiting approval.",
        "owner": "Approve, reweight, pause or cancel with a word; the audit trail is one glance away.",
        "transitions": "IN: cut. OUT: pull-back to the full wall in owner survey mode.",
        "systems": "goals service (priority/status/audit) · plan-wall timeline · approval gate",
    },
    {
        "num": "10", "title": "MULTI-AGENT COLLABORATION", "img": "frames/f10_agent_collab.png",
        "mode": "MODE 6 · AGENTS", "loc": "THE ROUND",
        "action": "Five presence plates are active, one speaking (brighter). She conducts: a glance to the speaker, an open-hand pause to another, an assignment to a third.",
        "emotion": "Command calm; mild scrutiny on the conflicting finding.",
        "camera": "35 mm high three-quarter wide; she stands at the open end of the arc, plates arranged before her.",
        "lighting": "Cool plate pools on the table; her rim from the Spine behind.",
        "environment": "Agent Collaboration, centre-north.",
        "visible": "Agent role chips (RESEARCH / EXEC / WATCH / VERIFY / REPORT), task assignments, one conflicting finding flagged for adjudication.",
        "owner": "Listen in; promote or veto agent actions; request full transcripts.",
        "transitions": "IN: cut. OUT: she delegates, then turns to the owner with a synthesis line.",
        "systems": "agent coordinator (roles/permissions) · round presence plates · synthesis report",
    },
    {
        "num": "11", "title": "LIVE RESEARCH", "img": "frames/f11_live_research.png",
        "mode": "MODE 8 · RESEARCH", "loc": "RESEARCH LIBRARY",
        "action": "At a carrel she traces a citation link between two documents on the curved display and pins the stronger source.",
        "emotion": "Curiosity sharpening into interest; a slight forward lean.",
        "camera": "65 mm over-shoulder, tight; her finger, profile and both documents share the plane.",
        "lighting": "Warm 3000 K task pool key against cool screen fill - the classic warm/cool cross of the Library.",
        "environment": "Research, west wing.",
        "visible": "Source cards with provenance (origin, date, confidence); extraction highlights; a weak source visibly greyed and rejected.",
        "owner": "Ask for any source; reject evidence; steer the thread.",
        "transitions": "IN: cut. OUT: she lifts a source toward the Stage - a drag gesture into scenario construction.",
        "systems": "research service · source provenance · citation trace · evidence pinning",
    },
    {
        "num": "12", "title": "SIMULATION", "img": "frames/f12_simulation.png",
        "mode": "MODE 9 · SIMULATION", "loc": "SIMULATION STAGE",
        "action": "On the Stage a systems reconstruction stands as a lit three-dimensional structure; flow pulses trace paths through it while she walks its edge at human scale.",
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
        "num": "13", "title": "CONSTRUCTING A SCENARIO", "img": "frames/f13_scenario_build.png",
        "mode": "MODE 9 · SIMULATION", "loc": "SIMULATION STAGE",
        "action": "She builds a scenario on the empty stage: pulls a wireframe element from a floating palette; the scene assembles around her; a timeline strip builds at the floor edge.",
        "emotion": "Creative focus; one flick of quiet satisfaction as a piece snaps into place.",
        "camera": "40 mm three-quarter medium; assembly light-trails run between her hands and the growing scene.",
        "lighting": "Drafting state: dim blue working light; elements transition wireframe-to-solid as they are committed.",
        "environment": "Simulation Stage, pre-performance.",
        "visible": "Scenario outline chips appearing in sequence (system, flow, failure point); a truth label marking the piece as illustration; the timeline strip.",
        "owner": "Suggest elements live; insertion is immediate and reversible.",
        "transitions": "IN: cut. OUT: the scenario is set - the stage shifts to performance lighting (Frame 14).",
        "systems": "scenario director (authoring) · prop palette · timeline strip · world snapshot",
    },
    {
        "num": "14", "title": "DIRECTING A SCENARIO", "img": "frames/f14_scenario_direct.png",
        "mode": "MODE 9 · SIMULATION", "loc": "SIMULATION STAGE",
        "action": "She blocks two translucent scenario actors, repositions a prop and nudges a floating camera marker; annotation arrows draw across the floor.",
        "emotion": "A director's decisiveness; one beat of light humour when a prop misplaces itself.",
        "camera": "28 mm wide from a stage corner; the overhead grid is visible and the full stage reads.",
        "lighting": "Performance state; actors render as soft cyan translucent figures - clearly temporary, clearly not JARVIS.",
        "environment": "Simulation Stage, performance.",
        "visible": "Camera markers with shot numbers; actor cue lines; prop labels; an available director-view seat.",
        "owner": "Take the director's seat or watch; branch variables remain live.",
        "transitions": "IN: from Frame 13. OUT: \"from the top\" - playback begins, or the run is recorded.",
        "systems": "scenario director (blocking) · scenario actors · camera markers · annotations",
    },
    {
        "num": "15", "title": "PRESENTING AND PAUSING A VIDEO", "img": "frames/f15_video_present.png",
        "mode": "MODES 3/9 · MEDIA", "loc": "MEDIA & SCREENING",
        "action": "In the screening room a clip runs on the four-metre wall, now paused at a significant frame; her hand holds the pause; she stands beside the screen, never in front of it.",
        "emotion": "Pointed emphasis; her glance moves between the owner and the frame.",
        "camera": "40 mm from the owner's position; the screen and her profile both stay sharp.",
        "lighting": "The screen is the key source; the room dims to twenty percent; her face is edge-lit by screen spill.",
        "environment": "Media and Screening, east-north.",
        "visible": "Timeline scrubber, frame stamp, an annotation pinned to the frame region, and a \"show this in 3D\" link.",
        "owner": "Scrub, step frames, A-B compare two clips, approve frame extraction into a scenario.",
        "transitions": "IN: cut. OUT: she lifts the frame content toward the Stage - a 2D-to-3D handoff with a match dissolve.",
        "systems": "media service (spatial player) · frame extraction · timestamp commentary · 2D-to-3D handoff",
    },
    {
        "num": "16", "title": "VISION AND DEFENSIVE SECURITY", "img": "frames/f16_security.png",
        "mode": "MODES 10/11 · VISION & SECURITY", "loc": "SECURITY ARC",
        "action": "An anomaly trace crosses the monitors. She leans in, one hand on the console edge, and calls for the evidence chain before recommending anything.",
        "emotion": "Concerned vigilance; controlled breathing. Red appears only if the state is confirmed-critical.",
        "camera": "65 mm low profile across the console; the monitors' cool wash carries the frame.",
        "lighting": "Cool base with a single restrained red accent; her face lit by monitor spill.",
        "environment": "Defensive Security, centre-south.",
        "visible": "The anomaly trace, a two-source evidence chain, and a containment action queue awaiting owner authorization.",
        "owner": "Authorization gate for irreversible actions; request clarification; stand down.",
        "transitions": "IN: from Frame 07 arrival. OUT: resolution - the room cools back to cyan; she exhales and reports.",
        "systems": "vision adapter · security monitor · evidence chain · authorization gate",
    },
    {
        "num": "17", "title": "LOCAL / KAGGLE CONNECTION", "img": "frames/f17_compute_link.png",
        "mode": "MODE 13 · CONNECTIONS & COMPUTE", "loc": "COMPUTE BRIDGE",
        "action": "At the Bridge she seats a profile cartridge (a Kaggle profile) into the dock; a handshake light climbs; the panel shows honest download state.",
        "emotion": "Patient pragmatism; matter-of-fact about quotas and limits.",
        "camera": "65 mm tight on the bridge and her hands, her calm face above them in frame.",
        "lighting": "Bridge practical in cool tones; the status bar amber while synchronising, steady cyan when healthy.",
        "environment": "Compute and Connections, west-mid.",
        "visible": "Masked profile name (kaggle · masked), session and quota truth, model-load progress percent, worker heartbeat.",
        "owner": "Cancel, switch profiles, run a genuine authentication test, generate a worker package.",
        "transitions": "IN: cut. OUT: the worker is healthy - status settles cyan and she steps back toward the Hub.",
        "systems": "inference worker manager · Kaggle profile vault · honest status · heartbeat",
    },
    {
        "num": "18", "title": "OWNER POWER AND PRIVACY CONTROLS", "img": "frames/f18_owner_controls.png",
        "mode": "ALL MODES · OWNER AUTHORITY", "loc": "OWNER CONSOLE, HUB EDGE",
        "action": "Seven physical latching switches sit on the owner console; the Master is mid-toggle in this frame. She stands one pace back, hands loose - the owner's authority is the subject of the shot, not her.",
        "emotion": "Readiness without servility; neutral, supportive, unhurried.",
        "camera": "40 mm over the owner's shoulder; switches large and legible; she holds the frame edge in soft focus.",
        "lighting": "A warm key on the switch panel (the owner motif); visible zones of the room dim or settle per current states.",
        "environment": "Owner console at the Hub edge.",
        "visible": "Each switch labeled with its real state and live effects: Master, Microphone, Camera, Autonomy, Remote Compute, Computer Control, Embodiment.",
        "owner": "This frame is the interaction. Toggles change real behaviour - Master OFF visibly powers zones down around them.",
        "transitions": "IN: cut. OUT: the state settles; she acknowledges the new envelope with one line.",
        "systems": "owner switches service (seven) · live effects bus · privacy enforcement",
    },
    {
        "num": "19", "title": "MOBILE COMPANION", "img": "frames/f19_mobile.png",
        "mode": "MODE 14 · DIGITAL-HUMAN EMBODIMENT", "loc": "HUB · THROUGH MOBILE VIEW",
        "action": "The same live scene framed for the phone: she stands at attentive idle at the Hub, addressing the mobile camera directly. Same instance, same state, lighter render.",
        "emotion": "Continuity of warmth - the same person, the same day, no reset, no costume change.",
        "camera": "Phone viewport (vertical crop) roughly 10:14; the device bezel visible in a darkened surround.",
        "lighting": "Identical key direction; reduced light count and simplified shadows for mobile cost.",
        "environment": "The Hub, seen through the mobile view.",
        "visible": "A condensed status rail, voice-first input, camera and microphone state chips, and an emergency hail.",
        "owner": "Talk or hold-to-talk; camera toggle; hail. Everything in the desktop view exists here in mobile form.",
        "transitions": "IN: cut. OUT: the desktop view resumes - state unchanged, because it is one instance.",
        "systems": "device adapter (mobile) · state sync (one instance) · reduced-cost renderer profile",
    },
    {
        "num": "20", "title": "THE SAME LIVE CHARACTER, RENDERED FOR HOLOGRAPHIC PROJECTION", "img": "frames/f20_hologram.png",
        "mode": "MODE 15 · PHYSICAL HOLOGRAPHIC PRESENCE", "loc": "EMBAYMENT",
        "action": "In the Embayment the Pepper's-Ghost volume shows her live - the same pose, the same scene, mirrored. Behind the glass: the raised platform and calibration rig.",
        "emotion": "Composed presence - reporting for external view. No special performance for the hologram.",
        "camera": "35 mm from the audience side through the glass; ghost image in front, platform behind.",
        "lighting": "The embay stage is lit for projection contrast: dark surround, subject key, steady sync light.",
        "environment": "Embodiment and Projection, east-south.",
        "visible": "A sync chip - live · 60 fps · mirrored - the device name, and layout controls (mirror, rotate, multi-face).",
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
        "and heading (-180 to 180 degrees). Walk targets 1.15-1.25 m/s, run 3.2-3.8 m/s. "
        "Cycles are distance-matched - cycle length scales with speed - so the feet never "
        "skate, and foot IK with ground snap keeps contact honest on the raised floor and "
        "dais steps.",
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
    ("5.10  Reduced-motion behaviour", [
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
    "The architecture keeps what should survive - identity, memory, goals, orchestration - "
    "independent from what will improve - renderer, animation fidelity, inference hardware. "
    "The CORE is a modular FastAPI backend with PostgreSQL (pgvector where available) in "
    "production and SQLite only for development and tests. WebSockets carry live state to "
    "the renderer and to workers. Secrets are encrypted server-side; tokens never appear in "
    "Git, JavaScript, localStorage or sessionStorage. The renderer for Milestone 1 is "
    "browser-first (Three.js over WebGPU with a WebGL2 fallback) driving a licensed GLTF "
    "character; Unreal/MetaHuman remains an optional higher-fidelity adapter from Milestone "
    "4, and the hologram is simply another device surface rendering the same live instance."
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
    "caption": "Table 6.2 - Milestones and acceptance gates",
    "header": ["Milestone", "Delivers", "Not complete until"],
    "widths": [0.16, 0.44, 0.40],
    "rows": [
        ["M1 - Living character and world", "Navigable cinematic environment; licensed rigged JARVIS; idle, walk, run, turn; navigation and collision; console and object interaction; character controller; deliberate cameras and lighting; CORE APIs; memory and goal foundations; seven owner switches; truthful health and setup states",
         "She visibly walks, runs, turns, stops, faces the owner and performs a coherent environmental interaction"],
        ["M2 - Intelligence and performance", "Local and Kaggle inference; encrypted profiles; streaming and cancellation; voice; facial animation and lip-sync; task-linked movement; persistent conversations; real setup tests",
         "A streamed, interruptible conversation with synchronised facial animation over the local worker"],
        ["M3 - Autonomy and demonstration", "Autonomous goals; agents; guarded tools; research; simulations; scenario direction; interactive explanations; video playback, recording and export where supported; security; telemetry",
         "She constructs, directs, branches and restores a full scenario, and presents a paused video with a 2D-to-3D handoff"],
        ["M4 - Shared embodiment", "Mobile refinement; backup and restore; device adapters; optional MetaHuman; holographic projection; synchronised state; production hardening",
         "Phone and hologram render the same live instance in sync with speech, motion and scenarios"],
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
    ("D2 - Character asset source", "Option A: Reallusion CC4/ActorCore digital human (recommended for M1 - web pipeline, ARKit facial rig). Option B: MetaHuman as primary (higher face fidelity, heavier pipeline). Option C: custom commission (full control, longest lead time)."),
    ("D3 - Wardrobe variants", "Charcoal duty suit as drawn (baseline), with or without the formal drape-coat variant for presentation moments. Recommendation: both states, duty suit default."),
    ("D4 - Voice direction (M2)", "A warm, measured alto is proposed as the default speaking profile; shortlist samples will be presented at Milestone 2 selection, and the adapter stays replaceable."),
    ("D5 - Storyboard amendments", "Any frame you want re-composed - list frame numbers and the change; amended frames return for review before the baseline locks."),
]

CH7_CLOSE = (
    "On approval, Milestone 1 begins against this baseline: the world of Chapter 3, the "
    "character of Chapter 2, the motion of Chapter 5, the sequence of Chapter 6. Until "
    "then, no application code is written. The Phase Zero artifacts - this document, the "
    "twenty frames, the concept plates and the floor plan - live in "
    "download/jarvis-nexus-preproduction/ for your review at full resolution."
)

CH7_ARTIFACTS = {
    "caption": "Table 7.1 - Phase Zero artifact manifest (all under download/jarvis-nexus-preproduction/)",
    "header": ["Artifact", "Contents"],
    "widths": [0.42, 0.58],
    "rows": [
        ["JARVIS-NEXUS_PreProduction_Package_v1.pdf", "This package - inspection report, direction, storyboard, technical plan, approval gate"],
        ["frames/ (20 files)", "The storyboard frames at full resolution (1344 x 768), numbered to match Chapter 4 and the mapping matrix"],
        ["concepts/ (4 files)", "Character full-figure and face studies, hub and spine environment plates"],
        ["build/floorplan.png", "The Nexus operations floor plan at print resolution, with editable HTML source alongside"],
        ["build/cover.html, build/floorplan.html", "Editable HTML sources for the cover and floor plan, for future revision without a rebuild"],
    ],
}
