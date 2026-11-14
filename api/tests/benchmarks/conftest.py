"""Prints the benchmark numbers at the end of the pytest run (so CI shows them). OWNER: Miles (P2)."""

from __future__ import annotations

import pytest

from sensors import comms_guard
from tests.benchmarks import report


@pytest.fixture(autouse=True)
def _clean_sensor_memory():
    comms_guard.reset_messages()
    yield
    comms_guard.reset_messages()


def pytest_terminal_summary(terminalreporter):
    lines = report.lines()
    if not lines:
        return
    terminalreporter.write_sep("=", "Kairos benchmark")
    for line in lines:
        terminalreporter.write_line(line)
