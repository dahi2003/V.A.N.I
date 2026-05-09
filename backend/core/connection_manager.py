from fastapi import WebSocket
from typing import Dict, List

class ConnectionManager:
    def __init__(self):
        # Structure: { "meeting_123": { "Om_Yadav": <WebSocket_Object>, "Rahul": <WebSocket_Object> } }
        self.active_meetings: Dict[str, Dict[str, WebSocket]] = {}
        
        # Transcript RAM mein save karne ke liye
        # Structure: { "meeting_123": [ {"user": "Om", "text": "Hello team!"}, ... ] }
        self.meeting_transcripts: Dict[str, List[Dict[str, str]]] = {}

    async def connect(self, websocket: WebSocket, meeting_id: str, user_name: str):
        await websocket.accept()
        
        # Agar nayi meeting hai, toh record create karo
        if meeting_id not in self.active_meetings:
            self.active_meetings[meeting_id] = {}
            self.meeting_transcripts[meeting_id] = []
            
        self.active_meetings[meeting_id][user_name] = websocket
        print(f"[JOINED] {user_name} has connected to Meeting: {meeting_id}")

    def disconnect(self, meeting_id: str, user_name: str):
        if meeting_id in self.active_meetings and user_name in self.active_meetings[meeting_id]:
            del self.active_meetings[meeting_id][user_name]
            print(f"[LEFT] {user_name} left Meeting: {meeting_id}")
            
            # THE LLM TRIGGER
            if len(self.active_meetings[meeting_id]) == 0:
                print(f"[ENDED] Meeting {meeting_id} is now empty. Generating Summary...")
                
                # Saare chunks ko ek saath jodo
                full_transcript = "\n".join(
                    [f"{item['user']}: {item['text']}" for item in self.meeting_transcripts[meeting_id]]
                )
                
                # LLM ko call karo (Make sure llm_service.py aapke paas ho)
                from services.llm_service import generate_speaker_summary
                summary = generate_speaker_summary(full_transcript)
                
                print("\n" + "="*20 + " FINAL SUMMARY " + "="*20)
                print(summary)
                print("="*55 + "\n")

    async def broadcast_transcript(self, meeting_id: str, user_name: str, text: str):
        """Jab Whisper audio ko text banayega, toh yeh function us text ko sabhi users ki screen par bhej dega"""
        if meeting_id in self.active_meetings:
            # Transcript ko memory mein save karo
            self.meeting_transcripts[meeting_id].append({"user": user_name, "text": text})
            
            # Meeting ke sabhi logon ko JSON message bhejo
            message = {"type": "transcript", "user": user_name, "text": text}
            for user, ws in self.active_meetings[meeting_id].items():
                try:
                    await ws.send_json(message)
                except Exception as e:
                    print(f"Failed to send message to {user}: {e}")

# Iska ek global instance banate hain taaki poori app yahi manager use kare
manager = ConnectionManager()