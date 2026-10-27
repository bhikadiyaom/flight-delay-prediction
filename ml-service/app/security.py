"""Shared-secret guard: every route requires `X-Internal-Key` equal to INTERNAL_API_KEY (docs/CONTEXT.md section 10)."""
import hmac

from fastapi import Depends, Header, HTTPException, status

from app.config import Settings, get_settings


def require_internal_key(
    x_internal_key: str | None = Header(default=None, alias="X-Internal-Key"),
    settings: Settings = Depends(get_settings),
) -> None:
    supplied = (x_internal_key or "").encode()
    if not hmac.compare_digest(supplied, settings.internal_api_key.encode()):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid or missing X-Internal-Key")
