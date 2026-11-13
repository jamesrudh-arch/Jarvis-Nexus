"""Procedural power-of-two PBR texture maps (blueprint: 'Textures use
power-of-two dimensions and appropriate PBR maps').

Generates 512x512 (2^9) image datablocks with numpy, packs them into the
.blend (self-contained assets, no external paths), and exposes them to
Principled BSDF materials via Image Texture nodes.

Maps produced per slot: ``BaseColor`` (albedo), ``Rough`` (roughness
variation), where a slot is e.g. ``HouseBrick`` or ``ShopFacade``.
"""

import numpy as np
import bpy

from .naming import texture_name

SIZE = 512  # power of two (2^9)


def _brick_pattern(seed: int) -> np.ndarray:
    """Brick courses with per-brick colour jitter + mortar lines."""
    rng = np.random.default_rng(seed)
    img = np.zeros((SIZE, SIZE, 3), dtype=np.float32)
    brick_h, brick_w = 32, 64            # 16 courses x 8 bricks per course
    mortar = 3
    base = np.array([0.58, 0.30, 0.22])  # warm terracotta
    for row in range(SIZE // brick_h):
        offset = (brick_w // 2) if row % 2 else 0
        for col in range(-1, SIZE // brick_w + 1):
            x0 = col * brick_w + offset
            jitter = rng.uniform(0.82, 1.12, 3)
            colour = np.clip(base * jitter, 0, 1)
            y0 = row * brick_h
            img[y0 + mortar // 2: y0 + brick_h - mortar // 2,
                max(x0 + mortar, 0): min(x0 + brick_w - mortar // 2, SIZE)] = colour
    # mortar stays near-zero (dark grey) — set it explicitly
    mask = img.sum(axis=2) == 0
    img[mask] = np.array([0.62, 0.60, 0.58])
    # subtle per-pixel noise so the albedo is not flat
    img += rng.normal(0, 0.012, img.shape).astype(np.float32)
    return np.clip(img, 0, 1)


def _plaster_pattern(seed: int, tint=(0.80, 0.76, 0.70)) -> np.ndarray:
    """Mottled plaster/stucco: low-frequency blotches + fine grain."""
    rng = np.random.default_rng(seed)
    fine = rng.normal(0.5, 0.06, (SIZE, SIZE)).astype(np.float32)
    # low-frequency blotches via upscaled coarse noise
    coarse = rng.normal(0.5, 0.10, (16, 16)).astype(np.float32)
    coarse = np.array(np.kron(coarse, np.ones((SIZE // 16, SIZE // 16))), dtype=np.float32)
    lum = np.clip(0.6 * fine + 0.4 * coarse, 0, 1)[..., None]
    tint = np.array(tint, dtype=np.float32)
    return np.clip(lum * tint[None, None, :] * 1.25, 0, 1)


def _metal_scratch_rough(seed: int) -> np.ndarray:
    """Roughness map for painted metal: mostly smooth with scratch streaks."""
    rng = np.random.default_rng(seed)
    rough = np.full((SIZE, SIZE), 0.35, dtype=np.float32)
    for _ in range(220):  # horizontal scratch streaks
        y = rng.integers(0, SIZE)
        x0 = rng.integers(0, SIZE - 60)
        length = rng.integers(20, 60)
        rough[y, x0:x0 + length] = rng.uniform(0.55, 0.75)
    rough += rng.normal(0, 0.02, rough.shape).astype(np.float32)
    return np.clip(rough, 0, 1)


def _image_from_array(name: str, arr: np.ndarray, color_space: str) -> bpy.types.Image:
    img = bpy.data.images.new(name, width=SIZE, height=SIZE, float_buffer=False)
    if arr.ndim == 2:
        arr = np.stack([arr] * 3, axis=-1)
    if arr.shape[-1] == 3:  # Blender pixels are RGBA
        alpha = np.ones(arr.shape[:2] + (1,), dtype=arr.dtype)
        arr = np.concatenate([arr, alpha], axis=-1)
    img.pixels.foreach_set(np.ascontiguousarray(arr.flatten()).tolist())
    img.pack()  # self-contained .blend
    img.colorspace_settings.name = color_space
    return img


def slot_images(slot: str, seed: int):
    """Create (or reuse) the packed texture set for a material slot.
    Returns dict with 'base_color' and 'roughness' bpy Images."""
    existing = {i.name: i for i in bpy.data.images}
    out = {}
    base_name = texture_name(slot, "BaseColor")
    if base_name not in existing:
        if "brick" in slot.lower():
            base = _brick_pattern(seed)
        elif "metal" in slot.lower():
            base = np.full((SIZE, SIZE, 3), 0.42, dtype=np.float32)  # dark painted metal
        else:
            base = _plaster_pattern(seed)
        out["base_color"] = _image_from_array(base_name, base, "sRGB")
    else:
        out["base_color"] = existing[base_name]

    rough_name = texture_name(slot, "Rough")
    if rough_name not in existing:
        if "metal" in slot.lower():
            rough = _metal_scratch_rough(seed)
        elif "brick" in slot.lower():
            rough = np.clip(np.random.default_rng(seed + 1).normal(0.72, 0.05, (SIZE, SIZE)), 0, 1)
        else:
            rough = np.clip(np.random.default_rng(seed + 1).normal(0.60, 0.05, (SIZE, SIZE)), 0, 1)
        out["roughness"] = _image_from_array(rough_name, rough, "Non-Color")
    else:
        out["roughness"] = existing[rough_name]
    return out
