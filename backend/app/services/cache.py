from __future__ import annotations

import time
from threading import Lock
from typing import Generic, TypeVar

T = TypeVar("T")


class TtlCache(Generic[T]):
    def __init__(self) -> None:
        self._data: dict[str, tuple[float, T]] = {}
        self._lock = Lock()

    def get(self, key: str) -> T | None:
        with self._lock:
            item = self._data.get(key)
            if not item:
                return None
            expires, value = item
            if time.time() > expires:
                self._data.pop(key, None)
                return None
            return value

    def set(self, key: str, value: T, ttl_seconds: float) -> T:
        with self._lock:
            self._data[key] = (time.time() + ttl_seconds, value)
            return value

    def clear(self) -> None:
        with self._lock:
            self._data.clear()
