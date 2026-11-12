#!/usr/bin/env python3
"""
JARVIS NEXUS — Audio2Face-3D gateway (Directive §14 digital-human integration).

 Bridges the Next.js facial-animation provider (src/lib/nexus/providers/audio2face.ts)
 to NVIDIA's Audio2Face-3D gRPC API, using NVIDIA's own protocol verbatim
 (cloned from github.com/NVIDIA/Audio2Face-3D-Samples,
 scripts/audio2face_3d_api_client — Apache-2.0):

     stub.ProcessAudioStream()  bidirectional:
       client → AudioStreamHeader (face/emotion post-processing params)
              → AudioWithEmotion (PCM16 mono chunks; packet 0 carries emotions)
              → EndOfAudio
       server → AnimationDataStreamHeader (blendshape name list + audio header)
              → AnimationData.skel_animation.blend_shape_weights
                  [{ time_code, values[] }]  (CamelCase ARKit names)
              → status

 Why a gateway: Audio2Face ships gRPC + a Python wheel; pulling either into the
 Next.js dependency tree would violate Directive §3 (no unnecessary deps). This
 process runs wherever the owner hosts A2F (self-hosted open-source release —
 NVIDIA open-sourced Audio2Face Sep 2025 — or the legacy NVCF endpoint), and
 speaks plain JSON to the app.

 ENDPOINTS
   GET  /health                → readiness (wheel + endpoint configured?)
   POST /v1/facial_animation   → { audio_base64, mime, emotion, format }
                               ← { fps, durationMs, curves: { jawOpen: [...] } }

 RUN (on the machine with Audio2Face access)
   pip install fastapi uvicorn grpcio grpcio-tools numpy scipy pyyaml
   pip install <Audio2Face-3D-Samples>/proto/sample_wheel/nvidia_ace-*.whl
   A2F_GRPC_URI=localhost:50052 python a2f_gateway.py            # self-hosted
   A2F_GRPC_URI=grpc.nvcf.nvidia.com:443 A2F_USE_SSL=1 \
     A2F_API_KEY=... A2F_FUNCTION_ID=0961a6da-fb9e-4f2e-8491-247e5fd7bf8d \
     python a2f_gateway.py                                       # legacy NVCF
   Then point the app at it: A2F_SERVICE_URL=http://<host>:8090

 STATUS: integration-implemented, live-verification BLOCKED in this sandbox
 (no NVIDIA wheel / GPU). Recorded in PROJECT_STATE.md blocker register.
"""
from __future__ import annotations

import base64
import io
import os
import sys
from typing import Dict, List, Optional

import numpy
import scipy.io.wavfile
import yaml
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# --- NVIDIA protocol (imported lazily so /health can report honestly) --------
A2F_IMPORT_ERROR: Optional[str] = None
try:
    from nvidia_ace.animation_data.v1_pb2 import AnimationDataStreamHeader, AnimationData
    from nvidia_ace.a2f.v1_pb2 import AudioWithEmotion, EmotionPostProcessingParameters, FaceParameters, BlendShapeParameters
    from nvidia_ace.audio.v1_pb2 import AudioHeader
    from nvidia_ace.services.a2f_controller.v1_pb2_grpc import A2FControllerServiceStub
    from nvidia_ace.controller.v1_pb2 import AudioStream, AudioStreamHeader
    from nvidia_ace.emotion_with_timecode.v1_pb2 import EmotionWithTimeCode
    import grpc
except Exception as exc:  # pragma: no cover - environment-dependent
    A2F_IMPORT_ERROR = str(exc)

app = FastAPI(title="JARVIS NEXUS A2F Gateway", version="1.0")

A2F_GRPC_URI = os.environ.get("A2F_GRPC_URI", "")
A2F_USE_SSL = os.environ.get("A2F_USESSL", os.environ.get("A2F_USE_SSL", "")) == "1"
A2F_API_KEY = os.environ.get("A2F_API_KEY", "")
A2F_FUNCTION_ID = os.environ.get("A2F_FUNCTION_ID", "")

# Upper/lower face tuning mirroring NVIDIA's shipped configs (Claire voice set).
BASE_CONFIG: Dict = {
    "face_parameters": {
        "upperFaceStrength": 1.0,
        "upperFaceSmoothing": 0.001,
        "lowerFaceStrength": 1.25,
        "lowerFaceSmoothing": 0.006,
        "faceMaskLevel": 0.6,
        "faceMaskSoftness": 0.0085,
        "skinStrength": 1.0,
        "eyelidOpenOffset": 0.0,
        "lipOpenOffset": 0.0,
        "tongueStrength": 1.3,
        "tongueHeightOffset": 0.0,
        "tongueDepthOffset": 0.0,
    },
    "blendshape_parameters": {"multipliers": {}, "offsets": {}},
    "post_processing_parameters": {
        "emotional_strength": 0.72,
        "emotional_smoothing": 256,
        "input_emotion_smoothing": 0.5,
        "a2e_output_smoothing": 0.75,
    },
}

# JARVIS emotional states (brain directive) → A2F emotion strengths.
# A2F emotion names: NEUTRAL, AMUSEMENT, HAPPINESS, SADNESS, SURPRISE, ANGER,
# DISGUST, FEAR (per the sample configs' emotion_with_timecode_list).
EMOTION_MAP: Dict[str, Dict[str, float]] = {
    "attentive": {"AMUSEMENT": 0.05},
    "listening": {"AMUSEMENT": 0.1},
    "focused": {},
    "concerned": {"SADNESS": 0.25},
    "urgent": {"SURPRISE": 0.3, "ANGER": 0.2},
    "warm": {"HAPPINESS": 0.3, "AMUSEMENT": 0.2},
    "neutral": {},
}


class FacialAnimationRequest(BaseModel):
    audio_base64: str
    mime: str = "audio/wav"
    emotion: str = "neutral"
    format: str = "arkit"


def _camel_to_lower_camel(name: str) -> str:
    """EyeBlinkLeft → eyeBlinkLeft (GLB morph-target naming convention)."""
    return name[:1].lower() + name[1:] if name else name


def _channel():
    """Open the gRPC channel exactly like NVIDIA's auth.create_channel."""
    if not A2F_GRPC_URI:
        raise HTTPException(503, "A2F_GRPC_URI is not configured")
    metadata = None
    if A2F_API_KEY:
        auth = f"Bearer {A2F_API_KEY}"
        metadata = []
        if A2F_FUNCTION_ID:
            metadata.append(("function-id", A2F_FUNCTION_ID))
        metadata.append(("authorization", auth))
    if A2F_USE_SSL or metadata:
        creds = grpc.ssl_channel_credentials()
        if metadata:
            def _cb(ctx, callback, metadata=metadata):
                callback(metadata, None)
            auth_creds = grpc.metadata_call_credentials(_cb)
            creds = grpc.composite_channel_credentials(creds, auth_creds)
        return grpc.aio.secure_channel(A2F_GRPC_URI, creds)
    return grpc.aio.insecure_channel(A2F_GRPC_URI)


async def _run_a2f(pcm: numpy.ndarray, samplerate: int, emotion: str) -> Dict:
    """Drive the A2FControllerService stream and aggregate the keyframes."""
    if A2F_IMPORT_ERROR:
        raise HTTPException(503, f"nvidia_ace wheel unavailable: {A2F_IMPORT_ERROR}")

    cfg = {k: (dict(v) if isinstance(v, dict) else v) for k, v in BASE_CONFIG.items()}
    emotions = EMOTION_MAP.get(emotion, {})

    channel = _channel()
    stub = A2FControllerServiceStub(channel)

    async with channel:  # type: ignore[attr-defined]
        stream = stub.ProcessAudioStream()

        await stream.write(AudioStream(audio_stream_header=AudioStreamHeader(
            audio_header=AudioHeader(
                samples_per_second=samplerate,
                bits_per_sample=16,
                channel_count=1,
                audio_format=AudioHeader.AUDIO_FORMAT_PCM,
            ),
            emotion_post_processing_params=EmotionPostProcessingParameters(
                **cfg["post_processing_parameters"]
            ),
            face_params=FaceParameters(float_params=cfg["face_parameters"]),
            blendshape_params=BlendShapeParameters(
                bs_weight_multipliers=cfg["blendshape_parameters"]["multipliers"],
                bs_weight_offsets=cfg["blendshape_parameters"]["offsets"],
            ),
        )))

        # packet 0 carries the emotion track, then one-second PCM chunks
        first = True
        for i in range(len(pcm) // samplerate + 1):
            chunk = pcm[i * samplerate: (i + 1) * samplerate]
            msg = AudioStream(audio_with_emotion=AudioWithEmotion(
                audio_buffer=chunk.astype(numpy.int16).tobytes(),
                emotions=[EmotionWithTimeCode(emotion=emotions, time_code=0.0)] if first and emotions else None,
            ))
            await stream.write(msg)
            first = False
        await stream.write(AudioStream(end_of_audio=AudioStream.EndOfAudio()))

        bs_names: List[str] = []
        keyframes: List[Dict] = []
        while True:
            message = await stream.read()
            if message == grpc.aio.EOF:
                break
            if message.HasField("animation_data_stream_header"):
                header: AnimationDataStreamHeader = message.animation_data_stream_header
                bs_names = list(header.skel_animation_header.blend_shapes)
            elif message.HasField("animation_data"):
                data: AnimationData = message.animation_data
                for bs in data.skel_animation.blend_shape_weights:
                    keyframes.append({
                        "t": bs.time_code,
                        "v": list(bs.values),
                    })
            elif message.HasField("status"):
                status = message.status
                if status.code == 3:  # ERROR
                    raise HTTPException(502, f"A2F error: {status.message}")

    if not keyframes or not bs_names:
        raise HTTPException(502, "A2F returned no animation data")

    # Aggregate keyframes → per-shape curves at the stream's own frame rate.
    times = [k["t"] for k in keyframes]
    diffs = [b - a for a, b in zip(times, times[1:]) if b > a]
    fps = 60.0 if not diffs else round(1.0 / (sorted(diffs)[len(diffs) // 2]))
    fps = max(5, min(120, fps))

    curves: Dict[str, List[float]] = {}
    for idx, raw_name in enumerate(bs_names):
        name = _camel_to_lower_camel(raw_name)
        curves[name] = [round(float(k["v"][idx]), 4) for k in keyframes]

    duration_ms = int((times[-1] - times[0]) * 1000) if len(times) > 1 else 1000
    return {"fps": fps, "durationMs": max(200, duration_ms), "curves": curves}


@app.get("/health")
async def health():
    ok = A2F_IMPORT_ERROR is None and bool(A2F_GRPC_URI)
    return {
        "ready": ok,
        "wheel": A2F_IMPORT_ERROR is None,
        "endpoint": A2F_GRPC_URI or None,
        "error": A2F_IMPORT_ERROR,
    }


@app.post("/v1/facial_animation")
async def facial_animation(req: FacialAnimationRequest):
    try:
        raw = base64.b64decode(req.audio_base64)
    except Exception:
        raise HTTPException(400, "audio_base64 is not valid base64")

    if "wav" not in (req.mime or "").lower():
        raise HTTPException(
            415,
            "Only PCM16 WAV is supported (the TTS chain synthesizes WAV; "
            "convert before calling otherwise)",
        )
    try:
        samplerate, data = scipy.io.wavfile.read(io.BytesIO(raw))
    except Exception:
        raise HTTPException(415, "audio is not a readable WAV")

    if data.dtype != numpy.int16:
        if data.dtype in (numpy.int32, numpy.int64):
            data = (data / (1 << 15)).astype(numpy.int16)
        elif data.dtype in (numpy.float32, numpy.float64):
            data = (numpy.clip(data, -1.0, 1.0) * 32767).astype(numpy.int16)
        else:
            raise HTTPException(415, f"unsupported WAV sample depth: {data.dtype}")
    if data.ndim > 1:  # stereo → mono
        data = data.mean(axis=1).astype(numpy.int16)

    return await _run_a2f(data, int(samplerate), req.emotion)


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("A2F_GATEWAY_PORT", "8090"))
    print(f"[a2f-gateway] listening on :{port} -> {A2F_GRPC_URI or '(A2F_GRPC_URI unset)'}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")
