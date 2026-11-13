PART 6 — BLENDER: COMPLETE ASSET PRODUCTION PIPELINE

Blender is mandatory.

Repository:

https://github.com/blender/blender

Blender must be an actual asset-production system connected to Unreal.

Create:

world/Blender/

Required structure:

world/Blender/
|
+-- scenes/
+-- scripts/
+-- assets/
+-- architecture/
+-- interiors/
+-- furniture/
+-- characters/
+-- animals/
+-- vehicles/
+-- materials/
+-- textures/
+-- animations/
+-- rigs/
+-- export/
+-- validation/
+-- documentation/

Implement Python automation for:

* Procedural modelling.
* Architectural modular kits.
* Building generation.
* Interior generation.
* Furniture.
* Props.
* Materials.
* UV mapping.
* Collision.
* LOD generation.
* Rigging.
* Animation preparation.
* Batch exporting.
* Metadata generation.
* Asset validation.

Create at least three real initial assets:

1. House.
2. Shop.
3. Environmental prop.

Each must have an actual Blender project file.

Export to Unreal using the appropriate FBX, glTF or USD workflow. Document the technical reason for the chosen format.

Asset naming

* SM_ static mesh.
* SK_ skeletal mesh.
* M_ material.
* T_ texture.
* A_ animation.
* COL_ collision.

LOD suffixes:

* _LOD0
* _LOD1
* _LOD2

Default triangle budgets:

Asset	LOD0
House	15k–40k
Shop	20k–50k
Prop	500–5k
Character	30k–60k

LOD1 approximately 50%.

LOD2 approximately 20%.

Textures use power-of-two dimensions and appropriate PBR maps.

Every exported asset must include metadata:

* Author.
* Licence.
* Source.
* Triangle count.
* Dimensions.
* Scale.
* Export format.

Blender validation

Create an executable validation script that checks:

* Scale in metres.
* Applied transforms.
* Missing materials.
* UV availability.
* Required UV validity.
* Collision meshes.
* LOD presence.
* Naming conventions.
* Triangulation requirements.
* Metadata JSON.

A Blender folder containing only scripts without actual generated assets does not satisfy the requirement.

B. Blender

https://github.com/blender/blender

Procedural assets, architectural production, character preparation and animation pipelines.

Implement Python automation and actual assets.

C. FreeMoCap

https://github.com/freemocap/freemocap

Motion capture and human movement acquisition.

Implement an evaluation and capture-to-animation workflow.

Required pipeline:

FREEMOCAP
    |
    v
MOTION CAPTURE DATA
BVH / FBX / TRC
    |
    v
BLENDER
Cleanup / Retargeting / Baking
    |
    v
VALIDATED EXPORT
    |
    v
UNREAL ENGINE
Import / IK / Control Rig
    |
    v
ANIMATION BLUEPRINT
    |
    v
LIVE CHARACTER BEHAVIOUR

D. Natron

https://github.com/NatronGitHub/Natron

Implement Natron as a compositing and visual-effects pipeline component.

Investigate:

* Node-based compositing.
* Render integration.
* Image sequences.
* Visual-effects assets.
* Output automation.
* Blender/Unreal interchange.

Do not treat Natron as a replacement for Unreal’s real-time renderer.

E. Theatre.js

https://github.com/theatre-js/theatre

Integrate with the existing Three.js frontend.

Purpose:

* Cinematic sequencing.
* Timeline-based motion.
* Camera choreography.
* UI transitions.
* Interactive presentation sequences.

Theatre.js must not replace Unreal’s world simulation.
