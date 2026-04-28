"""
Simple in-memory token-bucket rate limiter.

Keeps a per-IP sliding window of request timestamps.
Returns 429 Too Many Requests when the limit is exceeded.
"""

import logging
import time
from collections import defaultdict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)


class RateLimiterMiddleware(BaseHTTPMiddleware):
    """Per-IP sliding-window rate limiter.

    Args:
        app: The ASGI application.
        max_requests: Maximum requests allowed per window (default 60).
        window_seconds: Size of the sliding window in seconds (default 60).
    """

    def __init__(self, app, max_requests: int = 60, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        """Check rate limit before forwarding the request."""
        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        cutoff = now - self.window_seconds

        # Prune timestamps outside the window
        self._hits[client_ip] = [
            t for t in self._hits[client_ip] if t > cutoff
        ]

        if len(self._hits[client_ip]) >= self.max_requests:
            logger.warning("Rate limit exceeded for %s", client_ip)
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down."},
            )

        self._hits[client_ip].append(now)
        return await call_next(request)
