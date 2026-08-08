"""Utilities for aligning Korean lyrics to an original audio timeline."""

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("stt-vocal")
except PackageNotFoundError:  # Source checkout without an editable install.
    __version__ = "0.1.0"

__all__ = ["__version__"]
