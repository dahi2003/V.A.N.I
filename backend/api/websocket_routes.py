from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from core.connection_manager import manager
import json
import asyncio


from services.live_whisper import process_audio_chunk

router = APIRouter()

@router.websocket("/ws/meeting/{meeting_id}/{user_name}")
async def meeting_websocket(websocket: WebSocket, meeting_id: str, user_name: str):
    await manager.connect(websocket, meeting_id, user_name)
    try:
        while True:
            message = await websocket.receive()
            
        
            if message.get("type") == "websocket.disconnect":
                break  
            if "bytes" in message:
                audio_data = message["bytes"]
                
                try:
                    transcript_text = await asyncio.to_thread(process_audio_chunk, audio_data) # type: ignore
                    
                    if transcript_text and transcript_text.strip() != "":
                        await manager.broadcast_transcript(meeting_id, user_name, transcript_text)
                except Exception as e:
                    print(f"Transcription Error: {e}")

          
            elif "text" in message:
                try:
                    signal_data = json.loads(message["text"])
                    if signal_data.get("type") in ["webrtc_offer", "webrtc_answer", "webrtc_ice_candidate"]:
                        await manager.broadcast_webrtc_signal(meeting_id, user_name, signal_data)
                except json.JSONDecodeError:
                    pass

    except WebSocketDisconnect:
        pass 
    except Exception as e:
        print(f"WebSocket Error: {e}")
    finally:
        manager.disconnect(meeting_id, user_name)