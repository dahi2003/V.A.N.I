import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Activity, Users, FileText, CheckCircle2, History, ArrowLeft, Calendar, Clock, Copy, LogOut, Video, VideoOff, MonitorUp } from 'lucide-react';

interface TranscriptMessage {
  user: string;
  text: string;
  time?: string;
}

interface MeetingSummary {
  id: string;
  created_at: string;
  status: string;
}

const App: React.FC = () => {
  // Screens & Tabs
  const [activeTab, setActiveTab] = useState<'live' | 'history'>('live');
  const [isJoined, setIsJoined] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false); // Warning fixed: Used in UI
  
  // Media States
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isVideoOn, setIsVideoOn] = useState<boolean>(true);
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  
  // Live Data States
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  const [summary, setSummary] = useState<string>('');
  
  const [meetingId, setMeetingId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('meeting') || `room_${Math.floor(Math.random() * 10000)}`;
  });
  const [userName, setUserName] = useState<string>("");

  // History Data
  const [meetingsList, setMeetingsList] = useState<MeetingSummary[]>([]);
  const [selectedMeetingData, setSelectedMeetingData] = useState<any>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // ==========================================
  // REFS FOR WEBRTC & RECORDING
  // ==========================================
  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const isRecordingRef = useRef<boolean>(false);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // WebRTC Refs
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  // WebRTC STUN Servers
  const rtcConfig = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  };

  useEffect(() => {
    if (activeTab === 'live') {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcripts, summary, activeTab]);

  useEffect(() => {
    if (activeTab === 'history') fetchMeetingsList();
  }, [activeTab]);

  // ==========================================
  // THE VIDEO RENDER FIX
  // ==========================================
  useEffect(() => {
    if (isJoined && localVideoRef.current && streamRef.current) {
      localVideoRef.current.srcObject = streamRef.current;
    }
  }, [isJoined]);

  // ==========================================
  // MEDIA TOGGLE FUNCTIONS
  // ==========================================
  const toggleMute = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOn(videoTrack.enabled);
      }
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        if (peerConnectionRef.current) {
          const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
        }

        setIsScreenSharing(true);
        screenTrack.onended = () => stopScreenShare();
      } else {
        stopScreenShare();
      }
    } catch (err) {
      console.error("Screen share error:", err);
    }
  };

  const stopScreenShare = () => {
    if (streamRef.current) {
      const cameraTrack = streamRef.current.getVideoTracks()[0];
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = streamRef.current;
      }

      if (peerConnectionRef.current) {
        const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender && cameraTrack) sender.replaceTrack(cameraTrack);
      }
      setIsScreenSharing(false);
    }
  };

  const copyInviteLink = () => {
    const link = `${window.location.origin}/?meeting=${meetingId}`;
    navigator.clipboard.writeText(link);
    alert(`Meeting Link Copied! \n${link}\n\nShare this with your team.`);
  };

  // ==========================================
  // API FETCH LOGIC
  // ==========================================
  const fetchMeetingsList = async () => {
    setIsLoadingHistory(true);
    try {
      const response = await fetch("http://127.0.0.1:8000/api/meetings");
      const data = await response.json();
      setMeetingsList(data.meetings);
    } catch (error) { console.error(error); } 
    finally { setIsLoadingHistory(false); }
  };

  const fetchMeetingDetails = async (id: string) => {
    setIsLoadingHistory(true);
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/meetings/${id}`);
      const data = await response.json();
      setSelectedMeetingData(data);
    } catch (error) { console.error(error); } 
    finally { setIsLoadingHistory(false); }
  };

  // ==========================================
  // CORE ENGINE: WEBRTC & WEBSOCKET
  // ==========================================
  const createPeerConnection = () => {
    const pc = new RTCPeerConnection(rtcConfig);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, streamRef.current!);
      });
    }

    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'webrtc_ice_candidate',
          candidate: event.candidate
        }));
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({
            type: 'webrtc_offer',
            offer: pc.localDescription
          }));
        }
      } catch (err) {
        console.error("Negotiation error:", err);
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  const handleWebRTCSignal = async (data: any) => {
    if (!peerConnectionRef.current) return;
    const pc = peerConnectionRef.current;

    try {
      if (data.type === 'webrtc_offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketRef.current?.send(JSON.stringify({
          type: 'webrtc_answer',
          answer: pc.localDescription
        }));
      } 
      else if (data.type === 'webrtc_answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      } 
      else if (data.type === 'webrtc_ice_candidate') {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch (err) {
      console.error("WebRTC Signal processing error:", err);
    }
  };

  // ==========================================
  // THE AUDIO FORMAT FIX
  // ==========================================
  const recordAudioChunk = () => {
    if (!isRecordingRef.current || !streamRef.current || socketRef.current?.readyState !== WebSocket.OPEN) return;

    const audioStream = new MediaStream(streamRef.current.getAudioTracks());
    
    // MimeType hata diya hai taaki browser apna native best format use kare
    const mediaRecorder = new MediaRecorder(audioStream); 
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0 && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(event.data); 
      }
    };

    mediaRecorder.start();
    setTimeout(() => {
      if (mediaRecorder.state === "recording") mediaRecorder.stop();
      if (isRecordingRef.current) recordAudioChunk();
    }, 8000); 
  };

  const startMeeting = async (): Promise<void> => {
    if (!meetingId.trim() || !userName.trim()) return alert("Meeting ID aur Name zaroori hai!");

    try {
      const stream: MediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      streamRef.current = stream;
      
      const wsUrl: string = `ws://127.0.0.1:8000/ws/meeting/${meetingId}/${userName}`;
      socketRef.current = new WebSocket(wsUrl);

      socketRef.current.onopen = () => {
        setIsJoined(true);
        setIsRecording(true);
        setIsMuted(false);
        setIsVideoOn(true);
        isRecordingRef.current = true;
        setTranscripts([]); 
        setSummary('');
        
        createPeerConnection(); 
        recordAudioChunk();     
      };

      socketRef.current.onmessage = (event: MessageEvent) => {
        const data = event.data;
        
        if (typeof data === 'string') {
          if (data.includes("FINAL SUMMARY")) {
            setSummary(data);
            return;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.type.startsWith('webrtc_')) {
              handleWebRTCSignal(parsed);
            } 
            else if (parsed.type === "transcript" && parsed.text.trim() !== "") {
              setTranscripts((prev) => [...prev, parsed]);
            }
          } catch {
            if (data.startsWith("[LIVE]")) {
              const match = data.match(/\[LIVE\] (.*?): (.*)/);
              if (match) setTranscripts((prev) => [...prev, { user: match[1], text: match[2] }]);
            }
          }
        }
      };

      socketRef.current.onclose = () => stopMeeting();

    } catch (error) {
      alert("Camera/Microphone permission denied! Please check your browser settings.");
    }
  };

  const stopMeeting = (): void => {
    setIsRecording(false);
    isRecordingRef.current = false;
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    if (peerConnectionRef.current) peerConnectionRef.current.close();
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) socketRef.current.close(); 
    
    setIsJoined(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 border-b border-gray-700 pb-4 gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-3 rounded-lg shadow-lg">
              <Video size={28} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-100 tracking-tight">V.A.N.I. <span className="text-blue-500">Video AI</span></h1>
              <p className="text-gray-400 text-sm mt-1">Smart Meeting & Recording</p>
            </div>
          </div>
          
          <div className="flex bg-gray-800 p-1 rounded-lg border border-gray-700">
            <button onClick={() => setActiveTab('live')} className={`px-6 py-2 rounded-md font-medium transition-all flex items-center gap-2 ${activeTab === 'live' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}>
              <Activity size={18} /> Live Meeting
            </button>
            <button onClick={() => setActiveTab('history')} className={`px-6 py-2 rounded-md font-medium transition-all flex items-center gap-2 ${activeTab === 'history' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}>
              <History size={18} /> Dashboard
            </button>
          </div>
        </div>

        {activeTab === 'live' && (
          <>
            {!isJoined ? (
              <div className="bg-gray-800 rounded-2xl p-8 shadow-2xl border border-gray-700 max-w-md mx-auto mt-12">
                <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2 text-blue-400">
                  <Users /> Join Workspace
                </h2>
                <div className="space-y-5">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-medium text-gray-400">Meeting ID</label>
                      <button onClick={copyInviteLink} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                        <Copy size={12} /> Copy Link
                      </button>
                    </div>
                    <input type="text" value={meetingId} onChange={(e) => setMeetingId(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Display Name</label>
                    <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Enter your name..." className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500" />
                  </div>
                  <button onClick={startMeeting} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg shadow-lg flex justify-center items-center gap-2">
                    <Video size={18} /> Join with Video
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-in fade-in duration-300">
                
                <div className="lg:col-span-3 flex flex-col gap-4">
                  
                  <div className="grid grid-cols-2 gap-4 h-[40vh]">
                    <div className="bg-black rounded-xl overflow-hidden relative border border-gray-700">
                      <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover mirror" />
                      <div className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded text-xs font-bold text-white flex items-center gap-2">
                        {userName} (You)
                        {isMuted && <MicOff size={12} className="text-red-400"/>}
                      </div>
                    </div>

                    <div className="bg-black rounded-xl overflow-hidden relative border border-gray-700 flex items-center justify-center">
                      <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                      {!remoteVideoRef.current?.srcObject && (
                        <div className="absolute text-gray-500 flex flex-col items-center">
                          <Users size={32} className="mb-2 opacity-50"/>
                          <span className="text-sm">Waiting for others to join...</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-gray-800 rounded-2xl p-6 flex-1 shadow-inner border border-gray-700 flex flex-col max-h-[30vh]">
                    <h3 className="text-sm font-semibold mb-3 text-blue-400 uppercase tracking-wider flex items-center gap-2">
                      <Activity size={14} /> Live AI Transcript
                    </h3>
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                      {transcripts.length === 0 ? (
                        <div className="text-gray-500 italic text-sm">Transcripts will appear here when someone speaks...</div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {transcripts.map((msg, idx) => (
                            <div key={idx} className="bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                              <span className="text-xs text-blue-300 font-bold block mb-1">{msg.user}</span>
                              <p className="text-gray-200 text-sm">{msg.text}</p>
                            </div>
                          ))}
                          <div ref={transcriptEndRef} />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-gray-800 rounded-2xl p-4 flex justify-between items-center border border-gray-700">
                    <div className="text-sm text-gray-400 flex items-center gap-2">
                      {isRecording && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>}
                      Room: <span className="font-bold text-white">{meetingId}</span>
                    </div>

                    <div className="flex gap-3">
                      <button onClick={toggleMute} className={`p-3 rounded-full transition-all ${isMuted ? 'bg-red-500/20 text-red-400' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}>
                        {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                      </button>
                      <button onClick={toggleVideo} className={`p-3 rounded-full transition-all ${!isVideoOn ? 'bg-red-500/20 text-red-400' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}>
                        {!isVideoOn ? <VideoOff size={20} /> : <Video size={20} />}
                      </button>
                      <button onClick={toggleScreenShare} className={`p-3 rounded-full transition-all ${isScreenSharing ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}>
                        <MonitorUp size={20} />
                      </button>
                      <button onClick={stopMeeting} className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-full font-bold shadow-lg flex items-center gap-2 ml-4">
                        <LogOut size={18} /> End
                      </button>
                    </div>
                  </div>

                </div>

                <div className="bg-gray-800 rounded-2xl p-6 h-[80vh] overflow-y-auto border border-gray-700 custom-scrollbar">
                  <h3 className="text-xl font-semibold mb-4 flex items-center gap-2 text-yellow-400 border-b border-gray-700 pb-2">
                    <FileText size={22} /> AI Summary
                  </h3>
                  {!summary ? (
                    <div className="flex flex-col items-center justify-center h-[60%] text-center text-gray-500 opacity-60">
                      <CheckCircle2 size={40} className="mb-3" />
                      <p className="text-sm">Summary will generate<br/>automatically when the<br/>meeting ends.</p>
                    </div>
                  ) : (
                    <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                      {summary.replace(/==================== FINAL SUMMARY ====================/g, "").replace(/=======================================================/g, "").trim()}
                    </div>
                  )}
                </div>

              </div>
            )}
          </>
        )}

        {/* TAB 2: HISTORY DASHBOARD */}
        {activeTab === 'history' && (
          <div className="bg-gray-800 rounded-2xl p-6 shadow-inner border border-gray-700 min-h-[65vh] animate-in fade-in duration-300">
            {selectedMeetingData ? (
              <div>
                <button onClick={() => setSelectedMeetingData(null)} className="flex items-center gap-2 text-blue-400 hover:text-blue-300 mb-6 transition-all">
                  <ArrowLeft size={18} /> Back to Dashboard
                </button>
                <div className="mb-6 pb-6 border-b border-gray-700">
                  <h2 className="text-2xl font-bold text-white mb-2">Meeting: {selectedMeetingData.meeting_id}</h2>
                  <div className="flex gap-4 text-gray-400 text-sm">
                    <span className="flex items-center gap-1"><Calendar size={14}/> {formatDate(selectedMeetingData.created_at)}</span>
                    <span className="flex items-center gap-1 text-green-400"><CheckCircle2 size={14}/> {selectedMeetingData.status}</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-700">
                    <h3 className="text-xl font-semibold mb-4 text-yellow-400 flex items-center gap-2"><FileText size={20}/> Executive Summary</h3>
                    <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                      {selectedMeetingData.summary || "No summary available for this meeting."}
                    </div>
                  </div>
                  <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-700 h-[50vh] overflow-y-auto custom-scrollbar">
                    <h3 className="text-xl font-semibold mb-4 text-blue-400 flex items-center gap-2"><Clock size={20}/> Full Transcript</h3>
                    <div className="space-y-4">
                      {selectedMeetingData.transcripts.map((msg: any, idx: number) => (
                        <div key={idx} className="bg-gray-800 p-3 rounded-lg border border-gray-700">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-blue-300 font-bold">{msg.user}</span>
                            <span className="text-xs text-gray-500">{new Date(msg.time).toLocaleTimeString()}</span>
                          </div>
                          <p className="text-gray-200 text-sm">{msg.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
                  <History className="text-blue-400" /> Previous Meetings
                </h2>
                {isLoadingHistory ? (
                  <div className="text-center text-gray-500 py-10">Loading history...</div>
                ) : meetingsList.length === 0 ? (
                  <div className="text-center text-gray-500 py-10">No past meetings found. Start a live meeting to see data here.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {meetingsList.map((meeting) => (
                      <div 
                        key={meeting.id} 
                        onClick={() => fetchMeetingDetails(meeting.id)}
                        className="bg-gray-900 border border-gray-700 p-5 rounded-xl cursor-pointer hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/10 transition-all group"
                      >
                        <h3 className="text-lg font-bold text-gray-100 group-hover:text-blue-400 mb-2 truncate">
                          {meeting.id}
                        </h3>
                        <div className="text-sm text-gray-400 mb-4 flex items-center gap-2">
                          <Calendar size={14} />
                          {formatDate(meeting.created_at)}
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded-full border border-green-500/30">
                            {meeting.status}
                          </span>
                          <span className="text-blue-400 group-hover:underline">View Details →</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

export default App;