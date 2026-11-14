"""Shared fixtures for Miles's tests. OWNER: Miles (P2)."""

from __future__ import annotations

import pytest

from sensors import comms_guard


@pytest.fixture(autouse=True)
def _clean_sensor_memory():
    """Tracked messages and accounts under watch live in memory: start every test clean."""
    comms_guard.reset_messages()
    yield
    comms_guard.reset_messages()
