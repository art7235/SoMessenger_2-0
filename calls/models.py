from pydantic import BaseModel
from typing import Optional, Literal, Any

class SignalingMessage(BaseModel):
    type: str
    to_user_id: Optional[int] = None
    from_user_id: Optional[int] = None
    sdp: Optional[str] = None
    candidate: Optional[Any] = None
    call_type: Optional[Literal["audio", "video"]] = None
    reason: Optional[Literal["hangup", "reject", "busy", "timeout"]] = None
