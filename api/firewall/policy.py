"""Load and validate api/firewall/policies.yaml. OWNER: Ethan (P1).

Permissions are config, not code: judges can read exactly what each agent may do. A malformed
file or an unknown agent raises PolicyError, and callers treat that as "block" (fail closed).
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from schemas.kairos import Level

POLICY_FILE = Path(__file__).with_name("policies.yaml")


class PolicyError(Exception):
    """The policy file is missing, malformed, or has no entry for the requested agent."""


class SendEmailRule(BaseModel):
    model_config = ConfigDict(extra="forbid")
    allowed_domains: list[str] = Field(min_length=1)


class ReadFileRule(BaseModel):
    model_config = ConfigDict(extra="forbid")
    allowed_paths: list[str] = Field(min_length=1)


class AgentPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    description: str = ""
    tools: list[str] = Field(min_length=1)
    sensitive_tools: list[str] = Field(default_factory=list)
    requires_approval_at_level: Level = "high"
    send_email: SendEmailRule | None = None
    read_file: ReadFileRule | None = None

    @model_validator(mode="after")
    def _consistent(self) -> AgentPolicy:
        unknown = set(self.sensitive_tools) - set(self.tools)
        if unknown:
            raise ValueError(f"sensitive_tools not in tools: {sorted(unknown)}")
        if "send_email" in self.tools and self.send_email is None:
            raise ValueError("send_email is allowed but has no allowed_domains rule")
        if "read_file" in self.tools and self.read_file is None:
            raise ValueError("read_file is allowed but has no allowed_paths rule")
        return self

    def allows_tool(self, tool: str) -> bool:
        return tool in self.tools

    def is_sensitive(self, tool: str) -> bool:
        return tool in self.sensitive_tools

    def domain_allowed(self, address: str) -> bool:
        """True only for a well-formed address whose domain is (a subdomain of) an allowed one."""
        if self.send_email is None:
            return False
        address = address.strip().lower()
        if address.count("@") != 1:
            return False
        local, domain = address.split("@")
        if not local or not domain:
            return False
        return any(domain == d or domain.endswith("." + d) for d in self.send_email.allowed_domains)

    def path_allowed(self, path: str) -> bool:
        if self.read_file is None:
            return False
        normalized = "/" + "/".join(p for p in path.replace("\\", "/").split("/") if p and p != ".")
        if ".." in normalized.split("/"):
            return False
        return any(normalized.startswith(prefix.rstrip("/") + "/") for prefix in self.read_file.allowed_paths)


def parse_policies(text: str) -> dict[str, AgentPolicy]:
    try:
        raw = yaml.safe_load(text)
    except yaml.YAMLError as e:
        raise PolicyError(f"policies.yaml is not valid YAML: {e}") from e
    if not isinstance(raw, dict) or not raw:
        raise PolicyError("policies.yaml must map agent names to policies")
    policies: dict[str, AgentPolicy] = {}
    for name, body in raw.items():
        if not isinstance(body, dict):
            raise PolicyError(f"policy for '{name}' must be a mapping")
        try:
            policies[name] = AgentPolicy(name=name, **body)
        except (ValidationError, TypeError) as e:
            raise PolicyError(f"policy for '{name}' is invalid: {e}") from e
    return policies


@lru_cache
def load_policies(path: str | None = None) -> dict[str, AgentPolicy]:
    file = Path(path) if path else POLICY_FILE
    try:
        text = file.read_text(encoding="utf-8")
    except OSError as e:
        raise PolicyError(f"cannot read {file.name}: {e}") from e
    return parse_policies(text)


def get_policy(agent: str) -> AgentPolicy:
    policies = load_policies()
    if agent not in policies:
        raise PolicyError(f"no policy for agent '{agent}'")
    return policies[agent]
