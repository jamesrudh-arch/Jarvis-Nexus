#!/usr/bin/env python3
"""JARVIS NEXUS pre-production: storyboard + concept frame generation.

Generates 24 cinematic frames via the z-ai CLI:
  - 20 storyboard frames (1344x768)
  - 2 character concepts (full body, face study)
  - 2 environment concepts (hub, spine)
All prompts share a fixed character/environment/style DNA block for visual
consistency. Frames define composition, blocking, lighting intent only --
final assets come from licensed sources (see package Ch.2).
"""
import concurrent.futures as cf
import os
import subprocess
import sys
import time

BASE = "/home/z/my-project/download/jarvis-nexus-preproduction"
os.makedirs(os.path.join(BASE, "frames"), exist_ok=True)
os.makedirs(os.path.join(BASE, "concepts"), exist_ok=True)

STYLE = ("Cinematic film still, photorealistic, shot on 35mm anamorphic lens, "
         "moody restrained lighting, deep shadows, muted graphite-teal palette, "
         "professional color grading, high detail, no text, no watermark, no logos")

CHAR = ("an adult woman of apparent age 36 with realistic anatomy and proportions, "
        "tall athletic-professional build, shoulder-length near-black hair secured "
        "in a low clasp, grey eyes, calm intelligent expression, wearing a tailored "
        "matte charcoal technical jacket over a dark fine-knit top, slim graphite "
        "trousers, low practical boots, a small earpiece, sophisticated professional "
        "wardrobe, modest and realistic, photorealistic skin, not anime, not cartoon")

ENV = ("inside an enclosed subterranean operations facility, monumental near-black "
       "basalt and dark brushed-steel architecture, hairline cyan light reveals "
       "along panel seams, restrained architectural lighting, faint atmospheric haze")

JOBS = [
    # ---- storyboard frames -------------------------------------------------
    ("frames/f01_first_wake.png", "1344x768",
     f"Wide low-angle establishing shot looking down a long dark operations floor as consoles power on in sequence, each casting faint cyan glow, inset floor guide lights, {CHAR} walking alone in the mid-distance toward a circular central platform, her silhouette rim-lit, volumetric light shafts falling from ceiling apertures, {ENV}, {STYLE}"),
    ("frames/f02_living_presence.png", "1344x768",
     f"Medium shot, {CHAR} standing at a dark architectural wall of project plates with thin ice-white light lines, warm task-lamp glow on her face, body angled toward the wall mid-review, glancing up toward the camera with quiet attentiveness, {ENV}, {STYLE}"),
    ("frames/f03_walk_to_hub.png", "1344x768",
     f"Tracking camera shot from behind and slightly low, {CHAR} walking purposefully along the central axis of the facility, mid-stride with natural arm swing, cyan floor guide lines ahead, dark consoles passing on both sides, faint ceiling light apertures, {ENV}, {STYLE}"),
    ("frames/f04_turn_acknowledge.png", "1344x768",
     f"Over-the-shoulder shot from the owner's eye level, medium close-up of {CHAR} turning toward the camera to make direct confident eye contact, subtle brow raise, a curved console glowing softly behind her, cyan rim light on her hair and shoulder, {ENV}, {STYLE}"),
    ("frames/f05_conversational_focus.png", "1344x768",
     f"Cinematic two-shot profile composition, {CHAR} in the foreground listening attentively with a slight head tilt, soft display light on her face, a warm practical lamp glowing in the dark background, her posture still and engaged, {ENV}, {STYLE}"),
    ("frames/f06_console_work.png", "1344x768",
     f"Over-the-shoulder high-angle shot of {CHAR} leaning into a curved console, her hands touching glowing holographic diagnostic panels, interface light illuminating her focused face from below, hair and shoulders rim-lit cool cyan, {ENV}, {STYLE}"),
    ("frames/f07_urgent_alert.png", "1344x768",
     f"Low wide dynamic shot of {CHAR} running with controlled urgency across the operations floor, jacket edge lifted mid-stride, the zone washed by amber alert lighting, a floor guide line pulsing amber, consoles dimmed around her, {ENV}, {STYLE}"),
    ("frames/f08_memory_archive.png", "1344x768",
     f"Medium close shot of {CHAR} in a dark archive gallery of glass vitrines glowing warm amber, her hand hovering over one vitrine, reflective thoughtful expression, cool cyan light spilling from a distant corridor behind her, {ENV}, {STYLE}"),
    ("frames/f09_goals_wall.png", "1344x768",
     f"Profile medium shot of {CHAR} touching a dark wall panel, thin white timeline lines extending from her fingertip, project plates lighting up in sequence along the wall, her face softly lit by the wall glow, expression of confident clarity, {ENV}, {STYLE}"),
    ("frames/f10_agent_collab.png", "1344x768",
     f"High wide shot of {CHAR} standing at a semicircular dark table with five glowing abstract presence plates arranged in an arc, one plate glowing brighter than the rest, she gestures with an open hand toward it, cool light pools on the table surface, {ENV}, {STYLE}"),
    ("frames/f11_live_research.png", "1344x768",
     f"Tight over-the-shoulder shot of {CHAR} at a research carrel, tracing a link between two documents on a curved display, source cards pinned on the screen, her finger and profile in sharp focus, warm desk lamp glow against cool screen light, {ENV}, {STYLE}"),
    ("frames/f12_simulation.png", "1344x768",
     f"Wide low shot of {CHAR} standing beside a luminous three-dimensional systems model floating over a dark stage floor, light pulses tracing paths through the structure, her figure as a human scale reference, faint measurement ticks around the model, {ENV}, {STYLE}"),
    ("frames/f13_scenario_build.png", "1344x768",
     f"Medium shot of {CHAR} pulling a luminous wireframe element from a floating interface palette, a half-assembled scene forming around her on a dark stage, elements transitioning from wireframe to solid, dim drafting-state blue lighting, creative focus on her face, {ENV}, {STYLE}"),
    ("frames/f14_scenario_direct.png", "1344x768",
     f"Wide shot from a dark stage corner of {CHAR} directing two translucent ghost-like scenario actors and positioning a prop, a small floating camera marker beside her, overhead stage grid visible, thin light annotation arrows on the floor, decisive open gesture, {ENV}, {STYLE}"),
    ("frames/f15_video_present.png", "1344x768",
     f"Shot from an audience position of {CHAR} standing beside a large video wall showing a paused technical frame, her hand raised in a pause gesture, body angled to the side of the screen never blocking it, the screen as the main light source in a dimmed screening room, {ENV}, {STYLE}"),
    ("frames/f16_security.png", "1344x768",
     f"Low profile close shot of {CHAR} leaning forward with one hand on a console edge in a security operations room, dark monitors with a single red accent light, a bright trace moving across one screen, concerned vigilant expression, {ENV}, {STYLE}"),
    ("frames/f17_compute_link.png", "1344x768",
     f"Tight shot of {CHAR} seating a small device cartridge into a slot on a bridge console at a compute wall, an amber status bar climbing on a nearby panel, her hands and calm face in frame, utilitarian honest hardware, {ENV}, {STYLE}"),
    ("frames/f18_owner_controls.png", "1344x768",
     f"Over-the-shoulder shot from behind the owner toward a console with seven large physical toggle switches under warm key light, {CHAR} standing one pace back at the frame edge in soft focus with a calm ready stance, zones of the dark room dimmed behind her, {ENV}, {STYLE}"),
    ("frames/f19_mobile.png", "1344x768",
     f"A smartphone held in a hand in the foreground, its glowing vertical screen showing {CHAR} standing at attentive idle in the same dark operations hub addressing the camera directly, the dark room blurred around the phone, a condensed status bar along the screen edge, {ENV}, {STYLE}"),
    ("frames/f20_hologram.png", "1344x768",
     f"Shot through a tilted glass projection surface in the foreground, a luminous hologram of {CHAR} standing in the same pose and lighting as the live scene, behind the glass a raised dark platform with cyan rim lighting, dark audience-side foreground, {ENV}, {STYLE}"),
    # ---- character concepts ------------------------------------------------
    ("concepts/char_fullbody.png", "768x1344",
     f"Full-length character design study of {CHAR}, standing at attentive rest with weight on one leg and arms relaxed, neutral calm expression, dark studio background with a faint cyan edge light along one side, even soft key light, entire figure visible from head to boots, production concept art, {STYLE}"),
    ("concepts/char_face.png", "1024x1024",
     f"Head and shoulders portrait study of {CHAR}, neutral resting attentive expression with direct level gaze, soft key light from the left, dark background, realistic skin texture with natural pores and subtle detail, small earpiece visible, hair pulled back in a low clasp, {STYLE}"),
    # ---- environment concepts ---------------------------------------------
    ("concepts/env_hub.png", "1344x768",
     f"Wide architectural interior shot of a central operations hub: a circular dais with a low horizontal holotable, three curved consoles arranged around it, a ring of light from above the dais, monumental near-black basalt volumes with hairline cyan reveals, faint volumetric light shafts, no people, {ENV}, {STYLE}"),
    ("concepts/env_spine.png", "1344x768",
     f"Long perspective view down the central axis of the facility connecting distinct zones: an archive gallery with warm amber vitrines on the left, a plan wall with thin white light lines on the right, a stage volume glowing faintly in the far distance, empty of people, {ENV}, {STYLE}"),
]


def generate(relpath: str, size: str, prompt: str) -> tuple:
    out = os.path.join(BASE, relpath)
    if os.path.exists(out) and os.path.getsize(out) > 30_000:
        return (relpath, "cached")
    for attempt in range(3):
        try:
            r = subprocess.run(
                ["z-ai", "image", "-p", prompt, "-o", out, "-s", size],
                capture_output=True, text=True, timeout=300)
            if r.returncode == 0 and os.path.exists(out) and os.path.getsize(out) > 30_000:
                return (relpath, "ok")
            time.sleep(2 + attempt * 3)
        except subprocess.TimeoutExpired:
            continue
    return (relpath, "FAILED")


def main():
    todo = [j for j in JOBS
            if not (os.path.exists(os.path.join(BASE, j[0]))
                    and os.path.getsize(os.path.join(BASE, j[0])) > 30_000)]
    print(f"{len(JOBS)} jobs total, {len(todo)} to generate", flush=True)
    results = []
    with cf.ThreadPoolExecutor(max_workers=3) as ex:
        futs = {ex.submit(generate, *j): j[0] for j in todo}
        for fut in cf.as_completed(futs):
            res = fut.result()
            results.append(res)
            print(f"[{len(results)}/{len(todo)}] {res[0]} -> {res[1]}", flush=True)
    failed = [r for r in results if r[1] == "FAILED"]
    print(f"DONE. {len(results) - len(failed)} ok, {len(failed)} failed")
    for f in failed:
        print("FAILED:", f[0])
    print("--- verify ---")
    bad = 0
    for relpath, _, _ in JOBS:
        p = os.path.join(BASE, relpath)
        ok = os.path.exists(p) and os.path.getsize(p) > 30_000
        if not ok:
            bad += 1
        print(f"{'OK ' if ok else 'BAD'} {relpath} "
              f"({os.path.getsize(p) if os.path.exists(p) else 0} bytes)")
    sys.exit(1 if (failed or bad) else 0)


if __name__ == "__main__":
    main()
