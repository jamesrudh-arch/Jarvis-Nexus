#!/usr/bin/env python3
"""JARVIS NEXUS pre-production v2.1 — identity-locked rebuild.

Anchor: the client's own uploaded reference (IMG_9024.png — best face).
Every proof frame is an EDIT of the anchor => same woman, guaranteed.

Visual DNA extracted from client's 4 references (VLM-verified):
  - woman ~37, dark brown hair in low bun, black turtleneck under a
    structured dark blazer, wristwatch on left wrist
  - cyan/teal wireframe + voxel point-cloud holograms, dissolving edges
  - ORANGE reserved exclusively for critical data / failure points
  - holograms are the key light: cyan on her face, hands, floor; crisp, no
    bloom blowout; real shadows
  - environment: round glass pedestal holo-table with illuminated rim,
    glowing floor circuit rings, glass data columns, dark basalt walls
  - short legible uppercase data labels with leader lines

Phases: anchor | proof | all
"""
import concurrent.futures as cf
import os
import shutil
import subprocess
import sys
import time

BASE = "/home/z/my-project/download/jarvis-nexus-preproduction"
V2 = os.path.join(BASE, "v2_proof")
UPLOAD = "/home/z/my-project/upload/IMG_9024.png"   # identity anchor
os.makedirs(V2, exist_ok=True)

CHAR = ("the same woman from the reference image: identical face, identical "
        "dark brown hair pulled back into a low bun, identical black "
        "turtleneck under an identical structured dark blazer, identical "
        "wristwatch on her left wrist, apparent age 37, slim intelligent face, "
        "matte realistic skin with visible pores")

DNA = ("hologram rendered as cyan-teal wireframe geometry mixed with dense "
       "voxel point-cloud particles, edges dissolving into particles, crisp "
       "light with no bloom blowout, the hologram is the key light source "
       "casting cyan light onto her face, hands and the glossy black floor "
       "and casting her real shadow")

ENV = ("inside an enclosed subterranean high-tech facility, near-black "
       "basalt walls, a round glass-top pedestal hologram table with an "
       "illuminated rim, glowing cyan floor circuit rings and lines, tall "
       "glass columns with slowly scrolling data light streams in the "
       "background, faint volumetric haze")

LABELS = ("a few short, clean, fully legible uppercase sans-serif data "
          "labels connected to the hologram by thin leader lines, no "
          "gibberish or pseudo-text anywhere")

STYLE = ("photorealistic cinematic film still, 35mm anamorphic lens, "
         "restrained color grade, charcoal-black and cyan palette with "
         "orange used only for the single critical data element, deep "
         "shadows, generous dark negative space, high detail, no watermark")

HANDS = ("her hands naturally posed with fingers clearly separated and "
         "articulated, fingertips cleanly in front of the hologram volume, "
         "no clipping or merging with the projection")

PROOF = [
    # full-length character sheet for the character bible
    ("p0_character_sheet.png", "864x1152",
     f"Full-length character reference of {CHAR}, standing beside the "
     f"pedestal hologram table, weight on one leg in a relaxed asymmetric "
     f"stance, one hand resting on the table edge, looking toward the camera "
     f"with calm confident direct eye contact and a faint dry half-smile. "
     f"{DNA} showing an abstract architectural wireframe floating above the "
     f"table. {ENV}. {HANDS}. {LABELS}. {STYLE}."),

    # conversation moment — eyes with someone home behind them
    ("p1_face_closeup.png", "864x1152",
     f"Head-and-shoulders portrait of {CHAR}, mid-conversation and mid-reply: "
     f"grey-brown eyes locked on the owner just off-frame with warm focused "
     f"intent and dry amusement, one eyebrow slightly raised, faint "
     f"asymmetric smile beginning, head tilted a few degrees. An unseen "
     f"hologram below-left lights the underside of her jaw and cheekbone in "
     f"cyan, a warm amber rim light from behind right. Background: blurred "
     f"{ENV}. {STYLE}."),

    # THE scenario recreation moment (client ref IMG_9027 / Iron Man 3 DNA)
    ("p2_scenario_recreation.png", "1344x768",
     f"{CHAR} standing inside a walkable full-scale incident reconstruction "
     f"on the dark stage floor: a frozen industrial accident rebuilt as data "
     f"— a voxel point-cloud of pipes and machinery with clean wireframe "
     f"edges, two translucent cyan wireframe human figures caught mid-action "
     f"in the scene, debris fragments suspended mid-air. She points with her "
     f"right index finger at the single POINT OF ORIGIN, highlighted in "
     f"solid glowing orange while everything else stays cyan. Beside it a "
     f"small orange data card. One thin floating label reads 'INCIDENT "
     f"RECONSTRUCTION: PHASE 1', another reads 'VOXEL RESOLUTION: 3MM'. A "
     f"faint circular timeline ring glows in the floor around the "
     f"reconstruction with a bright scrub marker. {DNA}. {ENV}. {HANDS}. "
     f"{LABELS}. {STYLE}."),

    # engineering workbench moment (client ref IMG_9024)
    ("p3_engineering.png", "1344x768",
     f"{CHAR} at work beside a black reflective console, her right hand "
     f"raised and turning a large cyan wireframe turbine rotor assembly "
     f"hologram in mid-air, her left hand resting on the console edge, "
     f"wristwatch visible. Thin leader lines connect small clean numeric "
     f"metric callouts to the assembly. Her face lit from the hologram in "
     f"cyan from the left, focused professional expression, eyes tracking "
     f"the part she is rotating. {DNA}. {ENV}. {HANDS}. {LABELS}. {STYLE}."),

    # spatial reconstruction / research moment (client ref IMG_9026)
    ("p4_spatial_research.png", "1344x768",
     f"{CHAR} standing at the round glass pedestal hologram table, both "
     f"hands raised manipulating a cluster of floating luminous wireframe "
     f"polyhedra above the table, one solid highlighted softly brighter than "
     f"the rest. A thin header label reads 'SPATIAL RECONSTRUCTION' and "
     f"three small metric labels read 'PRECISION 0.98', 'RECALL 0.96', "
     f"'CONFIDENCE 99.1%'. Background: dark wall panels with minimal clean "
     f"charts and diagrams, no text noise. Her upturned face lit by the "
     f"cluster, expression of quiet analytical focus. {DNA}. {ENV}. {HANDS}. "
     f"{LABELS}. {STYLE}."),

    # first wake establishing shot (client ref IMG_9025 environment)
    ("p5_first_wake.png", "1344x768",
     f"Wide low-angle establishing shot: {CHAR} seen small in the "
     f"mid-distance walking alone toward the round pedestal hologram table "
     f"during first power-on, cyan floor circuit rings and guide lines "
     f"igniting in sequence ahead of her, the glass data columns in the "
     f"background waking to vertical streams of light, her figure rim-lit "
     f"cyan, mid-stride, unhurried confident walk, faint volumetric light "
     f"shafts. No hologram content yet — the space is waking up around her. "
     f"{ENV}. {STYLE}."),
]


def run_zai(args, timeout=300):
    for attempt in range(3):
        try:
            r = subprocess.run(args, capture_output=True, text=True,
                               timeout=timeout)
            if r.returncode == 0:
                return True, r.stdout + r.stderr
            time.sleep(2 + attempt * 3)
        except subprocess.TimeoutExpired:
            continue
    return False, "timeout/error after retries"


def edit(ref, out, size, prompt):
    ok, log = run_zai(["z-ai", "image-edit", "-p", prompt, "-i", ref,
                       "-o", out, "-s", size])
    good = os.path.exists(out) and os.path.getsize(out) > 30_000
    print(("OK  " if good else "FAIL") + f" {os.path.basename(out)}", flush=True)
    if not good:
        print(log[-400:], flush=True)
    return good


def phase_anchor():
    dst = os.path.join(V2, "canon_ref.png")
    shutil.copyfile(UPLOAD, dst)
    print("anchor set:", dst)


def phase_proof():
    ref = os.path.join(V2, "canon_ref.png")
    if not (os.path.exists(ref) and os.path.getsize(ref) > 30_000):
        sys.exit("canon_ref.png missing — run anchor phase first")
    with cf.ThreadPoolExecutor(max_workers=3) as ex:
        futs = [ex.submit(edit, ref, os.path.join(V2, name), size, prompt)
                for name, size, prompt in PROOF]
        results = [f.result() for f in futs]
    print(f"proof frames done: {sum(results)}/{len(results)} ok")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    if mode in ("anchor", "all"):
        phase_anchor()
    if mode in ("proof", "all"):
        phase_proof()
