from fastapi import APIRouter, Body
import uuid

router = APIRouter()

@router.post("/guest")
async def guest(nickname: str = Body(..., embed=True)):
    """Guest login - generates a unique session ID for anonymous players"""
    sid = str(uuid.uuid4())
    return {"message": "Guest login sukses", "session_id": sid, "guest_tag": f"guest_{nickname}"}
