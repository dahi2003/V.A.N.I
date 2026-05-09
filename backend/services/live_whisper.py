import whisper
import tempfile
import os

print("\n[AI ENGINE] Loading Whisper Model for Live Streaming...")
model = whisper.load_model("small") 

def process_audio_chunk(audio_bytes: bytes) -> str:
    """
    Frontend se aaye chhote audio chunk ko Whisper se text mein convert karta hai.
    """
    if not audio_bytes:
        return ""
        
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio:
        temp_audio.write(audio_bytes)
        temp_file_path = temp_audio.name

    try:
        result = model.transcribe(temp_file_path, fp16=False)
        raw_text = result.get("text", "")
        text=str(raw_text).strip()
        
        return text
        
    except Exception as e:
        print(f"[AI Error] Whisper failed on chunk: {e}")
        return ""
        
    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)