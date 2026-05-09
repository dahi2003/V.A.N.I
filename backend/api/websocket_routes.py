from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from core.connection_manager import manager
from services.live_whisper import process_audio_chunk

router = APIRouter()

@router.websocket("/ws/meeting/{meeting_id}/{user_name}")
async def meeting_websocket(websocket: WebSocket, meeting_id: str, user_name: str):
    
    await manager.connect(websocket, meeting_id, user_name)
    
    try:
        while True:
            audio_bytes = await websocket.receive_bytes()
            
            text = process_audio_chunk(audio_bytes)
            
            if text:
                print(f"[LIVE] {user_name}: {text}")
                await manager.broadcast_transcript(meeting_id, user_name, text)
                
    except WebSocketDisconnect:
        manager.disconnect(meeting_id, user_name)