PART 2 — THE COMPLETE PROJECT VISION

PROJECT JARVIS NEXUS consists of four interconnected primary systems.

1. JARVIS — Personal AI and embodied digital assistant.
2. WORLD — Persistent simulated civilisation.
3. LABORATORY — Product, software, business and scenario experimentation.
4. NEXUS — Intelligence, orchestration, memory, missions and infrastructure.

2.1 SYSTEM ARCHITECTURE DIAGRAM

Implement the architecture represented below.

                    PROJECT JARVIS NEXUS
              =================================
       +---------------+---------------+
       |               |               |
       v               v               v
   +--------+      +---------+     +-----------+
   | JARVIS |      |  WORLD  |     | LABORATORY|
   | AI     |      | SIMUL.  |     | EXPERIMENT|
   +--------+      +---------+     +-----------+
       |               |               |
       +---------------+---------------+
                       |
                       v
              +------------------+
              |      NEXUS       |
              | CENTRAL CONTROL  |
              +------------------+
                       |
     +---------+-------+-------+---------+
     |         |       |       |         |
     v         v       v       v         v
  MEMORY   MISSIONS  VOICE   TOOLS   PERCEPTION
     |         |       |       |         |
     +---------+-------+-------+---------+
                       |
                       v
              +------------------+
              | ORCHESTRATION    |
              | MULTI-MODEL AI   |
              +------------------+
                       |
           +-----------+-----------+
           |           |           |
           v           v           v
        LOCAL AI    CLOUD AI    WORKERS
           |           |           |
           +-----------+-----------+
                       |
                       v
              +------------------+
              | PERSISTENT DATA  |
              | POSTGRESQL       |
              | MEMORY STORE     |
              | EVENT HISTORY    |
              +------------------+
                       |
                       v
              +------------------+
              | SECURITY / AUDIT |
              | PERMISSIONS      |
              | OWNER CONTROL    |
              +------------------+

The four primary systems must communicate through defined interfaces.

Avoid circular dependencies.

Every subsystem must have a clearly identified state owner.

PART 3 — JARVIS: PERSONAL AI AND DIGITAL HUMAN

JARVIS is an adult female AI assistant with an approved visual identity.

She is one inhabitant of the simulated civilisation, not the civilisation itself.

Preserve her approved:

* Appearance.
* Character model.
* Face.
* Body proportions.
* Wardrobe.
* Hair.
* Rig.
* Voice identity.
* Animation identity.

No redesign without an approved storyboard.

3.1 Intelligence

Implement:

* Central AI orchestrator.
* Multiple model providers.
* Provider abstraction.
* Model selection and routing.
* Local and cloud inference.
* Context management.
* Persistent conversational memory.
* Long-term memory.
* Episodic memory.
* Semantic memory.
* Epistemic memory.
* Retrieval and recall.
* Tool execution.
* Task decomposition.
* Autonomous mission planning.
* Mission recovery.
* Background workers.
* Research capabilities.
* Computer interaction.
* Structured outputs.
* Streaming responses.

Support appropriate OpenAI-compatible, Anthropic, Gemini and Ollama integrations where credentials and runtime support exist.

Preserve existing integrations before introducing alternatives.

3.2 Voice intelligence

Implement a complete voice pipeline:

MICROPHONE
    |
    v
VOICE ACTIVITY DETECTION
    |
    v
SPEECH RECOGNITION
    |
    v
CONTEXT / MEMORY
    |
    v
AI ORCHESTRATOR
    |
    v
RESPONSE GENERATION
    |
    v
TEXT TO SPEECH
    |
    v
AUDIO STREAMING
    |
    v
JARVIS CHARACTER
    |
    v
FACIAL ANIMATION / LIP SYNC

Required:

* Wake word.
* Speech-to-text.
* Text-to-speech.
* Voice activity detection.
* Streaming audio.
* Interruption handling.
* Natural conversational turn-taking.
* Contextual memory.
* Spoken mission updates.
* Lip synchronisation.
* Viseme support.
* Facial expressions.
* Voice identity consistency.

Evaluate Pipecat and existing voice infrastructure. Do not replace a working stack without measurable justification.

3.3 Embodiment

Unreal Engine must host JARVIS’s embodied representation.

Implement:

* Character loading.
* Animation Blueprints.
* Facial animation.
* Lip sync.
* IK.
* Control Rig.
* Navigation.
* Environmental interactions.
* Contextual animations.
* Object interaction.
* Conversational positioning.
* World transitions.

JARVIS must be able to navigate and interact with the world.

3.4 Interface philosophy

The default experience is JARVIS and her world.

Do not clutter the primary experience with permanent:

* Toolbars.
* Dashboards.
* Buttons.
* Chat panels.
* Transcripts.
* Debug graphics.
* Telemetry overlays.
* Persistent control panels.

Use a voice-first interface with summoned contextual interfaces.

Brief captions are acceptable.

Never obstruct JARVIS’s face.

Mobile interfaces must support comfortable one-thumb operation.

Maintain a separate engineering/debug interface for development and diagnostics.

PART 11 — LABORATORY

The Laboratory is a major independent system.

It allows the owner to prototype and test products, software, services and businesses against the simulated civilisation.

Laboratory architecture diagram

       SOFTWARE       PRODUCTS       BUSINESS
          |              |              |
          +--------------+--------------+
                         |
                         v
               +-------------------+
               | PROTOTYPE REGISTRY|
               +-------------------+
                         |
                         v
               +-------------------+
               | EXPERIMENT ENGINE |
               | CONFIGURATION     |
               | RANDOM SEED       |
               +-------------------+
                         |
                         v
               +-------------------+
               | SIMULATED WORLD   |
               | POPULATION        |
               +-------------------+
                         |
                         v
               +-------------------+
               | OBSERVATIONS      |
               +-------------------+
                         |
                         v
               +-------------------+
               | EVALUATION        |
               +-------------------+
                         |
                         v
               +-------------------+
               | EXPERIMENT REPORT |
               +-------------------+

Support experiments involving:

* Websites.
* Applications.
* APIs.
* Services.
* Physical product concepts.
* Furniture.
* Vehicles.
* Buildings.
* Companies.
* Pricing.
* Marketing.
* Operations.

A prototype may enter the world.

Example:

A new product is placed in a shop and simulated customers interact with it.

Experiment records

Every experiment stores:

* Experiment ID.
* Hypothesis.
* Configuration.
* Random seed.
* Population sample.
* Test conditions.
* Interaction logs.
* Outcomes.
* Failures.
* Metrics.
* Conclusions.
* Limitations.

Every report must carry:

SIMULATION PREDICTION

Never represent simulation results as real-world evidence.

Identical configurations and seeds must produce reproducible results.

PART 12 — NEXUS ORCHESTRATION AND MISSION SYSTEM

LangGraph is the single mission-state authority.

Mission lifecycle:

REQUESTED
    |
    v
PLANNED
    |
    v
AWAITING APPROVAL
    |
    v
RUNNING
    |
    +-----------> CHECKPOINT
    |                 |
    |                 v
    |               FAILED
    |                 |
    |                 v
    |               RECOVER
    |                 |
    +-----------------+
    |
    +-----------> COMPLETED
    |
    +-----------> CANCELLED
    |
    v
   REPLAY

Implement:

* Mission planning.
* Dependency tracking.
* Tool assignment.
* Approval handling.
* Execution.
* Checkpoints.
* Recovery.
* Cancellation.
* Replay.
* Results.
* Error records.

Mission record:

* ID.
* Objective.
* Plan.
* Dependencies.
* Tools.
* State.
* Checkpoints.
* Approvals.
* Results.
* Errors.
* Cancellation.
* Recovery.
* Replay.

Supported missions:

* Build a building.
* Create a district.
* Research a technology.
* Design a product.
* Create a business.
* Run an experiment.
* Inspect an inhabitant.
* Evaluate a product.
* Analyse an economic event.

Implement persistent mission recovery.

A killed mission must resume from its last valid checkpoint.

PART 7 — MANDATORY EXTERNAL REPOSITORIES AND TECHNOLOGY INTEGRATION

You must explicitly investigate and implement the following repository integrations according to their assigned purpose.

Do not simply mention these technologies in documentation.

Create a repository integration register.

For every repository record:

* Official URL.
* Licence.
* Version or commit.
* Purpose.
* Required dependencies.
* Integration method.
* Actual files used.
* Changes made.
* Build or runtime result.
* Tests.
* Security considerations.
* Performance implications.
* Status.

7.1 Mandatory implementation repositories

7.2 Additional mandatory technology evaluations

Research and classify:

* OpenUSD.
* Infinigen.
* QGIS.
* Cesium for Unreal.
* OpenStreetMap.
* OSM2World.
* BlenderGIS.
* Blosm.
* Buildify.
* Unreal PCG.
* Project Chrono.
* OpenDRIVE.
* OpenSCENARIO.
* Mass Entity.
* StateTree.
* LangGraph.
* Inspect AI.
* Phoenix.
* Graphiti.
* OpenHands.
* Pipecat.
* Yjs.
* Automerge.
* Poly Haven.
* ambientCG.
* Kenney.
* Quaternius.
* KayKit.

For each, document its purpose, licence, version, obligations, integration approach and adoption decision.

Classify:

* ADOPT NOW.
* ADOPT LATER.
* EVALUATE.
* REJECT.

Research first.

Do not install everything blindly.

Only install dependencies with an explicit architectural reason.

However, once an item is approved for implementation, implement the integration rather than leaving it as a recommendation.
