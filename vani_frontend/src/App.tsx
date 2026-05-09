import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Activity } from 'lucide-react';

interface TranscriptMessage {
  type: string;
  user: string;
  text: string;
}

const App: React.FC = () => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  
  const meetingId: string = "demo_meeting_001";
  const userName: string = "Om_Yadav"; 

  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  
  // NAYA REF: Yeh track karega ki loop chalana hai ya nahi
  const isRecordingRef = useRef<boolean>(false);

  // NAYA FUNCTION: Jo har 3 second mein ek fresh audio file banayega
  const recordAudioChunk = () => {
    if (!isRecordingRef.current || !streamRef.current || socketRef.current?.readyState !== WebSocket.OPEN) {
      return;
    }

    // Har chunk ke liye ek completely naya recorder (Isse header issue hamesha ke liye khatam!)
    const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType: 'audio/webm' });

    mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0 && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(event.data);
      }
    };

    mediaRecorder.start();

    // 3 second baad is recorder ko roko aur naya chunk start karo
    setTimeout(() => {
      if (mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      }
      if (isRecordingRef.current) {
        recordAudioChunk(); // Loop back for the next 3 seconds
      }
    }, 3000);
  };

  const startMeeting = async (): Promise<void> => {
    try {
      const stream: MediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const wsUrl: string = `ws://127.0.0.1:8000/ws/meeting/${meetingId}/${userName}`;
      socketRef.current = new WebSocket(wsUrl);

      socketRef.current.onopen = () => {
        console.log("WebSocket Connected Successfully!");
        setIsRecording(true);
        isRecordingRef.current = true;

        // Loop shuru karo
        recordAudioChunk();
      };

      socketRef.current.onmessage = (event: MessageEvent) => {
        const data: TranscriptMessage = JSON.parse(event.data);
        if (data.type === "transcript" && data.text.trim() !== "") {
          setTranscripts((prev) => [...prev, data]);
        }
      };

      socketRef.current.onclose = () => {
        console.log("WebSocket Disconnected");
        stopMeeting();
      };

    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert("Microphone permission denied! Please check browser settings.");
    }
  };

  const stopMeeting = (): void => {
    setIsRecording(false);
    isRecordingRef.current = false; // Isse chunk loop turant ruk jayega
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    }
    
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.close();
    }
  };

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 font-sans">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
          <div>
            <h1 className="text-3xl font-bold text-blue-400">V.A.N.I. Live AI</h1>
            <p className="text-gray-400">Meeting ID: {meetingId} | Logged in as: <span className="text-green-400">{userName}</span></p>
          </div>
          
          <button 
            onClick={isRecording ? stopMeeting : startMeeting}
            className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold transition-all shadow-lg ${
              isRecording 
                ? 'bg-red-500 hover:bg-red-600 animate-pulse shadow-red-500/50' 
                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/50'
            }`}
          >
            {isRecording ? <><MicOff size={20} /> End Live Stream</> : <><Mic size={20} /> Start Meeting</>}
          </button>
        </div>

        <div className="bg-gray-800 rounded-xl p-6 h-[65vh] overflow-y-auto shadow-inner border border-gray-700">
          {transcripts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500">
              <Activity size={56} className="mb-4 opacity-40 animate-bounce" />
              <p className="text-lg">Click "Start Meeting" and speak into your mic...</p>
              <p className="text-sm mt-2 opacity-60">V.A.N.I. is ready to transcribe.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {transcripts.map((msg, idx) => (
                <div key={idx} className={`p-4 rounded-xl max-w-[85%] ${
                  msg.user === userName 
                    ? 'bg-blue-900/40 self-end border border-blue-800/50 rounded-br-none' 
                    : 'bg-gray-700 self-start border border-gray-600 rounded-bl-none'
                }`}>
                  <span className="text-xs text-blue-300 font-bold block mb-1 uppercase tracking-wider">{msg.user}</span>
                  <p className="text-gray-100 text-lg leading-relaxed">{msg.text}</p>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;