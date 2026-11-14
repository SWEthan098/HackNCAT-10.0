"""Agent Firewall. OWNER: Ethan (P1).

Wraps every AI agent tool call: policy (policies.yaml) -> scoped permissions -> taint tracking
-> injection scan (detectors.scan_injection) -> DLP + canary -> allow / block / hold for approval.
The hard rules here must hold even when every AI detector is wrong.
"""
