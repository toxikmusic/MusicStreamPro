import { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import SimplePeer from "simple-peer";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink, Mic, MicOff, Video, VideoOff, Send, Users } from "lucide-react";

interface ChatMessage {
  senderId: string;
  message: string;
  timestamp: string;
  isCurrentUser?: boolean;
}

interface LiveStreamProps {
  initialStreamId?: string;
}

const LiveStream = ({ initialStreamId }: LiveStreamProps) => {
  // Stream mode states
  const [mode, setMode] = useState<"host" | "viewer">(initialStreamId ? "viewer" : "host");
  const [streamId, setStreamId] = useState(initialStreamId || "");
  const [shareUrl, setShareUrl] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  
  // Media device states
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [availableDevices, setAvailableDevices] = useState<{
    videoDevices: MediaDeviceInfo[];
    audioDevices: MediaDeviceInfo[];
  }>({
    videoDevices: [],
    audioDevices: [],
  });
  const [selectedVideoDevice, setSelectedVideoDevice] = useState("");
  const [selectedAudioDevice, setSelectedAudioDevice] = useState("");
  
  // Chat states
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  
  // Refs
  const socketRef = useRef<Socket | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Record<string, SimplePeer.Instance>>({});
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  
  const { toast } = useToast();

  // Initialize socket connection
  useEffect(() => {
    const socket = io("/");
    socketRef.current = socket;
    
    // Cleanup on unmount
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      
      // Clean up peer connections
      Object.values(peersRef.current).forEach(peer => {
        peer.destroy();
      });
    };
  }, []);
  
  // Setup socket event listeners
  useEffect(() => {
    if (!socketRef.current) return;
    
    const handleViewerJoined = ({ viewerId }: { viewerId: string }) => {
      console.log("New viewer joined:", viewerId);
      if (mode === "host" && localStreamRef.current) {
        try {
          // Create new peer connection for the viewer with STUN servers
          const peer = new SimplePeer({
            initiator: true,
            trickle: true,
            stream: localStreamRef.current,
            config: {
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
              ]
            }
          });
          
          // Store the peer
          peersRef.current[viewerId] = peer;
          
          // Handle signaling
          peer.on("signal", (data) => {
            console.log("Host signaling data generated for viewer:", viewerId);
            socketRef.current?.emit("stream-offer", {
              streamId,
              description: data,
              viewerId
            });
          });
          
          // Handle disconnect
          peer.on("close", () => {
            console.log("Peer connection closed with viewer:", viewerId);
            delete peersRef.current[viewerId];
          });
          
          // Handle errors
          peer.on("error", (err) => {
            console.error("WebRTC error with viewer:", viewerId, err);
            toast({
              title: "Connection Error",
              description: "Failed to establish connection with viewer. Please try again.",
              variant: "destructive"
            });
            delete peersRef.current[viewerId];
          });
        } catch (error) {
          console.error("Error creating host peer connection:", error);
          toast({
            title: "Connection Error",
            description: "Failed to establish streaming connection. Please try again.",
            variant: "destructive"
          });
        }
      }
    };
    
    const handleViewerLeft = ({ viewerId }: { viewerId: string }) => {
      console.log("Viewer left:", viewerId);
      if (peersRef.current[viewerId]) {
        peersRef.current[viewerId].destroy();
        delete peersRef.current[viewerId];
      }
    };
    
    const handleStreamOffer = ({ hostId, description }: { hostId: string; description: any }) => {
      console.log("Received stream offer from host:", hostId);
      if (mode === "viewer") {
        try {
          // Create new peer connection to accept the offer with STUN servers
          const peer = new SimplePeer({
            initiator: false,
            trickle: true,
            config: {
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
              ]
            }
          });
          
          peersRef.current[hostId] = peer;
          
          // Accept the offer
          peer.signal(description);
          
          // Send answer back to host
          peer.on("signal", (data) => {
            console.log("Viewer signaling data generated for host:", hostId);
            socketRef.current?.emit("stream-answer", {
              hostId,
              description: data
            });
          });
          
          // When we get the remote stream
          peer.on("stream", (stream) => {
            console.log("Received remote stream from host");
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = stream;
            }
          });
          
          // Handle errors
          peer.on("error", (err) => {
            console.error("WebRTC error with host:", hostId, err);
            toast({
              title: "Connection Error",
              description: "Failed to connect to stream. The host may have poor connectivity.",
              variant: "destructive"
            });
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = null;
            }
            peer.destroy();
            delete peersRef.current[hostId];
          });
          
          // Handle peer closing
          peer.on("close", () => {
            console.log("Peer connection closed with host:", hostId);
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = null;
            }
            delete peersRef.current[hostId];
          });
        } catch (error) {
          console.error("Error creating viewer peer connection:", error);
          toast({
            title: "Connection Error",
            description: "Failed to establish connection to stream. Please try again.",
            variant: "destructive"
          });
        }
      }
    };
    
    const handleStreamAnswer = ({ viewerId, description }: { viewerId: string; description: any }) => {
      console.log("Received stream answer from viewer:", viewerId);
      if (mode === "host" && peersRef.current[viewerId]) {
        peersRef.current[viewerId].signal(description);
      }
    };
    
    const handleIceCandidate = ({ from, candidate }: { from: string; candidate: any }) => {
      console.log("Received ICE candidate from:", from);
      if (peersRef.current[from]) {
        peersRef.current[from].signal({ type: "candidate", candidate });
      }
    };
    
    const handleViewerCount = ({ count }: { count: number }) => {
      setViewerCount(count);
    };
    
    const handleChatMessage = ({ senderId, message, timestamp }: ChatMessage) => {
      const isCurrentUser = senderId === socketRef.current?.id;
      setChatMessages(prev => [...prev, { senderId, message, timestamp, isCurrentUser }]);
      
      // Auto-scroll chat to bottom
      if (chatContainerRef.current) {
        setTimeout(() => {
          if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
          }
        }, 100);
      }
    };
    
    const handleStreamEnded = () => {
      if (mode === "viewer") {
        toast({
          title: "Stream ended",
          description: "The host has ended the stream.",
          variant: "destructive"
        });
        
        // Clean up
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = null;
        }
        
        setIsStreaming(false);
      }
    };
    
    const handleStreamNotFound = () => {
      if (mode === "viewer") {
        toast({
          title: "Stream not found",
          description: "The stream ID you entered does not exist.",
          variant: "destructive"
        });
        
        setIsStreaming(false);
      }
    };
    
    // Register event handlers
    socketRef.current.on("viewer-joined", handleViewerJoined);
    socketRef.current.on("viewer-left", handleViewerLeft);
    socketRef.current.on("stream-offer", handleStreamOffer);
    socketRef.current.on("stream-answer", handleStreamAnswer);
    socketRef.current.on("ice-candidate", handleIceCandidate);
    socketRef.current.on("viewer-count", handleViewerCount);
    socketRef.current.on("chat-message", handleChatMessage);
    socketRef.current.on("stream-ended", handleStreamEnded);
    socketRef.current.on("stream-not-found", handleStreamNotFound);
    
    // Cleanup
    return () => {
      if (socketRef.current) {
        socketRef.current.off("viewer-joined", handleViewerJoined);
        socketRef.current.off("viewer-left", handleViewerLeft);
        socketRef.current.off("stream-offer", handleStreamOffer);
        socketRef.current.off("stream-answer", handleStreamAnswer);
        socketRef.current.off("ice-candidate", handleIceCandidate);
        socketRef.current.off("viewer-count", handleViewerCount);
        socketRef.current.off("chat-message", handleChatMessage);
        socketRef.current.off("stream-ended", handleStreamEnded);
        socketRef.current.off("stream-not-found", handleStreamNotFound);
      }
    };
  }, [mode, streamId, toast]);
  
  // Auto-join stream when initialStreamId is provided
  useEffect(() => {
    if (initialStreamId && mode === "viewer" && socketRef.current && !isStreaming) {
      // Automatically join the stream
      socketRef.current.emit("join-stream", { streamId: initialStreamId });
      setIsStreaming(true);
      
      toast({
        title: "Joining Stream",
        description: "Connecting to the stream...",
      });
    }
  }, [initialStreamId, mode, isStreaming, toast]);

  // Get available media devices
  useEffect(() => {
    async function getDevices() {
      try {
        // Try to request permissions with a more permissive approach
        let mediaStream = null;
        try {
          // First try both video and audio
          mediaStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
          });
        } catch (bothError) {
          console.warn("Could not access both camera and microphone:", bothError);
          
          try {
            // Try just video
            mediaStream = await navigator.mediaDevices.getUserMedia({ 
              video: true, 
              audio: false 
            });
            
            toast({
              title: "Limited Access",
              description: "Camera access granted, but microphone access was denied.",
            });
          } catch (videoError) {
            console.warn("Could not access camera:", videoError);
            
            try {
              // Try just audio
              mediaStream = await navigator.mediaDevices.getUserMedia({ 
                video: false, 
                audio: true 
              });
              
              toast({
                title: "Limited Access",
                description: "Microphone access granted, but camera access was denied.",
              });
            } catch (audioError) {
              console.error("Could not access any media devices:", audioError);
              throw new Error("No media devices could be accessed");
            }
          }
        }
        
        // Release the temporary stream
        if (mediaStream) {
          mediaStream.getTracks().forEach(track => track.stop());
        }
        
        // Now enumerate available devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        const videoDevices = devices.filter(device => device.kind === "videoinput");
        const audioDevices = devices.filter(device => device.kind === "audioinput");
        
        // Check if we got meaningful device information (with labels)
        // If not, it often means permissions weren't fully granted
        const hasVideoLabels = videoDevices.some(device => !!device.label);
        const hasAudioLabels = audioDevices.some(device => !!device.label);
        
        if (!hasVideoLabels && !hasAudioLabels && (videoDevices.length > 0 || audioDevices.length > 0)) {
          console.warn("Device information available but without labels - permissions may be limited");
        }
        
        setAvailableDevices({
          videoDevices,
          audioDevices
        });
        
        // Set default devices if not already set
        if (videoDevices.length > 0 && !selectedVideoDevice) {
          setSelectedVideoDevice(videoDevices[0].deviceId);
        }
        
        if (audioDevices.length > 0 && !selectedAudioDevice) {
          setSelectedAudioDevice(audioDevices[0].deviceId);
        }
      } catch (error) {
        console.error("Error getting media devices:", error);
        
        // Show a more informative error message
        let errorMessage = "Unable to access your camera or microphone.";
        if ((error as Error).message.includes("Permission denied")) {
          errorMessage = "Permission denied. Please allow camera and microphone access in your browser settings.";
        } else if ((error as Error).message.includes("No media devices")) {
          errorMessage = "No camera or microphone detected. Please connect a device and try again.";
        }
        
        toast({
          title: "Device Access Error",
          description: errorMessage,
          variant: "destructive"
        });
      }
    }
    
    getDevices();
  }, [toast, selectedVideoDevice, selectedAudioDevice]);
  
  // Start streaming as host
  const startHosting = async () => {
    try {
      // First check if user media can be accessed
      try {
        // Try for the combination the user has selected
        const targetConstraints = {
          video: videoEnabled,
          audio: audioEnabled
        };
        
        // Log what we're trying to access
        console.log("Attempting to access media with constraints:", JSON.stringify(targetConstraints));
        
        // Try with a simplified constraint first for better browser compatibility
        if (videoEnabled && audioEnabled) {
          try {
            // First try with simpler constraint structure
            await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true
            });
            console.log("Successfully accessed both camera and microphone with simple constraints");
          } catch (simpleError) {
            console.warn("Could not access with simple constraints, trying exact device IDs:", simpleError);
            // If that fails, try with specific device IDs
            await navigator.mediaDevices.getUserMedia({
              video: selectedVideoDevice ? { deviceId: { exact: selectedVideoDevice } } : true,
              audio: selectedAudioDevice ? { deviceId: { exact: selectedAudioDevice } } : true
            });
            console.log("Successfully accessed both camera and microphone with specific device IDs");
          }
        } else {
          // Just use the target constraints directly for single-media scenarios
          await navigator.mediaDevices.getUserMedia(targetConstraints);
          console.log("Successfully accessed media with partial constraints (video or audio only)");
        }
      } catch (mediaError) {
        console.error("Media access error:", mediaError);
        
        let errorMessage = "Unable to access your camera/microphone.";
        if ((mediaError as Error).message.includes("Permission denied")) {
          errorMessage += " Please allow camera and microphone access in your browser settings.";
        } else if ((mediaError as Error).message.includes("Could not start video source")) {
          errorMessage += " Your camera may be in use by another application.";
        } else if ((mediaError as Error).message.includes("Requested device not found")) {
          errorMessage += " The selected camera or microphone was not found. Please check your device connections.";
        } else {
          errorMessage += " Please check your device connections or try different settings.";
        }
        
        toast({
          title: "Permission Error",
          description: errorMessage,
          variant: "destructive"
        });
        return;
      }
      
      // Create a new stream
      try {
        const response = await fetch("/api/streams", {
          method: "POST",
        });
        
        const data = await response.json();
        
        if (!data.success) {
          throw new Error("Failed to create stream");
        }
        
        setStreamId(data.streamId);
        setShareUrl(data.shareUrl);
      } catch (apiError) {
        throw new Error("Failed to create stream API endpoint: " + (apiError as Error).message);
      }
      
      // Get media stream with selected devices
      try {
        const constraints = {
          video: videoEnabled ? { deviceId: selectedVideoDevice ? { exact: selectedVideoDevice } : undefined } : false,
          audio: audioEnabled ? { deviceId: selectedAudioDevice ? { exact: selectedAudioDevice } : undefined } : false
        };
        
        console.log("Requesting media with constraints:", constraints);
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log("Media stream obtained successfully");
        
        // Log track information
        stream.getTracks().forEach(track => {
          console.log(`Track ${track.id}: kind=${track.kind}, enabled=${track.enabled}, muted=${track.muted}`);
        });
        
        // Store the stream reference
        localStreamRef.current = stream;
        
        // Attach to video element
        if (localVideoRef.current) {
          console.log("Attaching stream to local video element");
          localVideoRef.current.srcObject = stream;
          
          // Ensure playback starts
          try {
            await localVideoRef.current.play();
            console.log("Video playback started");
          } catch (playError) {
            console.warn("Auto-play failed, may need user interaction:", playError);
          }
        } else {
          console.warn("Local video element ref is not available");
        }
      } catch (streamError) {
        console.error("Failed to get media stream:", streamError);
        throw new Error("Failed to get media stream: " + (streamError as Error).message);
      }
      
      // Join the stream room as host
      socketRef.current?.emit("host-stream", { streamId });
      
      setIsStreaming(true);
      
      toast({
        title: "Stream Started",
        description: "Your stream has started. Share the link with others to invite them.",
      });
    } catch (error) {
      console.error("Error starting stream:", error);
      toast({
        title: "Stream Error",
        description: (error as Error).message || "Failed to start streaming. Please check your permissions and try again.",
        variant: "destructive"
      });
    }
  };
  
  // Join stream as viewer
  const joinStream = () => {
    try {
      if (!streamId) {
        toast({
          title: "Stream ID Required",
          description: "Please enter a valid stream ID to join.",
          variant: "destructive"
        });
        return;
      }
      
      if (!socketRef.current || !socketRef.current.connected) {
        toast({
          title: "Connection Error",
          description: "Unable to connect to the server. Please refresh the page and try again.",
          variant: "destructive"
        });
        return;
      }
      
      // Join the stream
      socketRef.current.emit("join-stream", { streamId });
      setIsStreaming(true);
      
      toast({
        title: "Joining Stream",
        description: "Connecting to the stream...",
      });
    } catch (error) {
      console.error("Error joining stream:", error);
      toast({
        title: "Join Error",
        description: "Failed to join the stream. Please try again.",
        variant: "destructive"
      });
    }
  };
  
  // End streaming or leave stream
  const endStream = () => {
    if (mode === "host") {
      // Stop local stream
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      // Close all peer connections
      Object.values(peersRef.current).forEach(peer => {
        peer.destroy();
      });
      peersRef.current = {};
      
      // Clear video element
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      
      toast({
        title: "Stream Ended",
        description: "Your stream has been ended.",
      });
    } else {
      // Leave the stream room
      socketRef.current?.emit("leave-stream", { streamId });
      
      // Close peer connection with host
      Object.values(peersRef.current).forEach(peer => {
        peer.destroy();
      });
      peersRef.current = {};
      
      // Clear video element
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      
      toast({
        title: "Left Stream",
        description: "You have left the stream.",
      });
    }
    
    setIsStreaming(false);
    setChatMessages([]);
  };
  
  // Toggle video
  const toggleVideo = async () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !videoEnabled;
      });
      setVideoEnabled(!videoEnabled);
    }
  };
  
  // Toggle audio
  const toggleAudio = async () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !audioEnabled;
      });
      setAudioEnabled(!audioEnabled);
    }
  };
  
  // Send chat message
  const sendChatMessage = () => {
    if (!currentMessage.trim() || !socketRef.current) return;
    
    socketRef.current.emit("chat-message", {
      streamId,
      message: currentMessage
    });
    
    setCurrentMessage("");
  };
  
  // Copy share URL to clipboard
  const copyShareUrl = () => {
    navigator.clipboard.writeText(shareUrl);
    toast({
      title: "URL Copied",
      description: "Stream URL copied to clipboard.",
    });
  };
  
  return (
    <div className="w-full">
      <Tabs defaultValue={initialStreamId ? "viewer" : "host"} onValueChange={(value) => setMode(value as "host" | "viewer")}>
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="host">Host Stream</TabsTrigger>
          <TabsTrigger value="viewer">Join Stream</TabsTrigger>
        </TabsList>
        
        <TabsContent value="host" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Host a Live Stream</CardTitle>
              <CardDescription>
                Stream from your device camera and microphone
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!isStreaming ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="video-source">Camera Source</Label>
                      <select 
                        id="video-source"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        value={selectedVideoDevice}
                        onChange={(e) => setSelectedVideoDevice(e.target.value)}
                      >
                        {availableDevices.videoDevices.map((device) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label || `Camera ${device.deviceId.slice(0, 5)}...`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="audio-source">Microphone Source</Label>
                      <select 
                        id="audio-source"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        value={selectedAudioDevice}
                        onChange={(e) => setSelectedAudioDevice(e.target.value)}
                      >
                        {availableDevices.audioDevices.map((device) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label || `Microphone ${device.deviceId.slice(0, 5)}...`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <Switch 
                        id="video-enabled" 
                        checked={videoEnabled} 
                        onCheckedChange={setVideoEnabled}
                      />
                      <Label htmlFor="video-enabled">Enable Video</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch 
                        id="audio-enabled" 
                        checked={audioEnabled} 
                        onCheckedChange={setAudioEnabled}
                      />
                      <Label htmlFor="audio-enabled">Enable Audio</Label>
                    </div>
                  </div>

                  <Button onClick={startHosting} className="w-full">Start Streaming</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="aspect-video bg-black rounded-lg overflow-hidden relative">
                    <video 
                      ref={localVideoRef} 
                      autoPlay 
                      playsInline 
                      muted 
                      controls={false}
                      className="w-full h-full object-cover"
                      style={{ transform: 'scaleX(-1)' }} /* Mirror video for better user experience */
                    />
                    
                    <div className="absolute bottom-4 left-0 right-0 flex justify-center space-x-2">
                      <Button 
                        size="sm" 
                        variant={videoEnabled ? "outline" : "destructive"} 
                        className="bg-black/50 backdrop-blur-sm" 
                        onClick={toggleVideo}
                      >
                        {videoEnabled ? <Video className="h-4 w-4 mr-2" /> : <VideoOff className="h-4 w-4 mr-2" />}
                        {videoEnabled ? "Video On" : "Video Off"}
                      </Button>
                      
                      <Button 
                        size="sm" 
                        variant={audioEnabled ? "outline" : "destructive"}
                        className="bg-black/50 backdrop-blur-sm" 
                        onClick={toggleAudio}
                      >
                        {audioEnabled ? <Mic className="h-4 w-4 mr-2" /> : <MicOff className="h-4 w-4 mr-2" />}
                        {audioEnabled ? "Mic On" : "Mic Off"}
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {viewerCount} viewer{viewerCount !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                      <Button variant="destructive" onClick={endStream}>End Stream</Button>
                    </div>
                    
                    <div className="p-3 bg-muted rounded-md flex items-center justify-between">
                      <p className="text-sm text-muted-foreground truncate">{shareUrl}</p>
                      <div className="flex-shrink-0 flex space-x-2">
                        <Button size="icon" variant="ghost" onClick={copyShareUrl}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" asChild>
                          <a href={shareUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          
          {isStreaming && (
            <Card>
              <CardHeader>
                <CardTitle>Live Chat</CardTitle>
              </CardHeader>
              <CardContent>
                <div 
                  ref={chatContainerRef}
                  className="h-[200px] overflow-y-auto p-3 border rounded-md mb-3 space-y-2"
                >
                  {chatMessages.length === 0 && (
                    <p className="text-sm text-center text-muted-foreground pt-6">
                      No messages yet. Be the first to say hello!
                    </p>
                  )}
                  
                  {chatMessages.map((msg, idx) => (
                    <div 
                      key={idx}
                      className={`flex flex-col ${msg.isCurrentUser ? 'items-end' : 'items-start'}`}
                    >
                      <div 
                        className={`px-3 py-2 rounded-lg max-w-[80%] break-words ${
                          msg.isCurrentUser 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted'
                        }`}
                      >
                        {msg.message}
                      </div>
                      <span className="text-xs text-muted-foreground mt-1">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
                
                <div className="flex space-x-2">
                  <Input 
                    value={currentMessage}
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    placeholder="Type a message..."
                    onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                  />
                  <Button onClick={sendChatMessage}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        <TabsContent value="viewer" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Join a Live Stream</CardTitle>
              <CardDescription>
                Enter a stream ID to watch and interact
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!isStreaming ? (
                <div className="space-y-4">
                  <div className="flex space-x-2">
                    <Input 
                      value={streamId}
                      onChange={(e) => setStreamId(e.target.value)}
                      placeholder="Enter stream ID"
                    />
                    <Button onClick={joinStream}>Join</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="aspect-video bg-black rounded-lg overflow-hidden relative">
                    <video 
                      ref={remoteVideoRef} 
                      autoPlay 
                      playsInline 
                      controls={false}
                      className="w-full h-full object-cover"
                      onLoadedMetadata={(e) => {
                        console.log("Remote video metadata loaded");
                        try {
                          e.currentTarget.play().catch(err => {
                            console.warn("Auto-play of remote video failed:", err);
                          });
                        } catch (error) {
                          console.warn("Error playing remote video:", error);
                        }
                      }}
                    />
                    
                    <div className="absolute top-2 right-2">
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {viewerCount} viewer{viewerCount !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                  </div>
                  
                  <Button variant="destructive" onClick={endStream} className="w-full">
                    Leave Stream
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          
          {isStreaming && (
            <Card>
              <CardHeader>
                <CardTitle>Live Chat</CardTitle>
              </CardHeader>
              <CardContent>
                <div 
                  ref={chatContainerRef}
                  className="h-[200px] overflow-y-auto p-3 border rounded-md mb-3 space-y-2"
                >
                  {chatMessages.length === 0 && (
                    <p className="text-sm text-center text-muted-foreground pt-6">
                      No messages yet. Be the first to say hello!
                    </p>
                  )}
                  
                  {chatMessages.map((msg, idx) => (
                    <div 
                      key={idx}
                      className={`flex flex-col ${msg.isCurrentUser ? 'items-end' : 'items-start'}`}
                    >
                      <div 
                        className={`px-3 py-2 rounded-lg max-w-[80%] break-words ${
                          msg.isCurrentUser 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted'
                        }`}
                      >
                        {msg.message}
                      </div>
                      <span className="text-xs text-muted-foreground mt-1">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
                
                <div className="flex space-x-2">
                  <Input 
                    value={currentMessage}
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    placeholder="Type a message..."
                    onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                  />
                  <Button onClick={sendChatMessage}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default LiveStream;