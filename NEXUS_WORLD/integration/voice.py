"""Local CPU text-to-speech via piper-tts 1.8 (OHF piper1-gpl, GPL-3.0+).

Licensing note (register — licensing assessment): piper-tts is
GPL-3.0-or-later. Internal use inside JARVIS NEXUS does not by itself
trigger distribution obligations; if binaries are ever distributed, GPL
compliance applies (see integration/INTEGRATION_REGISTER.md).

Model: en_US-lessac-medium (63 MB ONNX, Apache-2.0 voice data, from the
rhasspy/piper-voices Hugging Face repository).

Capability: voice.synthesize — text → WAV file (path, size, duration).
piper 1.8's synthesize() returns AudioChunk iterables; PCM16 is assembled
into a WAV container here.
"""
from __future__ import annotations

import logging
import os
import time
import wave

logger = logging.getLogger("jarvis.integration.voice")


class VoiceError(Exception):
    """Model missing or synthesis failure."""


class VoiceService:
    def __init__(self, model_path: str) -> None:
        self.model_path = model_path
        self._voice = None

    def available(self) -> bool:
        return os.path.isfile(self.model_path)

    def _load(self):
        if self._voice is None:
            if not self.available():
                raise VoiceError(f"piper model not found: {self.model_path}")
            from piper import PiperVoice  # optional dependency (lazy)
            config = (self.model_path + ".json"
                      if os.path.isfile(self.model_path + ".json") else None)
            t0 = time.perf_counter()
            self._voice = PiperVoice.load(self.model_path,
                                          config_path=config)
            logger.info("voice.model_loaded elapsed=%.1fs",
                        time.perf_counter() - t0)
        return self._voice

    def synthesize(self, text: str, out_path: str) -> dict:
        voice = self._load()
        sample_rate = getattr(getattr(voice, "config", None),
                              "sample_rate", 22050)
        pcm = bytearray()
        t0 = time.perf_counter()
        for chunk in voice.synthesize(text):
            pcm.extend(chunk.audio_int16_bytes)
        if not pcm:
            raise VoiceError("synthesis produced no audio")
        with wave.open(out_path, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(sample_rate)
            wav.writeframes(bytes(pcm))
        duration_s = len(pcm) / (2 * sample_rate)
        report = {"path": os.path.abspath(out_path),
                  "bytes": os.path.getsize(out_path),
                  "duration_s": round(duration_s, 2),
                  "sample_rate": sample_rate,
                  "text": text,
                  "elapsed_s": round(time.perf_counter() - t0, 2)}
        logger.info("voice.synthesized duration=%.2fs elapsed=%.2fs",
                    report["duration_s"], report["elapsed_s"])
        return report
