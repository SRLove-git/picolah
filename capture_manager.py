"""CaptureManager -- grab frames from a camera/stream and fan them out to a
preview window, still-image files and video files.

Book-compatible API (Joseph Howse, *OpenCV for Python By Example*), with the
incomplete parts filled in and a few correctness fixes:

    windowManager = WindowManager("Camera", ...)
    captureManager = CaptureManager(cv2.VideoCapture(0), windowManager, True)
    while not windowManager.isFinished:
        captureManager.enterFrame()
        frame = captureManager.frame
        # ... process the frame ...
        captureManager.exitFrame()
    captureManager.release()

Fixes relative to the original snippet:

* ``frame`` used to re-``retrieve()`` the frame on *every* property access
  (``self._frame is not None`` instead of ``is None``); it now caches it.
* Mirroring used ``np.fliplr``, which returns a non-contiguous view that some
  OpenCV builds reject in ``imshow``/``imwrite``; it now uses ``cv2.flip``.
* A failed ``retrieve()`` now yields ``None`` instead of half-initialised data.
* The video writer checks ``isOpened()``, tracks the frame size it was opened
  with, and is released on stop/failure instead of leaking a file handle.
"""

from __future__ import annotations

import os
import time
from typing import Any, Optional

import cv2
import numpy as np


class CaptureManager:
    """Grabs frames from ``capture`` and dispatches them to a preview window,
    still images and video files."""

    DEFAULT_FOURCC = "MJPG"
    # How many frames to observe before trusting the FPS estimate when the
    # capture device does not report one.
    MIN_FRAMES_FOR_FPS = 20

    def __init__(
        self,
        capture: Optional[cv2.VideoCapture],
        previewWindowManager: Any = None,
        shouldMirrorPreview: bool = False,
    ) -> None:
        self.preview = previewWindowManager
        self.shouldMirrorPreview = shouldMirrorPreview

        self._capture = capture
        self._channel = 0
        self._enteredFrame = False
        self._frame: Optional[np.ndarray] = None

        self._imageFilename: Optional[str] = None
        self._videoFilename: Optional[str] = None
        self._videoEncoding: Optional[int] = None
        self._videoWriter: Optional[cv2.VideoWriter] = None
        self._videoSize: Optional[tuple[int, int]] = None
        self._forcedFps: Optional[float] = None

        self._startTime: Optional[float] = None
        self._frameElapsed = 0
        self._fpsEstimated: Optional[float] = None

    # ------------------------------------------------------------------ state

    @property
    def channel(self) -> int:
        """Channel index passed to ``retrieve()`` (0 = primary channel)."""
        return self._channel

    @channel.setter
    def channel(self, value: int) -> None:
        if self._channel != value:
            self._channel = value
            self._frame = None

    @property
    def frame(self) -> Optional[np.ndarray]:
        """The frame grabbed by the most recent ``enterFrame()``.

        The first access retrieves (and caches) the frame; later accesses
        return the same array until ``exitFrame()`` releases it.
        """
        if self._enteredFrame and self._frame is None and self._capture is not None:
            ok, frame = self._capture.retrieve(None, self._channel)
            self._frame = frame if ok else None
        return self._frame

    @property
    def isWritingImage(self) -> bool:
        return self._imageFilename is not None

    @property
    def isWritingVideo(self) -> bool:
        return self._videoFilename is not None

    @property
    def fpsEstimated(self) -> Optional[float]:
        """Measured capture rate, available after a couple of frames."""
        return self._fpsEstimated

    # ------------------------------------------------------------ frame loop

    def enterFrame(self) -> None:
        """Grab the next frame, if any. Must be paired with ``exitFrame()``."""
        assert not self._enteredFrame, (
            "previous enterFrame() had no matching exitFrame()"
        )
        self._frame = None
        if self._capture is not None:
            self._enteredFrame = bool(self._capture.grab())

    def exitFrame(self) -> None:
        """Draw to the preview window, write any pending files, release frame."""
        frame = self.frame

        if frame is None:
            # Nothing was grabbed (end of stream, camera hiccup, ...).
            self._enteredFrame = False
            self._frame = None
            return

        self._updateFpsEstimate()

        if self.preview is not None:
            if self.shouldMirrorPreview:
                self.preview.show(cv2.flip(frame, 1))
            else:
                self.preview.show(frame)

        if self.isWritingImage:
            cv2.imwrite(self._imageFilename, frame)
            self._imageFilename = None

        self._writeVideoFrame(frame)

        # Release the frame so the next enterFrame() starts clean.
        self._frame = None
        self._enteredFrame = False

    def _updateFpsEstimate(self) -> None:
        now = time.perf_counter()
        self._frameElapsed += 1
        if self._frameElapsed <= 1:
            self._startTime = now
            return
        elapsed = now - self._startTime
        if elapsed > 0.0:
            self._fpsEstimated = (self._frameElapsed - 1) / elapsed

    # --------------------------------------------------------------- writing

    def writeImage(self, filename: str) -> None:
        """Write the next exited frame to ``filename`` (one shot)."""
        self._imageFilename = filename

    def startWritingVideo(
        self,
        filename: str,
        encoding: Optional[int] = None,
        fps: Optional[float] = None,
    ) -> None:
        """Record all subsequently exited frames to ``filename``.

        ``encoding`` is a fourcc int (defaults to ``MJPG``).  ``fps`` forces
        the output frame rate; otherwise the capture's rate is used, falling
        back to the measured rate when the device reports none.
        """
        self.stopWritingVideo()
        self._videoFilename = filename
        self._videoEncoding = encoding if encoding is not None else fourcc(
            self.DEFAULT_FOURCC
        )
        self._forcedFps = fps
        self._videoWriter = None
        self._videoSize = None

    def stopWritingVideo(self) -> None:
        """Stop recording and flush/close the video file."""
        if self._videoWriter is not None:
            self._videoWriter.release()
        self._videoWriter = None
        self._videoSize = None
        self._videoFilename = None
        self._videoEncoding = None
        self._forcedFps = None

    def _writeVideoFrame(self, frame: np.ndarray) -> None:
        if not self.isWritingVideo:
            return

        size = (int(frame.shape[1]), int(frame.shape[0]))
        if self._videoWriter is None:
            fps = self._videoFps()
            if fps is None:
                return  # not enough information yet; skip until we have it

            try:
                directory = os.path.dirname(os.path.abspath(self._videoFilename))
                if directory:
                    os.makedirs(directory, exist_ok=True)
                writer = cv2.VideoWriter(
                    self._videoFilename, self._videoEncoding, fps, size
                )
                opened = writer.isOpened()
            except (OSError, cv2.error) as exc:
                print(f"CaptureManager: cannot write video "
                      f"{self._videoFilename!r}: {exc}")
                self.stopWritingVideo()
                return

            if not opened:
                # Cannot record to this file/encoding: drop the request rather
                # than silently retrying on every frame.
                writer.release()
                print(f"CaptureManager: video writer failed for "
                      f"{self._videoFilename!r} (unsupported fourcc or codec?)")
                self.stopWritingVideo()
                return
            self._videoWriter = writer
            self._videoSize = size
        elif size != self._videoSize:
            # A resize mid-recording would corrupt the file; skip the frame.
            return

        self._videoWriter.write(frame)

    def _videoFps(self) -> Optional[float]:
        if self._forcedFps:
            return float(self._forcedFps)

        fps = 0.0
        if self._capture is not None:
            try:
                fps = float(self._capture.get(cv2.CAP_PROP_FPS))
            except (AttributeError, cv2.error):
                fps = 0.0
        if fps > 0.0:
            return fps

        # The device reports no FPS: wait for the estimate to stabilise.
        if self._frameElapsed < self.MIN_FRAMES_FOR_FPS or not self._fpsEstimated:
            return None
        return self._fpsEstimated

    # -------------------------------------------------------------- teardown

    def release(self) -> None:
        """Stop recording and release the capture device."""
        self.stopWritingVideo()
        self._frame = None
        self._enteredFrame = False
        if self._capture is not None:
            self._capture.release()

    def __enter__(self) -> "CaptureManager":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.release()


def fourcc(code: str) -> int:
    """'MJPG' -> the int ``cv2.VideoWriter`` wants, across OpenCV versions."""
    if hasattr(cv2, "VideoWriter_fourcc"):
        return int(cv2.VideoWriter_fourcc(*code))
    return int(cv2.VideoWriter.fourcc(*code))
