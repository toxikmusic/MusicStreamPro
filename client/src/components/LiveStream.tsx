import { useState, useEffect, useRef } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, ExternalLink, Mic, MicOff, Video, VideoOff, Send, Users, Monitor, Settings, Key, Globe } from "lucide-react";
import { HLSStreamingSession } from "../lib/hlsStreaming";
import { SaveStreamRecordingDialog } from "./streams/SaveStreamRecordingDialog";

interface ChatMessage {
  senderId: string;
  message: string;
  timestamp: string;
  isCurrentUser?: boolean;
}

interface LiveStreamProps {
  initialStreamId?: string;
  userId?: number;
  userName?: string;
}

const LiveStream = ({ initialStreamId, userId, userName }: LiveStreamProps) => {
  // Stream mode states
  const [mode, setMode] = useState<"host" | "viewer">(initialStreamId ? "viewer" : "host");
  const [streamId, setStreamId] = useState(initialStreamId || "");
  const [shareUrl, setShareUrl] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [streamProtocol, setStreamProtocol] = useState<"webrtc" | "hls">("webrtc"); // Default to WebRTC
  
  // Stream details
  const [streamDetails, setStreamDetails] = useState<{
    streamType?: "video" | "audio";
    hasVisualElement?: boolean;
    visualElementUrl?: string;
    visualElementType?: "image" | "video";
  }>({});
  
  // Recording dialog state
  const [showSaveRecordingDialog, setShowSaveRecordingDialog] = useState(false);
  const [recordingStreamId, setRecordingStreamId] = useState<number>(0);
  const [temporaryRecordingUrl, setTemporaryRecordingUrl] = useState<string>();
  
  // Media device states
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [streamKey, setStreamKey] = useState("");
  const [audioSource, setAudioSource] = useState<"microphone" | "system">("microphone");
  const [availableDevices, setAvailableDevices] = useState<{
    videoDevices: MediaDeviceInfo[];
    audioDevices: MediaDeviceInfo[];
  }>({
    videoDevices: [],
    audioDevices: [],
  });
  const [selectedVideoDevice, setSelectedVideoDevice] = useState("");
  const [selectedAudioDevice, setSelectedAudioDevice] = useState("");
  
  // HLS streaming session
  const hlsSessionRef = useRef<HLSStreamingSession | null>(null);
  
  // Chat states
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  
  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Record<string, any>>({});
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  
  const { toast } = useToast();

  // Setup WebSocket function with simplified and robust connection handling
  const setupWebSocket = () => {
    // Create a WebSocket connection for signaling
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    // Simplified hostname and host handling
    let host = window.location.host;
    
    // Log environment info to debug WebSocket connection issues
    console.log("Chat WebSocket environment info:", {
      hostname: window.location.hostname,
      protocol: wsProtocol,
      host: host
    });
    
    const wsURL = `${wsProtocol}//${host}/ws`;
    console.log("Connecting to chat WebSocket:", wsURL);
    
    // Close any existing connection
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      try {
        wsRef.current.close();
      } catch (err) {
        console.warn("Error closing existing WebSocket:", err);
      }
    }
    
    // Create a new WebSocket connection with better error handling
    try {
      const ws = new WebSocket(wsURL);
      wsRef.current = ws;
      
      // Set a connection timeout to handle potential connection issues
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          console.log("WebSocket connection timeout - cleaning up");
          // Manually trigger close handler and cleanup
          if (ws.readyState !== WebSocket.CLOSED) {
            ws.close();
          }
        }
      }, 5000); // 5 second timeout
      
      // Clear timeout when connection succeeds
      ws.addEventListener('open', () => {
        clearTimeout(connectionTimeout);
      });
      
      // Setup WebSocket event handlers with simplified logic
      ws.onopen = () => {
        console.log("WebSocket connection established");
        
        // For viewers, join the stream automatically if provided
        if (initialStreamId && mode === "viewer") {
          const joinMessage = {
            type: "join-stream",
            data: { streamId: initialStreamId }
          };
          console.log("Sending join message for stream:", initialStreamId);
          ws.send(JSON.stringify(joinMessage));
          setIsStreaming(true);
        }
        
        // If we were already streaming as a host, reconnect
        if (isStreaming && mode === "host" && streamId) {
          console.log("Reconnecting as host for stream:", streamId);
          ws.send(JSON.stringify({
            type: "host-stream",
            data: { streamId }
          }));
        }
      };
    
    ws.onmessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        console.log("WebSocket message received:", message.type);
        
        switch (message.type) {
          case "viewer-joined":
            handleViewerJoined(message.data);
            break;
          case "viewer-left":
            handleViewerLeft(message.data);
            break;
          case "stream-offer":
            handleStreamOffer(message.data);
            break;
          case "stream-answer":
            handleStreamAnswer(message.data);
            break;
          case "ice-candidate":
            handleIceCandidate(message.data);
            break;
          case "viewer-count":
            setViewerCount(message.data.count);
            break;
          case "chat-message":
            handleChatMessage(message.data);
            break;
          case "stream-ended":
            handleStreamEnded();
            break;
          case "stream-not-found":
            handleStreamNotFound();
            break;
          default:
            console.warn("Unknown message type:", message.type);
        }
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
      }
    };
    
    ws.onerror = (error: Event) => {
      console.error("WebSocket error:", error);
      toast({
        title: "Connection Error",
        description: "Failed to establish connection to the signaling server. Will try to reconnect...",
        variant: "destructive"
      });
      
      // Set a timer to try reconnecting
      setTimeout(() => {
        if (wsRef.current && (wsRef.current.readyState === WebSocket.CLOSED || wsRef.current.readyState === WebSocket.CLOSING)) {
          console.log("Attempting to reconnect WebSocket...");
          setupWebSocket();
        }
      }, 3000);
    };
    
    ws.onclose = () => {
      console.log("WebSocket connection closed");
      
      // Try to reconnect only if we're not ending the connection intentionally
      if (isStreaming) {
        setTimeout(() => {
          console.log("Attempting to reconnect WebSocket after close...");
          setupWebSocket();
        }, 3000);
      }
    };
    } catch (error) {
      console.error("Error in WebSocket setup:", error);
      setTimeout(() => {
        console.log("Attempting to reconnect after WebSocket setup error...");
        setupWebSocket();
      }, 5000);
    }
  };
  
  // Initialize WebRTC peer connections
  useEffect(() => {
    setupWebSocket();
    
    // Cleanup on unmount
    return () => {
      // If this is the host, end the stream when leaving the page
      if (mode === "host" && streamId) {
        // End the stream based on protocol
        if (streamProtocol === "webrtc") {
          // End WebRTC stream
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: "end-stream",
              data: { streamId }
            }));
          }
        } else if (streamProtocol === "hls") {
          // End HLS stream - using a synchronous approach for unmount
          if (hlsSessionRef.current && hlsSessionRef.current.isStreamActive()) {
            try {
              // Use fetch with keepalive to ensure the request completes even if page is unloading
              fetch(`/api/streams/${streamId}/end`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                keepalive: true // This ensures the request completes even during page unload
              });
            } catch (error) {
              console.error("Error ending HLS stream during page unload:", error);
            }
          }
        }
      }
      
      // Stop all media tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      // Clean up peer connections
      Object.values(peersRef.current).forEach(peer => {
        peer.destroy();
      });
      
      // Close WebSocket connection
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [initialStreamId, mode, streamId, streamProtocol, toast]);
  
  // Handle viewer joined event
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
          wsRef.current?.send(JSON.stringify({
            type: "stream-offer",
            data: {
              streamId,
              description: data,
              viewerId
            }
          }));
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
  
  // Handle viewer left event
  const handleViewerLeft = ({ viewerId }: { viewerId: string }) => {
    console.log("Viewer left:", viewerId);
    if (peersRef.current[viewerId]) {
      peersRef.current[viewerId].destroy();
      delete peersRef.current[viewerId];
    }
  };
  
  // Handle stream offer for viewers
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
          wsRef.current?.send(JSON.stringify({
            type: "stream-answer",
            data: {
              hostId,
              description: data
            }
          }));
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
  
  // Handle stream answer for hosts
  const handleStreamAnswer = ({ viewerId, description }: { viewerId: string; description: any }) => {
    console.log("Received stream answer from viewer:", viewerId);
    if (mode === "host" && peersRef.current[viewerId]) {
      peersRef.current[viewerId].signal(description);
    }
  };
  
  // Handle ICE candidate
  const handleIceCandidate = ({ from, candidate }: { from: string; candidate: any }) => {
    console.log("Received ICE candidate from:", from);
    if (peersRef.current[from]) {
      peersRef.current[from].signal({ type: "candidate", candidate });
    }
  };
  
  // Handle chat message
  const handleChatMessage = ({ senderId, message, timestamp }: ChatMessage) => {
    const isCurrentUser = senderId === wsRef.current?.url;
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
  
  // Handle stream ended
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
      
      // Redirect to homepage after a short delay
      setTimeout(() => {
        window.location.href = '/';
      }, 3000); // 3 second delay to allow the toast message to be seen
    }
  };
  
  // Handle stream not found
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
  
  // State for tracking loading state
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);

  // Auto-join stream when initialStreamId is provided
  useEffect(() => {
    if (initialStreamId && mode === "viewer" && !isStreaming) {
      // Fetch stream details first with improved error handling
      const fetchStreamDetails = async () => {
        try {
          console.log("Fetching stream details for ID:", initialStreamId);
          setIsDetailsLoading(true);
          
          // Use a timeout to prevent infinite loading
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), 10000)
          );
          
          // Race the fetch against the timeout
          const responsePromise = fetch(`${window.location.origin}/api/streams/${initialStreamId}`);
          const response = await Promise.race([responsePromise, timeoutPromise]) as Response;
          
          if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
          }
          
          const data = await response.json();
          console.log("Stream details response:", data);
          
          // Clear loading state
          setIsDetailsLoading(false);
          
          if (data.success && data.stream) {
            // Check if the stream is actually live
            if (!data.stream.isLive) {
              console.log("Stream exists but is not live");
              toast({
                title: "Stream Not Live",
                description: "This stream exists but is not currently broadcasting",
                variant: "default"
              });
              return;
            }
            
            // Set stream details
            setStreamDetails({
              streamType: data.stream.streamType,
              hasVisualElement: !!data.stream.visualElementUrl,
              visualElementUrl: data.stream.visualElementUrl,
              visualElementType: data.stream.visualElementType || 'image'
            });
            
            // Log the stream details for debugging
            console.log("Stream details set:", {
              streamType: data.stream.streamType,
              hasVisualElement: !!data.stream.visualElementUrl,
              protocol: data.stream.protocol || 'webrtc'
            });
            
            // Set protocol based on stream type if available
            if (data.stream.protocol) {
              setStreamProtocol(data.stream.protocol);
            }
            
            // Join the stream if WebSocket is ready
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              console.log("WebSocket is open, joining stream:", initialStreamId);
              wsRef.current.send(JSON.stringify({
                type: "join-stream",
                data: { 
                  streamId: initialStreamId,
                  protocol: data.stream.protocol || streamProtocol
                }
              }));
              setIsStreaming(true);
              
              toast({
                title: "Joining Stream",
                description: "Connecting to the stream...",
              });
            } else {
              console.log("WebSocket not ready, current state:", wsRef.current?.readyState);
              // Try to reconnect WebSocket
              setupWebSocket();
              
              // Set a timeout to retry joining after WebSocket connects
              setTimeout(() => {
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  console.log("Retrying join after WebSocket connection");
                  wsRef.current.send(JSON.stringify({
                    type: "join-stream",
                    data: { 
                      streamId: initialStreamId,
                      protocol: data.stream.protocol || streamProtocol 
                    }
                  }));
                  setIsStreaming(true);
                }
              }, 1000);
            }
          } else {
            // Clear explicit stream not found or error
            console.log("Stream not found or not returned in response");
            setIsDetailsLoading(false);
            toast({
              title: "Stream Not Found",
              description: "The stream you're trying to join doesn't exist or has ended",
              variant: "destructive"
            });
          }
        } catch (error) {
          console.error("Error fetching stream details:", error);
          // Clear loading state and provide friendly error
          setIsDetailsLoading(false);
          toast({
            title: "Stream Unavailable",
            description: "This stream cannot be accessed. It may not exist or has ended.",
            variant: "destructive"
          });
        }
      };
      
      // Execute the fetch
      fetchStreamDetails();
    }
  }, [initialStreamId, mode, isStreaming, toast, setupWebSocket, streamProtocol]);

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

  // Host stream creation function
  const createStream = async () => {
    try {
      let stream: MediaStream;
      
      // Handle different audio sources
      if (audioSource === "system" && audioEnabled) {
        // Use getDisplayMedia to capture system audio
        try {
          console.log("Attempting to capture system audio...");
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: videoEnabled,
            audio: true
          });
          
          if (videoEnabled) {
            // If video is enabled, use the display capture for both video and audio
            stream = displayStream;
          } else {
            // If video is not enabled, we only need the audio tracks from display capture
            stream = new MediaStream();
            // Add only audio tracks from display capture
            displayStream.getAudioTracks().forEach(track => {
              stream.addTrack(track);
            });
            // Clean up video tracks we don't need
            displayStream.getVideoTracks().forEach(track => track.stop());
          }
          
          toast({
            title: "System Audio",
            description: "Capturing system audio. Ensure you've selected 'Share audio' in the browser dialog.",
          });
        } catch (error) {
          console.error("Error capturing system audio:", error);
          toast({
            title: "System Audio Error",
            description: "Failed to capture system audio. Falling back to microphone.",
            variant: "destructive"
          });
          // Fall back to microphone if system audio fails
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoEnabled ? { deviceId: selectedVideoDevice ? { exact: selectedVideoDevice } : undefined } : false,
            audio: audioEnabled ? { deviceId: selectedAudioDevice ? { exact: selectedAudioDevice } : undefined } : false
          });
        }
      } else {
        // Standard microphone and camera capture
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoEnabled ? { deviceId: selectedVideoDevice ? { exact: selectedVideoDevice } : undefined } : false,
          audio: audioEnabled ? { deviceId: selectedAudioDevice ? { exact: selectedAudioDevice } : undefined } : false
        });
      }
      
      // Store the local stream for later use
      localStreamRef.current = stream;
      
      // Display the local video feed if video is enabled
      if (localVideoRef.current) {
        if (videoEnabled) {
          localVideoRef.current.srcObject = stream;
        } else {
          // If no video, show a placeholder or hide the video element
          localVideoRef.current.srcObject = null;
        }
      }
      
      let streamData;
      
      if (streamProtocol === "webrtc") {
        // Create WebRTC stream
        console.log("Creating WebRTC stream");
        const response = await fetch(`${window.location.origin}/api/streams/webrtc`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId,
            userName: userName || 'Anonymous',
            title: `${userName || 'Anonymous'}'s Stream`,
            description: `Live stream by ${userName || 'Anonymous'}`,
            // Include metadata for shareable URL
            createShareableUrl: true
          })
        });
        
        streamData = await response.json();
        
        if (!streamData.success) {
          throw new Error(streamData.message || "Failed to create WebRTC stream");
        }
        
        // Generate shareable URL from the stream ID
        const shareableUrl = `${window.location.origin}/stream/${streamData.streamId}`;
        streamData.shareUrl = shareableUrl;
        
        // Emit host-stream event to WebSocket server for WebRTC
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: "host-stream",
            data: { streamId: streamData.streamId }
          }));
        }
      } else if (streamProtocol === "hls") {
        // Create HLS stream
        console.log("Creating HLS stream");
        
        // Create the HLS streaming session
        hlsSessionRef.current = new HLSStreamingSession({
          title: `${userName || 'Anonymous'}'s Stream`,
          description: `Live stream by ${userName || 'Anonymous'}`,
          category: "Music",
          tags: ["live", "hls"],
          // Include metadata for shareable URL
          createShareableUrl: true,
          onStreamCreated: (data) => {
            console.log("HLS stream created:", data);
            // Update UI with stream URL
          },
          onSegmentUploaded: (response) => {
            console.log("HLS segment uploaded:", response);
          },
          onStreamEnded: (response) => {
            console.log("HLS stream ended:", response);
            setIsStreaming(false);
          },
          onError: (error) => {
            console.error("HLS streaming error:", error);
            toast({
              title: "Streaming Error",
              description: error.message || "An error occurred during HLS streaming",
              variant: "destructive"
            });
          }
        });
        
        // Start the HLS stream
        const hlsStream = await hlsSessionRef.current.startStream(stream);
        
        // Generate shareable URL from the stream ID
        const shareableUrl = `${window.location.origin}/stream/${hlsStream.streamId}`;
        
        streamData = {
          success: true,
          streamId: hlsStream.streamId.toString(),
          shareUrl: shareableUrl || hlsStream.shareUrl
        };
      } else {
        throw new Error("Invalid streaming protocol selected");
      }
      
      // Update state with stream information
      setStreamId(streamData.streamId);
      setShareUrl(streamData.shareUrl || `${window.location.origin}/stream/${streamData.streamId}`);
      setIsStreaming(true);
      
      toast({
        title: "Stream Created",
        description: `Your ${streamProtocol.toUpperCase()} stream has been created successfully.`,
      });
      
      return streamData.streamId;
    } catch (error) {
      console.error("Error creating stream:", error);
      toast({
        title: "Stream Creation Failed",
        description: (error as Error).message || "Could not create stream",
        variant: "destructive"
      });
      return null;
    }
  };

  // Join existing stream function for viewers
  const joinStream = async () => {
    if (!streamId) {
      toast({
        title: "Stream ID Required",
        description: "Please enter a valid stream ID to join",
        variant: "destructive"
      });
      return;
    }
    
    // Check if the stream exists first
    try {
      const response = await fetch(`${window.location.origin}/api/streams/${streamId}`);
      const data = await response.json();
      
      if (!data.success) {
        toast({
          title: "Stream Not Found",
          description: "The stream ID you entered does not exist",
          variant: "destructive"
        });
        return;
      }
      
      // Store stream details if available
      if (data.stream) {
        setStreamDetails({
          streamType: data.stream.streamType,
          hasVisualElement: !!data.stream.visualElementUrl,
          visualElementUrl: data.stream.visualElementUrl,
          visualElementType: data.stream.visualElementType
        });
        
        // Set protocol based on stream type if available
        if (data.stream.protocol) {
          setStreamProtocol(data.stream.protocol);
        }
      }
      
      // Stream exists, join it
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "join-stream",
          data: { streamId }
        }));
      }
      setIsStreaming(true);
      
      toast({
        title: "Joining Stream",
        description: "Connected to stream successfully",
      });
    } catch (error) {
      console.error("Error joining stream:", error);
      toast({
        title: "Connection Error",
        description: "Failed to join the stream. Please try again.",
        variant: "destructive"
      });
    }
  };

  // End stream function
  const endStream = async () => {
    try {
      // Handle different protocols differently
      if (mode === "host") {
        if (streamProtocol === "webrtc") {
          // Notify server the WebRTC stream is ending
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && streamId) {
            wsRef.current.send(JSON.stringify({
              type: "end-stream",
              data: { streamId }
            }));
          }
        } else if (streamProtocol === "hls") {
          // End the HLS stream
          if (hlsSessionRef.current && hlsSessionRef.current.isStreamActive()) {
            console.log("Ending HLS stream");
            try {
              const endResult = await hlsSessionRef.current.stopStream();
              
              if (endResult.showSavePrompt && parseInt(streamId)) {
                // Show dialog to save or delete recording
                setRecordingStreamId(parseInt(streamId));
                setTemporaryRecordingUrl(endResult.temporaryUrl);
                setShowSaveRecordingDialog(true);
              }
            } catch (error) {
              console.error("Error ending HLS stream:", error);
              toast({
                title: "Error",
                description: "Failed to properly end the stream",
                variant: "destructive"
              });
            }
            
            hlsSessionRef.current = null;
          }
        }
      } else if (mode === "viewer" && streamId) {
        // For viewers, always leave the WebRTC stream if connected
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: "leave-stream",
            data: { streamId }
          }));
        }
        
        // For HLS viewers, just stop the video playback
        // This will be handled by the HTML5 video player itself
      }
      
      // Stop tracks and clean up
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      
      // Clear video elements
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      
      // Clean up peer connections
      Object.values(peersRef.current).forEach(peer => {
        peer.destroy();
      });
      peersRef.current = {};
      
      // Reset state
      setIsStreaming(false);
      setChatMessages([]);
      setViewerCount(0);
      
      toast({
        title: mode === "host" ? "Stream Ended" : "Left Stream",
        description: mode === "host" ? "Your live stream has ended" : "You have left the stream",
      });
    } catch (error) {
      console.error("Error ending stream:", error);
      toast({
        title: "Error",
        description: "Failed to properly end the stream. Some resources may not have been cleaned up.",
        variant: "destructive"
      });
      
      // Still reset the UI state to avoid user confusion
      setIsStreaming(false);
    }
  };

  // Toggle video/audio functions
  const toggleVideo = async () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      
      if (videoTracks.length > 0) {
        const enabled = !videoTracks[0].enabled;
        videoTracks.forEach(track => {
          track.enabled = enabled;
        });
        setVideoEnabled(enabled);
      } else if (!videoEnabled) {
        // If video is disabled and we have no video tracks, try to add one
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: selectedVideoDevice ? { exact: selectedVideoDevice } : undefined }
          });
          
          const videoTrack = stream.getVideoTracks()[0];
          
          if (videoTrack) {
            localStreamRef.current.addTrack(videoTrack);
            setVideoEnabled(true);
          }
        } catch (error) {
          console.error("Error adding video track:", error);
          toast({
            title: "Camera Error",
            description: "Could not enable camera",
            variant: "destructive"
          });
        }
      }
    }
  };
  
  const toggleAudio = async () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      
      if (audioTracks.length > 0) {
        const enabled = !audioTracks[0].enabled;
        audioTracks.forEach(track => {
          track.enabled = enabled;
        });
        setAudioEnabled(enabled);
      } else if (!audioEnabled) {
        // If audio is disabled and we have no audio tracks, try to add one
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: selectedAudioDevice ? { exact: selectedAudioDevice } : undefined }
          });
          
          const audioTrack = stream.getAudioTracks()[0];
          
          if (audioTrack) {
            localStreamRef.current.addTrack(audioTrack);
            setAudioEnabled(true);
          }
        } catch (error) {
          console.error("Error adding audio track:", error);
          toast({
            title: "Microphone Error",
            description: "Could not enable microphone",
            variant: "destructive"
          });
        }
      }
    }
  };
  
  // Screen sharing function
  const toggleScreenShare = async () => {
    if (!localStreamRef.current) return;
    
    try {
      // Check if screen sharing is supported
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
        throw new Error("Screen sharing is not supported in this browser or environment");
      }
      
      if (isScreenSharing) {
        // Stop screen sharing
        const videoTracks = localStreamRef.current.getVideoTracks();
        videoTracks.forEach(track => {
          if (track.label.includes("screen") || track.label.includes("display")) {
            localStreamRef.current?.removeTrack(track);
            track.stop();
          }
        });
        
        // Re-enable camera if it was enabled before
        if (videoEnabled) {
          const cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: selectedVideoDevice ? { exact: selectedVideoDevice } : undefined }
          });
          
          const cameraTrack = cameraStream.getVideoTracks()[0];
          if (cameraTrack) {
            localStreamRef.current.addTrack(cameraTrack);
          }
        }
        
        setIsScreenSharing(false);
        toast({
          title: "Screen Sharing Stopped",
          description: "Your screen is no longer being shared",
        });
      } else {
        try {
          // Start screen sharing with a feature detection safety check
          const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
            video: true,
            audio: true  // Include audio from the screen if available
          });
          
          // Remove any existing video tracks
          const existingVideoTracks = localStreamRef.current.getVideoTracks();
          existingVideoTracks.forEach(track => {
            localStreamRef.current?.removeTrack(track);
            track.stop();
          });
          
          // Add the screen share video track
          const screenVideoTrack = screenStream.getVideoTracks()[0];
          if (screenVideoTrack) {
            localStreamRef.current.addTrack(screenVideoTrack);
            
            // Listen for the user ending screen share through the browser UI
            screenVideoTrack.onended = () => {
              toggleScreenShare();
            };
          }
          
          // Add any audio tracks from the screen share
          const screenAudioTracks = screenStream.getAudioTracks();
          if (screenAudioTracks.length > 0) {
            // Remove existing audio tracks
            const existingAudioTracks = localStreamRef.current.getAudioTracks();
            existingAudioTracks.forEach(track => {
              localStreamRef.current?.removeTrack(track);
              // Don't stop these as we might want to re-add them
            });
            
            // Add the screen audio track
            screenAudioTracks.forEach(track => {
              localStreamRef.current?.addTrack(track);
            });
          }
          
          setIsScreenSharing(true);
          setVideoEnabled(true);
          toast({
            title: "Screen Sharing Started",
            description: "Your screen is now being shared with viewers",
          });
        } catch (screenError) {
          // User might have cancelled the screen share prompt
          if ((screenError as Error).name === 'NotAllowedError') {
            throw new Error("Screen sharing permission denied. Please allow access to share your screen.");
          } else {
            throw screenError;
          }
        }
      }
      
      // Update all peer connections with the new stream
      Object.values(peersRef.current).forEach(peer => {
        try {
          // Replace tracks in all active connections
          if (peer._senderMap) {
            peer._senderMap.forEach((sender: any) => {
              if (sender.track.kind === 'video') {
                const videoTrack = localStreamRef.current?.getVideoTracks()[0];
                if (videoTrack) {
                  sender.replaceTrack(videoTrack);
                }
              }
              if (sender.track.kind === 'audio') {
                const audioTrack = localStreamRef.current?.getAudioTracks()[0];
                if (audioTrack) {
                  sender.replaceTrack(audioTrack);
                }
              }
            });
          }
        } catch (peerError) {
          console.warn("Error updating peer connection:", peerError);
        }
      });
      
    } catch (error) {
      console.error("Error toggling screen share:", error);
      toast({
        title: "Screen Sharing Error",
        description: (error as Error).message || "Could not share your screen",
        variant: "destructive"
      });
    }
  };
  
  // Generate a stream key for OBS
  const generateStreamKey = () => {
    // Create a random stream key
    const key = Math.random().toString(36).substring(2, 15) + 
                Math.random().toString(36).substring(2, 15);
    
    setStreamKey(key);
    toast({
      title: "Stream Key Generated",
      description: "Use this key in OBS or other streaming software",
    });
  };
  // Chat function
  const sendChatMessage = () => {
    if (!currentMessage.trim() || !streamId || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    wsRef.current.send(JSON.stringify({
      type: "chat-message",
      data: {
        streamId,
        message: currentMessage.trim()
      }
    }));
    
    setCurrentMessage("");
  };

  // Copy stream URL to clipboard
  const copyShareUrl = () => {
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        toast({
          title: "Copied!",
          description: "Stream URL copied to clipboard",
        });
      })
      .catch(err => {
        console.error("Failed to copy:", err);
      });
  };

  // Host UI
  const renderHostUI = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="col-span-1 md:col-span-2">
        <Card className="overflow-hidden">
          <CardHeader className="bg-zinc-950/40 pb-2 pt-4">
            <CardTitle className="flex justify-between items-center text-lg">
              <div className="flex items-center space-x-2">
                <span>Live Stream</span>
                {isStreaming && (
                  <Badge variant="destructive" className="animate-pulse">LIVE</Badge>
                )}
              </div>
              {isStreaming && (
                <div className="flex items-center space-x-2">
                  <Users className="h-4 w-4 text-white/70" />
                  <span className="text-white/70 text-sm">{viewerCount} viewers</span>
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="relative aspect-video bg-black">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              
              <div className="absolute bottom-3 left-0 right-0 flex justify-center space-x-3">
                <Button
                  variant={videoEnabled ? "default" : "destructive"}
                  size="sm"
                  onClick={toggleVideo}
                  className="rounded-full"
                >
                  {videoEnabled ? <Video className="h-4 w-4 mr-1" /> : <VideoOff className="h-4 w-4 mr-1" />}
                  {videoEnabled ? "Camera On" : "Camera Off"}
                </Button>
                
                <Button
                  variant={audioEnabled ? "default" : "destructive"}
                  size="sm"
                  onClick={toggleAudio}
                  className="rounded-full"
                >
                  {audioEnabled ? <Mic className="h-4 w-4 mr-1" /> : <MicOff className="h-4 w-4 mr-1" />}
                  {audioEnabled ? "Mic On" : "Mic Off"}
                </Button>
                
                {isStreaming && navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function' && (
                  <Button
                    variant={isScreenSharing ? "destructive" : "default"}
                    size="sm"
                    onClick={toggleScreenShare}
                    className="rounded-full"
                  >
                    <Monitor className="h-4 w-4 mr-1" />
                    {isScreenSharing ? "Stop Sharing" : "Share Screen"}
                  </Button>
                )}
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSettings(!showSettings)}
                  className="rounded-full"
                >
                  <Settings className="h-4 w-4 mr-1" />
                  Settings
                </Button>
              </div>
            </div>
            
            {showSettings && (
              <div className="p-4 bg-zinc-900/80 border-t border-zinc-800">
                <h3 className="text-sm font-medium mb-2">Stream Settings</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="camera-select" className="text-xs">
                      Camera
                    </Label>
                    <Select
                      value={selectedVideoDevice}
                      onValueChange={setSelectedVideoDevice}
                      disabled={isStreaming}
                    >
                      <SelectTrigger id="camera-select" className="w-full">
                        <SelectValue placeholder="Select camera" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableDevices.videoDevices.map((device) => (
                          <SelectItem key={device.deviceId} value={device.deviceId}>
                            {device.label || `Camera ${device.deviceId.slice(0, 5)}...`}
                          </SelectItem>
                        ))}
                        {availableDevices.videoDevices.length === 0 && (
                          <SelectItem value="none" disabled>
                            No cameras found
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="mic-select" className="text-xs">
                      Microphone
                    </Label>
                    <Select
                      value={selectedAudioDevice}
                      onValueChange={setSelectedAudioDevice}
                      disabled={isStreaming}
                    >
                      <SelectTrigger id="mic-select" className="w-full">
                        <SelectValue placeholder="Select microphone" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableDevices.audioDevices.map((device) => (
                          <SelectItem key={device.deviceId} value={device.deviceId}>
                            {device.label || `Microphone ${device.deviceId.slice(0, 5)}...`}
                          </SelectItem>
                        ))}
                        {availableDevices.audioDevices.length === 0 && (
                          <SelectItem value="none" disabled>
                            No microphones found
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="md:col-span-2">
                    <Label className="text-xs mb-2 block">
                      Audio Source
                    </Label>
                    <div className="flex items-center justify-start space-x-4 mb-4">
                      <div className="flex items-center space-x-2">
                        <input 
                          type="radio" 
                          id="mic-source" 
                          name="audio-source" 
                          checked={audioSource === "microphone"} 
                          onChange={() => setAudioSource("microphone")}
                          disabled={isStreaming}
                        />
                        <Label htmlFor="mic-source" className="cursor-pointer">
                          <Mic className="h-4 w-4 inline mr-1" />
                          Microphone
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input 
                          type="radio" 
                          id="system-source" 
                          name="audio-source" 
                          checked={audioSource === "system"} 
                          onChange={() => setAudioSource("system")}
                          disabled={isStreaming}
                        />
                        <Label htmlFor="system-source" className="cursor-pointer">
                          <Monitor className="h-4 w-4 inline mr-1" />
                          System Audio
                        </Label>
                      </div>
                    </div>
                  </div>
                  
                  <div className="md:col-span-2">
                    <Label htmlFor="stream-key" className="text-xs">
                      Stream Key (for OBS/External Software)
                    </Label>
                    <div className="flex mt-1">
                      <Input 
                        id="stream-key"
                        type="text" 
                        value={streamKey} 
                        readOnly
                        className="font-mono text-sm flex-grow"
                      />
                      <Button 
                        onClick={generateStreamKey} 
                        variant="outline"
                        size="sm"
                        className="ml-2"
                      >
                        <Key className="h-4 w-4 mr-1" />
                        Generate
                      </Button>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">
                      Use this key in OBS Studio or other streaming software to connect.
                    </p>
                  </div>
                  
                  {/* Screen sharing info message */}
                  {(!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') && (
                    <div className="md:col-span-2 mt-2 p-3 bg-amber-900/20 border border-amber-900/30 rounded-md">
                      <p className="text-xs text-amber-400">
                        <strong>Note:</strong> Screen sharing is not available in this browser or environment. 
                        For screen sharing functionality, please try using a modern browser like Chrome, Firefox, 
                        or Edge on a desktop computer.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="bg-zinc-950/40 flex justify-between py-3">
            {!isStreaming ? (
              <Button onClick={createStream} variant="default" className="w-full">
                Start Streaming
              </Button>
            ) : (
              <Button onClick={endStream} variant="destructive" className="w-full">
                End Stream
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
      
      {isStreaming && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Share your stream</CardTitle>
              <CardDescription>
                Use this link to share your stream with others
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <Input
                  value={shareUrl}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button onClick={copyShareUrl} size="icon" variant="outline">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-2 text-sm text-zinc-500">
                Stream ID: <span className="font-mono">{streamId}</span>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Live Chat</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                ref={chatContainerRef}
                className="h-[200px] overflow-y-auto border rounded-md p-2 mb-2 bg-black/20"
              >
                {chatMessages.length === 0 ? (
                  <div className="text-center text-zinc-500 pt-8">
                    Chat messages will appear here
                  </div>
                ) : (
                  chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`mb-2 ${
                        msg.isCurrentUser
                          ? "text-right"
                          : "text-left"
                      }`}
                    >
                      <div
                        className={`inline-block rounded-lg px-3 py-1 text-sm ${
                          msg.isCurrentUser
                            ? "bg-purple-700 text-white"
                            : "bg-zinc-800 text-white"
                        }`}
                      >
                        <div className="font-bold text-xs opacity-70">
                          {msg.isCurrentUser ? "You" : `Anonymous (${msg.senderId.slice(0, 4)})`}
                        </div>
                        {msg.message}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="flex space-x-2">
                <Input
                  placeholder="Type a message..."
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      sendChatMessage();
                    }
                  }}
                />
                <Button onClick={sendChatMessage} size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );

  // Viewer UI
  const renderViewerUI = () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="col-span-1 md:col-span-2">
        <Card className="overflow-hidden">
          <CardHeader className="bg-zinc-950/40 pb-2 pt-4">
            <CardTitle className="flex justify-between items-center text-lg">
              <div className="flex items-center space-x-2">
                <span>Watching Stream</span>
                {isStreaming && (
                  <Badge variant="destructive" className="animate-pulse">LIVE</Badge>
                )}
              </div>
              {isStreaming && (
                <div className="flex items-center space-x-2">
                  <Users className="h-4 w-4 text-white/70" />
                  <span className="text-white/70 text-sm">{viewerCount} viewers</span>
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="relative aspect-video bg-black">
              {!isStreaming ? (
                <div className="flex items-center justify-center h-full flex-col">
                  <div className="text-center p-6">
                    <h3 className="text-lg font-medium">Join a Stream</h3>
                    <p className="text-zinc-400 text-sm mb-4">
                      Enter a stream ID to join as a viewer
                    </p>
                    <div className="flex space-x-2 mb-4">
                      <Input
                        placeholder="Enter stream ID"
                        value={streamId}
                        onChange={(e) => setStreamId(e.target.value)}
                        className="max-w-xs"
                      />
                      <Button onClick={joinStream}>
                        Join
                      </Button>
                    </div>
                  </div>
                </div>
              ) : streamDetails.streamType === "audio" && streamDetails.hasVisualElement ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  {/* Display visual element for audio stream */}
                  {streamDetails.visualElementType === "image" ? (
                    <img 
                      src={streamDetails.visualElementUrl} 
                      alt="Stream visual" 
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <video
                      src={streamDetails.visualElementUrl}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="max-w-full max-h-full object-contain"
                    />
                  )}
                  
                  {/* Audio element for audio streams */}
                  <audio
                    ref={remoteVideoRef as React.RefObject<HTMLAudioElement>}
                    autoPlay
                    playsInline
                    className="hidden"
                  />
                </div>
              ) : (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
              )}
            </div>
          </CardContent>
          <CardFooter className="bg-zinc-950/40 flex justify-between py-3">
            {isStreaming && (
              <Button onClick={endStream} variant="outline" className="w-full">
                Leave Stream
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
      
      {isStreaming && (
        <Card className="md:row-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Live Chat</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              ref={chatContainerRef}
              className="h-[300px] overflow-y-auto border rounded-md p-2 mb-2 bg-black/20"
            >
              {chatMessages.length === 0 ? (
                <div className="text-center text-zinc-500 pt-8">
                  Chat messages will appear here
                </div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`mb-2 ${
                      msg.isCurrentUser ? "text-right" : "text-left"
                    }`}
                  >
                    <div
                      className={`inline-block rounded-lg px-3 py-1 text-sm ${
                        msg.isCurrentUser
                          ? "bg-purple-700 text-white"
                          : "bg-zinc-800 text-white"
                      }`}
                    >
                      <div className="font-bold text-xs opacity-70">
                        {msg.isCurrentUser
                          ? "You"
                          : `Anonymous (${msg.senderId.slice(0, 4)})`}
                      </div>
                      {msg.message}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex space-x-2">
              <Input
                placeholder="Type a message..."
                value={currentMessage}
                onChange={(e) => setCurrentMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    sendChatMessage();
                  }
                }}
              />
              <Button onClick={sendChatMessage} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  return (
    <div className="container mx-auto p-4">
      <Tabs defaultValue={initialStreamId ? "viewer" : "host"} onValueChange={(value) => setMode(value as "host" | "viewer")}>
        <TabsList className="mb-4 mx-auto grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="host">Host Stream</TabsTrigger>
          <TabsTrigger value="viewer">Join Stream</TabsTrigger>
        </TabsList>
        
        <TabsContent value="host">
          {renderHostUI()}
        </TabsContent>
        
        <TabsContent value="viewer">
          {renderViewerUI()}
        </TabsContent>
      </Tabs>
      
      {/* Save Recording Dialog */}
      <SaveStreamRecordingDialog
        isOpen={showSaveRecordingDialog}
        onClose={() => setShowSaveRecordingDialog(false)}
        streamId={recordingStreamId}
        temporaryUrl={temporaryRecordingUrl}
      />
    </div>
  );
};

export default LiveStream;
