"""In-memory cache for loaded image bands.

Every view render and every AI prediction used to re-read the image from
disk. This module keeps the band arrays of recently used images in memory,
least recently used first out, under a byte budget set by
`images.cache_mb` in the project config.

Keys are built by the caller from the image id, the source file and the
bands requested, plus the file's modification time, so a file rewritten
on disk while the server runs is read again rather than served stale.

The dev server is threaded, so a lock guards the bookkeeping. Loading
itself happens outside the lock: two threads asking for the same key at
once both load it, and the second put wins, which is harmless.
"""
import threading
from collections import OrderedDict

import numpy as np

DEFAULT_CACHE_MB = 1024


def array_bytes(value):
    """Bytes held by a cached value: an array, or a (nested) dict of them."""
    if isinstance(value, np.ndarray):
        return int(value.nbytes)
    if isinstance(value, dict):
        return sum(array_bytes(v) for v in value.values())
    return 0


def freeze(value):
    """Mark arrays in a cached value read-only, so a caller that mutates a
    cached band gets an error instead of corrupting later renders."""
    if isinstance(value, np.ndarray):
        value.flags.writeable = False
    elif isinstance(value, dict):
        for v in value.values():
            freeze(v)
    return value


class ImageCache:
    """LRU cache of image data under a byte budget.

    `max_bytes` of 0 disables caching: `get` always misses and `put` stores
    nothing. A single value larger than the budget is not stored either.
    """

    def __init__(self, max_bytes=DEFAULT_CACHE_MB * 1024 * 1024):
        self.max_bytes = int(max_bytes)
        self._entries = OrderedDict()  # key -> (value, nbytes)
        self._bytes = 0
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0

    @classmethod
    def from_mb(cls, megabytes):
        if megabytes is None:
            megabytes = DEFAULT_CACHE_MB
        return cls(max_bytes=float(megabytes) * 1024 * 1024)

    @property
    def nbytes(self):
        return self._bytes

    def __len__(self):
        return len(self._entries)

    def __contains__(self, key):
        with self._lock:
            return key in self._entries

    def get(self, key):
        """Return the cached value for `key`, or None, and mark it as used."""
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                self.misses += 1
                return None
            self._entries.move_to_end(key)
            self.hits += 1
            return entry[0]

    def put(self, key, value):
        """Store `value` under `key`, evicting least recently used entries
        until it fits. Returns the value, frozen read-only when stored."""
        nbytes = array_bytes(value)
        if nbytes > self.max_bytes:
            return value
        freeze(value)
        with self._lock:
            if key in self._entries:
                self._bytes -= self._entries.pop(key)[1]
            while self._entries and self._bytes + nbytes > self.max_bytes:
                _, (_, evicted) = self._entries.popitem(last=False)
                self._bytes -= evicted
            self._entries[key] = (value, nbytes)
            self._bytes += nbytes
        return value

    def get_or_load(self, key, loader):
        """Return the value for `key`, calling `loader()` on a miss."""
        value = self.get(key)
        if value is None:
            value = self.put(key, loader())
        return value

    def clear(self):
        with self._lock:
            self._entries.clear()
            self._bytes = 0
