"""JARVIS NEXUS — system-wide integration layer.

Implements the Mandatory System-Wide Integration Directive: every external
technology is integrated through ONE reusable layer, registered with the
central orchestrator, permission-gated, tested with real operations, and
recorded in the live Integration Register with evidence.

Submodules:
    mcp_layer         — reusable MCP client (discovery, tool schemas,
                        permissions, execution, error handling, logging,
                        health monitoring)
    mcp_server_expose — JARVIS capabilities exposed AS an MCP server (stdio)
    browser           — Playwright headless browser service
    vision            — OpenCV computer-vision service (torch-free)
    voice             — piper local TTS service (optional model file)
    register          — 15-field live Integration Register (8 states)
    wiring            — builds the bundle + additive FastAPI routes
"""
