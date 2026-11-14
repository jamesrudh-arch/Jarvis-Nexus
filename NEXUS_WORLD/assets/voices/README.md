en_US-lessac-medium.onnx  (63 MB ONNX voice model — NOT tracked in git)

Download (Apache-2.0 voice data, rhasspy/piper-voices):
  curl -L -o en_US-lessac-medium.onnx \
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx"

The .json config next to it IS tracked. voice.synthesize registers only when
the model file is present (honest absence otherwise — see integration/wiring.py).
