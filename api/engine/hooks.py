"""Callbacks into other owners' modules. OWNER: Daylen (P3).

The engine tells Comms Guard (Miles) when an incident's level changes and when the demo is reset.
Imports happen at call time because sensors.comms_guard imports the engine. A missing or failing
hook is logged and skipped: it must never stop an event from being recorded or a reset from finishing.
"""

from __future__ import annotations

import asyncio
import importlib
import inspect
import logging

from schemas.kairos import Event

logger = logging.getLogger("api.engine")
_tasks: set[asyncio.Task] = set()  # keeps scheduled async hooks alive until they finish


def _call(module: str, name: str, *args, **kwargs) -> bool:
    """Call module.name(*args, **kwargs) if it exists. True if it ran (or was scheduled) without error."""
    try:
        func = getattr(importlib.import_module(module), name, None)
        if func is None:
            return False
        result = func(*args, **kwargs)
        if inspect.isawaitable(result):
            try:
                task = asyncio.get_running_loop().create_task(result)
                _tasks.add(task)
                task.add_done_callback(_tasks.discard)
            except RuntimeError:  # no event loop running here: run it to completion
                asyncio.run(result)
        return True
    except ImportError:
        return False
    except Exception:
        logger.exception("hook %s.%s failed; continuing", module, name)
        return False


def incident_escalated(events: list[dict], level: str) -> bool:
    """An incident's level changed. Comms Guard decides what to do (it only acts at Critical)."""
    return _call("sensors.comms_guard", "on_incident_escalated", [Event(**e) for e in events], level)


def demo_reset(db) -> dict[str, bool]:
    """After the tables are cleared: Comms Guard forgets its held messages, then Miles's seed puts
    every sandbox account and agent back to its clean, unlocked baseline."""
    return {
        "comms_guard": _call("sensors.comms_guard", "reset_messages"),
        "seed": _call("redteam.seed", "seed_database", db, reset=True),
    }
