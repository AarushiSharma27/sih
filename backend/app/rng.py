"""
rng.py — a bit-exact Python port of the mulberry32 generator in assets/js/data.js.

The frontend builds its 10,000-trainee cohort in the browser from a seeded PRNG.
For the API to be a drop-in replacement for `DB.trainees`, it has to produce the
*same* cohort — so this reproduces JavaScript's 32-bit integer semantics
(`Math.imul`, `>>>`, `|0`) exactly. All arithmetic is kept in unsigned 32-bit;
the bit patterns are identical to the signed values JS works with, and every
operation here is taken mod 2**32, so the two agree on every draw.
"""

from __future__ import annotations

import math
from typing import Iterable, Sequence, TypeVar

MASK = 0xFFFFFFFF
T = TypeVar("T")


def _imul(a: int, b: int) -> int:
    """Math.imul — 32-bit multiply, low word kept."""
    return (a * b) & MASK


class Mulberry32:
    """The `rng(seed)` closure from data.js, as a callable object."""

    __slots__ = ("_a",)

    def __init__(self, seed: int) -> None:
        self._a = seed & MASK

    def __call__(self) -> float:
        self._a = (self._a + 0x6D2B79F5) & MASK
        a = self._a
        t = _imul(a ^ (a >> 15), 1 | a)
        t = ((t + _imul(t ^ (t >> 7), 61 | t)) & MASK) ^ t
        return ((t ^ (t >> 14)) & MASK) / 4294967296.0


def js_round(x: float) -> int:
    """
    Math.round — half rounds toward +Infinity.

    Python's built-in round() is banker's rounding, which would silently shift a
    fraction of the salary and attendance figures off the JS values.
    """
    return math.floor(x + 0.5)


class Draw:
    """The `pick` / `pickW` / `int` helpers, bound to one generator."""

    __slots__ = ("rand",)

    def __init__(self, rand: Mulberry32) -> None:
        self.rand = rand

    def pick(self, arr: Sequence[T]) -> T:
        return arr[math.floor(self.rand() * len(arr))]

    def pick_w(self, entries: Sequence[tuple[T, float]]) -> T:
        """Weighted pick over [(value, weight), ...]."""
        total = sum(w for _, w in entries)
        r = self.rand() * total
        for value, weight in entries:
            r -= weight
            if r <= 0:
                return value
        return entries[-1][0]

    def int(self, lo: int, hi: int) -> int:
        return lo + math.floor(self.rand() * (hi - lo + 1))


def weighted_index(weights: Iterable[float]) -> list[tuple[int, float]]:
    """[(0, w0), (1, w1), ...] — mirrors `ARR.map((x, idx) => [idx, weight])`."""
    return [(i, w) for i, w in enumerate(weights)]
