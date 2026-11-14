"""Login Guard and Comms Guard listeners. OWNER: Miles (P2).

Login Guard: timing/metadata only, never typed content. Ladder: watch, slow, challenge, block.
Comms Guard: phishing + impersonation + AI-manipulation detection.
Both write events via engine.record_event() with actor, target, source, mitre, risk.
"""
