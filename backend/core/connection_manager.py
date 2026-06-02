from fastapi import WebSocket
from typing import Dict, List

class ConnectionManager:
    def __init__(self):
       
        self.active_meetings: Dict[str, Dict[str, WebSocket]] = {}
        
        
        self.meeting_transcripts: Dict[str, List[Dict[str, str]]] = {}

    async def connect(self, websocket: WebSocket, meeting_id: str, user_name: str):
        await websocket.accept()
        
        if meeting_id not in self.active_meetings:
            self.active_meetings[meeting_id] = {}
            self.meeting_transcripts[meeting_id] = []
            
        self.active_meetings[meeting_id][user_name] = websocket
        print(f"[JOINED] {user_name} has connected to Meeting: {meeting_id}")

    def disconnect(self, meeting_id: str, user_name: str):
        if meeting_id in self.active_meetings and user_name in self.active_meetings[meeting_id]:
            del self.active_meetings[meeting_id][user_name]
            print(f"[LEFT] {user_name} left Meeting: {meeting_id}")
            
            
            if len(self.active_meetings[meeting_id]) == 0:
                print(f"[ENDED] Meeting {meeting_id} is now empty. Generating Summary and Saving to DB...")
                
                # Saare chunks ko ek saath jodo
                full_transcript = "\n".join(
                    [f"{item['user']}: {item['text']}" for item in self.meeting_transcripts[meeting_id]]
                ).strip()
                  
               
                if not full_transcript:
                    print("Meeting was empty. Skipping LLM generation.")
                    summary = "No conversation was recorded during this meeting."
                else:
                    # LLM ko call karo
                    from services.llm_service import generate_speaker_summary
                    summary = generate_speaker_summary(full_transcript)
                
                print("\n" + "="*20 + " FINAL SUMMARY " + "="*20)
                print(summary)
                print("="*55 + "\n")
                
               
                try:
                    from database.config import SessionLocal
                    from database.models import Meeting, Transcript, Summary
                    
                    db = SessionLocal()
                    
                    # 1. Meeting Record banao ya update karo
                    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
                    if not meeting:
                        meeting = Meeting(id=meeting_id, status="ended")
                        db.add(meeting)
                    else:
                        db.query(Meeting).filter(Meeting.id == meeting_id).update({"status": "ended"})

                    # 2. Saari Transcripts (baatein) save karo
                    for item in self.meeting_transcripts[meeting_id]:
                        new_transcript = Transcript(
                            meeting_id=meeting_id,
                            user_name=item['user'],
                            text=item['text']
                        )
                        db.add(new_transcript)

                    new_summary = Summary(
                        meeting_id=meeting_id, 
                        summary_text=summary
                    )
                    db.add(new_summary)

                    db.commit()
                    print(f"Data for {meeting_id} successfully saved to SQLite Database!")

                except Exception as e:
                    print(f"Database Save Error: {e}")
                    if 'db' in locals():
                        db.rollback()
                finally:
                    if 'db' in locals():
                        db.close()
                
               
                if meeting_id in self.meeting_transcripts:
                    self.meeting_transcripts[meeting_id] = []  
                
              
                if meeting_id in self.active_meetings:
                    del self.active_meetings[meeting_id]

    async def broadcast_transcript(self, meeting_id: str, user_name: str, text: str):
        if meeting_id in self.active_meetings:
            self.meeting_transcripts[meeting_id].append({"user": user_name, "text": text})
            
            message = {"type": "transcript", "user": user_name, "text": text}
            for user, ws in self.active_meetings[meeting_id].items():
                try:
                    await ws.send_json(message)
                except Exception as e:
                    print(f"Failed to send message to {user}: {e}")

    async def broadcast_webrtc_signal(self, meeting_id: str, sender_name: str, signal_data: dict):
     
        if meeting_id in self.active_meetings:
          
            signal_data['sender'] = sender_name
            
            for user, ws in self.active_meetings[meeting_id].items():
                if user != sender_name:
                    try:
                        await ws.send_json(signal_data)
                    except Exception as e:
                        print(f"Failed to send WebRTC signal to {user}: {e}")


manager = ConnectionManager()
