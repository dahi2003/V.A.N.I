from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from api.websocket_routes import router as websocket_router # <--- NAYA IMPORT
from database.config import engine, get_db
from database.models import Base, Meeting, Transcript, Summary

Base.metadata.create_all(bind=engine)
app = FastAPI(title="V.A.N.I. Live AI Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(websocket_router) 

@app.get("/")
async def health_check():
    return {"status": "success", "message": "V.A.N.I. Live Engine is active and waiting for WebSockets."}

# ==========================================
# REST API ENDPOINTS FOR MEETING HISTORY
# ==========================================

@app.get("/api/meetings")
def get_all_meetings(db: Session = Depends(get_db)):
    """Saari saved meetings ki list laane ke liye"""
    meetings = db.query(Meeting).order_by(Meeting.created_at.desc()).all()
    return {"meetings": meetings}

@app.get("/api/meetings/{meeting_id}")
def get_meeting_details(meeting_id: str, db: Session = Depends(get_db)):
    """Kisi ek meeting ka poora data (Transcript + Summary) laane ke liye"""
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
        
    transcripts = db.query(Transcript).filter(Transcript.meeting_id == meeting_id).order_by(Transcript.timestamp.asc()).all()
    summary = db.query(Summary).filter(Summary.meeting_id == meeting_id).first()
    
    return {
        "meeting_id": meeting.id,
        "status": meeting.status,
        "created_at": meeting.created_at,
        "transcripts": [{"user": t.user_name, "text": t.text, "time": t.timestamp} for t in transcripts],
        "summary": summary.summary_text if summary else None
    }