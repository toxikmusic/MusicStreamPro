import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import MobileNavigation from "@/components/layout/MobileNavigation";
import AudioPlayer from "@/components/layout/AudioPlayer";
import { Stream, User } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Send, Users, Volume2, VolumeX, BarChart3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Slider } from "@/components/ui/slider";
import { type StreamStatus } from '@/lib/audioStreaming';
import { mediaStreamingService } from '@/lib/mediaStreaming';
import { socketIOStreamingService } from '@/lib/socketIoStreaming';
import AudioVisualizer from "@/components/audio/AudioVisualizer";
import LiveStream from "@/components/LiveStream";

type ChatMessage = {
  id: number;
  userId: number;
  username: string;
  message: string;
  timestamp: Date;
};

export default function StreamPage() {
  // Get stream ID from URL
  const [match, params] = useRoute("/stream/:id");
  const streamId = params?.id ? parseInt(params.id) : undefined;
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isAudioConnected, setIsAudioConnected] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [frequencyData, setFrequencyData] = useState<Uint8Array | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>({ 
    isLive: false, 
    viewerCount: 0, 
    peakViewerCount: 0,
    audioLevel: -60 // Initial level (silent)
  });
  const socketRef = useRef<WebSocket | null>(null);
  
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Stream data is now fetched from the API using React Query
  
  // Query for stream data
  const { data: stream, isLoading: streamLoading, isError: streamError } = useQuery<Stream>({
    queryKey: ['/api/streams', streamId],
    enabled: !!streamId
  });
  
  // Query for streamer info
  const { data: streamer, isLoading: streamerLoading } = useQuery<User>({
    queryKey: ['/api/users', stream?.userId],
    enabled: !!stream?.userId
  });
  
  // Show a toast when stream doesn't exist
  useEffect(() => {
    if (streamError) {
      toast({
        title: "Stream not found",
        description: "The stream you're looking for doesn't exist or has ended.",
        variant: "default",
      });
    } else if (stream && !stream.isLive) {
      // Stream exists but isn't live
      toast({
        title: "Stream not active",
        description: "This stream is currently offline. Please check back later.",
        variant: "default",
      });
    }
  }, [streamError, stream, toast]);
  
  // Draw audio visualization using canvas
  const drawVisualization = (data: Uint8Array) => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Set up visualization style
    const barWidth = canvas.width / data.length * 2.5;
    const barSpacing = 1;
    const barHeightFactor = canvas.height / 255;
    
    // Draw frequency bars
    ctx.fillStyle = 'rgba(138, 43, 226, 0.8)'; // Purple color matching theme
    
    for (let i = 0; i < data.length; i++) {
      const barHeight = data[i] * barHeightFactor;
      const x = i * (barWidth + barSpacing);
      const y = canvas.height - barHeight;
      
      // Draw gradient bars
      const gradient = ctx.createLinearGradient(x, y, x, canvas.height);
      gradient.addColorStop(0, 'rgba(138, 43, 226, 0.8)');
      gradient.addColorStop(1, 'rgba(185, 103, 255, 0.5)');
      ctx.fillStyle = gradient;
      
      ctx.fillRect(x, y, barWidth, barHeight);
    }
  };
  
  // Connect to chat WebSocket
  useEffect(() => {
    if (!streamId) return;
    
    // Setup WebSocket connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Detect if we're in a Replit environment
    const isReplit = window.location.hostname.endsWith('.replit.app') || 
                     window.location.hostname.includes('replit') || 
                     window.location.hostname === 'localhost';
    
    // For Replit, strip the port number from the host
    let host = window.location.host;
    if (isReplit) {
      // Use full host (including port) for localhost development
      // But for .replit.app domains, use just the hostname
      if (window.location.hostname !== 'localhost' && host.includes(':')) {
        host = window.location.hostname; // Use only hostname without port
      }
    }
    const wsUrl = `${protocol}//${host}/ws`;
    
    console.log("Chat WebSocket environment info:", {
      isReplit,
      hostname: window.location.hostname,
      protocol,
      host
    });
    console.log("Connecting to chat WebSocket:", wsUrl);
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;
    
    // Handle WebSocket events
    socket.onopen = () => {
      setIsConnected(true);
      
      // Join the chat room for this stream
      if (streamId) {
        const joinMessage = {
          type: 'join',
          streamId: streamId,
          userId: user?.id,
          username: user?.displayName || 'Guest'
        };
        socket.send(JSON.stringify(joinMessage));
      }
    };
    
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'chat_message':
            // Add new message to chat
            setChatMessages(prev => [...prev, {
              id: data.id || Date.now(),
              userId: data.userId || 0,
              username: data.username || 'Anonymous',
              message: data.message || '',
              timestamp: new Date(data.timestamp) || new Date()
            }]);
            break;
            
          case 'chat_history':
            // Replace chat with history
            if (Array.isArray(data.messages)) {
              setChatMessages(data.messages.map((msg: any) => ({
                ...msg,
                timestamp: new Date(msg.timestamp)
              })));
            }
            break;
            
          case 'viewer_count':
            // Update viewer count
            setViewerCount(data.viewerCount || 0);
            break;
            
          case 'stream_status':
            // Update stream status
            setStreamStatus({
              isLive: data.isLive || false,
              viewerCount: data.viewerCount || 0,
              peakViewerCount: data.peakViewerCount || 0,
              streamId: data.streamId,
              startTime: data.startTime ? new Date(data.startTime) : undefined
            });
            break;
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
    
    socket.onclose = () => {
      setIsConnected(false);
      // Try to reconnect after delay
      setTimeout(() => {
        if (socketRef.current?.readyState !== WebSocket.OPEN) {
          // If still not connected, reconnect
        }
      }, 5000);
    };
    
    socket.onerror = (error) => {
      setIsConnected(false);
      console.error('WebSocket error:', error);
    };
    
    // Cleanup function
    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        // Send leave message before closing
        if (streamId) {
          const leaveMessage = {
            type: 'leave',
            streamId: streamId,
            userId: user?.id,
            username: user?.displayName || 'Guest'
          };
          socket.send(JSON.stringify(leaveMessage));
        }
        socket.close();
      }
    };
  }, [streamId, user, toast]);
  
  // Connect to audio stream and handle visualizations only when stream is active
  useEffect(() => {
    // Don't proceed if we're missing stream ID or stream data
    if (!streamId) return;
    
    // Check if the stream is actually live and available
    const isStreamActive = stream?.isLive || streamStatus.isLive;
    
    // Don't try to connect if we know the stream doesn't exist or isn't live
    if (stream && !isStreamActive) {
      console.log("Stream exists but isn't live - not connecting to WebSocket");
      return;
    }
    
    console.log("Stream status check:", { 
      streamId, 
      isLive: stream?.isLive, 
      statusIsLive: streamStatus.isLive,
      isStreamActive
    });
    
    // Set up audio stream visualization
    const setupAudioVisualizer = async () => {
      // Check one more time if stream is active before proceeding
      if (!isStreamActive && stream) {
        console.log("Stream not active, aborting audio connection");
        return;
      }
      
      try {
        setIsAudioConnected(false);
        
        // Connect to our dedicated audio WebSocket as a listener
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        
        // Handle WebSocket URL specially for Replit environment
        // Detect if we're in a Replit environment based on hostname
        const isReplit = window.location.hostname.endsWith('.replit.app') || 
                       window.location.hostname.includes('replit') || 
                       window.location.hostname === 'localhost';
        
        // In Replit, we must use the correct hostname without any extra port
        // For Replit environments
        let host = window.location.host;
        if (isReplit) {
          // Use full host (including port) for localhost development
          // But for .replit.app domains, use just the hostname
          if (window.location.hostname !== 'localhost' && host.includes(':')) {
            host = window.location.hostname; // Use only hostname without port
          }
        }
        
        // Include the stream key for authentication
        const streamKey = stream?.streamKey || '';
        const audioWsUrl = `${protocol}//${host}/audio?streamId=${streamId}&role=listener&streamKey=${streamKey}`;
        
        console.log("Environment info:", {
          isReplit,
          hostname: window.location.hostname,
          protocol,
          host
        });
        
        console.log(`Connecting to audio streaming WebSocket as listener: ${audioWsUrl}`);
        
        // Set up audio WebSocket connection
        const audioSocket = new WebSocket(audioWsUrl);
        
        // Create audio context for processing incoming audio data
        const audioContext = new AudioContext();
        const gainNode = audioContext.createGain();
        gainNode.gain.value = volume;
        
        // Create analyser for visualizations
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        // Connect gain node to analyser for visualization
        gainNode.connect(analyser);
        
        // Connect analyser to destination for audio output
        analyser.connect(audioContext.destination);
        
        // Handle WebSocket connection events
        audioSocket.onopen = () => {
          setIsAudioConnected(true);
          toast({
            title: "Audio stream connected",
            description: "You are now listening to the live audio stream.",
            variant: "default",
          });
        };
        
        // Handle incoming audio data
        audioSocket.onmessage = async (event) => {
          try {
            // Check if we received binary data
            if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
              let arrayBuffer: ArrayBuffer;
              
              // Convert to ArrayBuffer if needed
              if (event.data instanceof Blob) {
                arrayBuffer = await event.data.arrayBuffer();
              } else {
                arrayBuffer = event.data;
              }
              
              // Decode audio data and play
              audioContext.decodeAudioData(
                arrayBuffer, 
                (audioBuffer) => {
                  // Create buffer source for playing audio
                  const source = audioContext.createBufferSource();
                  source.buffer = audioBuffer;
                  
                  // Connect to gain node (which is connected to analyser and destination)
                  source.connect(gainNode);
                  
                  // Start playback
                  source.start(0);
                  
                  // Get visualization data
                  analyser.getByteFrequencyData(dataArray);
                  setFrequencyData(new Uint8Array(dataArray));
                  drawVisualization(dataArray);
                },
                (error) => {
                  console.error("Error decoding audio data:", error);
                }
              );
            } else if (typeof event.data === 'string') {
              // Handle possible control messages
              try {
                const message = JSON.parse(event.data);
                if (message.type === 'stream_status') {
                  setStreamStatus({
                    isLive: message.isLive || false,
                    viewerCount: message.viewerCount || 0,
                    peakViewerCount: message.peakViewerCount || 0,
                    streamId: message.streamId,
                    startTime: message.startTime ? new Date(message.startTime) : undefined,
                    audioLevel: message.audioLevel !== undefined ? message.audioLevel : streamStatus.audioLevel
                  });
                } else if (message.type === 'audio_level') {
                  // Handle dedicated audio level updates
                  setStreamStatus(prev => ({
                    ...prev,
                    audioLevel: message.level || prev.audioLevel
                  }));
                }
              } catch (e) {
                console.error("Error parsing control message:", e);
              }
            }
          } catch (error) {
            console.error("Error processing audio data:", error);
          }
        };
        
        // Handle connection close
        audioSocket.onclose = () => {
          setIsAudioConnected(false);
          // Only show toast if we were previously connected
          if (isAudioConnected) {
            toast({
              title: "Audio stream ended",
              description: "The broadcaster has ended the stream.",
            });
          }
        };
        
        // Handle connection errors
        audioSocket.onerror = (error) => {
          setIsAudioConnected(false);
          console.error("Audio WebSocket error:", error);
          console.log("Connection details:", {
            url: audioWsUrl.replace(/streamKey=([^&]+)/, 'streamKey=****'),
            readyState: audioSocket ? audioSocket.readyState : 'socket_not_initialized',
            streamId,
            role: 'listener',
            hasStreamKey: !!streamKey
          });
          
          // Always show toast once
          toast({
            title: "Audio stream offline",
            description: "The stream is currently offline or unavailable.",
            variant: "default",
          });
        };
        
        // Set up regular visualization updates
        const updateVisualization = () => {
          if (isAudioConnected && canvasRef.current) {
            analyser.getByteFrequencyData(dataArray);
            setFrequencyData(new Uint8Array(dataArray)); 
            drawVisualization(dataArray);
          }
          
          // Continue animation loop
          requestAnimationFrame(updateVisualization);
        };
        
        // Start visualization
        updateVisualization();
        
        // Return cleanup function
        return () => {
          if (audioSocket && audioSocket.readyState === WebSocket.OPEN) {
            audioSocket.close();
          }
          
          if (audioContext && audioContext.state !== 'closed') {
            audioContext.close();
          }
        };
        
      } catch (error) {
        console.error("Error setting up audio stream:", error);
        toast({
          title: "Connection error",
          description: "Failed to connect to audio stream.",
          variant: "destructive",
        });
        
        return () => {}; // Return empty cleanup function
      }
    };
    
    setupAudioVisualizer();
    
    return () => {
      // Clean up audio connections
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, [streamId, volume, toast, drawVisualization]);
  
  // Initialize UI and scroll chat to bottom on load
  useEffect(() => {
    // Initialize empty chat until we receive messages from WebSocket
    if (!chatMessages.length) {
      setChatMessages([]);
    }
    
    // Simulate video playback with poster image
    if (videoRef.current && displayedStream.thumbnailUrl) {
      videoRef.current.poster = displayedStream.thumbnailUrl;
    }
    
    // Scroll chat to bottom
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!chatMessage.trim()) return;
    
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && streamId) {
      // Send message through WebSocket
      const messageData = {
        type: 'chat',
        streamId: streamId,
        userId: user?.id,
        username: user?.displayName || 'Guest',
        message: chatMessage
      };
      
      socketRef.current.send(JSON.stringify(messageData));
      setChatMessage("");
      
      // We don't need to add the message to the chat manually
      // The server will broadcast it and we'll receive it back
    } else {
      // Fallback for when socket is not connected
      toast({
        title: "Connection issue",
        description: "Cannot send message, trying to reconnect...",
        variant: "destructive",
      });
      
      // Add message locally if not connected
      const newMessage: ChatMessage = {
        id: Date.now(),
        userId: user?.id || 0,
        username: user?.displayName || 'Guest',
        message: chatMessage,
        timestamp: new Date()
      };
      
      setChatMessages([...chatMessages, newMessage]);
      setChatMessage("");
    }
  };

  const toggleFollow = () => {
    setIsFollowing(!isFollowing);
  };

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Create default stream and streamer objects to use while loading
  const defaultStream: Partial<Stream> = {
    id: streamId || 0,
    title: "Loading stream...",
    description: "Stream information is loading",
    isLive: false,
    viewerCount: 0,
    tags: []
  };
  
  const defaultStreamer: Partial<User> = {
    id: 0,
    username: "loading",
    displayName: "Loading...",
    followerCount: 0
  };
  
  const displayedStream = stream || defaultStream as Stream;
  const displayedStreamer = streamer || defaultStreamer as User;

  return (
    <div className="flex flex-col min-h-screen bg-dark-300 text-white">
      <Header />
      
      <main className="flex flex-1 pt-14 md:pt-16">
        <Sidebar />
        
        <div className="flex-1 md:ml-60 pb-20 md:pb-24">
          <div className="max-w-7xl mx-auto px-4 py-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Stream video area */}
              <div className="lg:col-span-2">
                <div className="bg-black rounded-lg overflow-hidden aspect-video">
                  {streamLoading ? (
                    <Skeleton className="w-full h-full" />
                  ) : (
                    stream?.isLive || streamStatus.isLive ? (
                      <LiveStream 
                        initialStreamId={streamId?.toString()}
                        userId={user?.id}
                        userName={user?.displayName}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full bg-black/80 p-4 text-center">
                        <h3 className="text-xl font-bold mb-2">Stream Offline</h3>
                        <p className="text-gray-300 mb-4">
                          This stream is currently not broadcasting.
                        </p>
                        
                        {displayedStream.thumbnailUrl ? (
                          <div className="relative w-full max-w-md overflow-hidden rounded shadow-lg">
                            <img 
                              src={displayedStream.thumbnailUrl}
                              alt="Stream thumbnail"
                              className="w-full opacity-70"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="bg-black/60 px-4 py-2 rounded">
                                OFFLINE
                              </div>
                            </div>
                          </div>
                        ) : (
                          <video 
                            ref={videoRef}
                            className="w-full max-w-md object-contain opacity-50"
                            controls={false}
                            playsInline
                            poster={displayedStream.thumbnailUrl || undefined}
                          >
                            <source src="" type="video/mp4" />
                            Your browser does not support the video tag.
                          </video>
                        )}
                      </div>
                    )
                  )}
                </div>
                
                <div className="mt-4">
                  {streamLoading || streamerLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-6 w-3/4" />
                      <div className="flex space-x-2">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="space-y-1">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h1 className="text-xl font-bold">{displayedStream.title}</h1>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-start space-x-2">
                          <Avatar className="w-10 h-10">
                            <AvatarImage src={displayedStreamer.profileImageUrl || undefined} />
                            <AvatarFallback>{displayedStreamer.displayName.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <h2 className="font-medium">{displayedStreamer.displayName}</h2>
                            <p className="text-sm text-gray-400">{displayedStreamer.followerCount ? displayedStreamer.followerCount.toLocaleString() : '0'} followers</p>
                          </div>
                        </div>
                        <Button 
                          onClick={toggleFollow}
                          variant={isFollowing ? "outline" : "default"}
                          className={`${isFollowing ? 'bg-dark-100 hover:bg-dark-300' : 'bg-primary hover:bg-primary/80'}`}
                        >
                          {isFollowing ? 'Following' : 'Follow'}
                        </Button>
                      </div>
                      
                      <Separator className="my-4 bg-dark-100" />
                      
                      <div>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {(stream?.isLive || streamStatus.isLive) ? (
                            <Badge className="bg-[#00b074] hover:bg-[#00b074]/80">
                              <span className="inline-block w-2 h-2 bg-white rounded-full animate-pulse mr-1.5"></span>
                              LIVE
                            </Badge>
                          ) : (
                            <Badge className="bg-gray-600 hover:bg-gray-500">
                              <span className="inline-block w-2 h-2 bg-gray-400 mr-1.5"></span>
                              OFFLINE
                            </Badge>
                          )}
                          <Badge variant="outline" className="bg-dark-100 hover:bg-dark-100">
                            <Users size={14} className="mr-1" />
                            {(viewerCount || displayedStream.viewerCount || 0).toLocaleString()} viewers
                          </Badge>
                          {displayedStream.tags?.map((tag: string, idx: number) => (
                            <Badge key={idx} variant="outline" className="bg-dark-100 hover:bg-dark-100">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-gray-300">{displayedStream.description}</p>
                      </div>
                      
                      {/* Audio controls and visualizer */}
                      <div className="mt-4 space-y-3">
                        {/* Audio Level Meter */}
                        {streamStatus.audioLevel !== undefined && (
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs min-w-[50px] text-gray-400">
                              {Math.round(streamStatus.audioLevel)} dB
                            </span>
                            <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all duration-100 ${
                                  // Color changes based on level:
                                  // Green for good levels (-30 to -12dB)
                                  // Yellow for high levels (-12 to -6dB)
                                  // Red for too high (above -6dB)
                                  streamStatus.audioLevel > -12 
                                    ? streamStatus.audioLevel > -6 
                                      ? "bg-red-500" 
                                      : "bg-yellow-500"
                                    : "bg-emerald-500"
                                }`}
                                style={{ 
                                  // Convert dB to percentage width (from -60dB to 0dB)
                                  width: `${Math.min(100, Math.max(0, ((streamStatus.audioLevel + 60) / 60) * 100))}%` 
                                }}
                              />
                            </div>
                          </div>
                        )}
                      
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-10 w-10 rounded-full"
                              onClick={() => setIsMuted(!isMuted)}
                            >
                              {isMuted ? (
                                <VolumeX className="h-5 w-5 text-gray-400" />
                              ) : (
                                <Volume2 className="h-5 w-5 text-gray-200" />
                              )}
                            </Button>
                            
                            <Slider
                              className="w-32"
                              value={[isMuted ? 0 : volume * 100]}
                              min={0}
                              max={100}
                              step={1}
                              onValueChange={(value) => {
                                const newVolume = value[0] / 100;
                                setVolume(newVolume);
                                setIsMuted(newVolume === 0);
                                if (audioRef.current) {
                                  audioRef.current.volume = newVolume;
                                }
                              }}
                            />
                          </div>
                          
                          <div className="flex items-center space-x-2">
                            <BarChart3 className="h-5 w-5 text-gray-400" />
                            <span className="text-sm text-gray-400">
                              Audio Visualization
                            </span>
                          </div>
                          
                          <div className="flex ml-auto space-x-2">
                            <Badge variant={isAudioConnected ? "default" : "outline"} className={isAudioConnected ? "bg-green-600" : "bg-transparent"}>
                              {isAudioConnected ? "Audio Connected" : "No Audio"}
                            </Badge>
                          </div>
                        </div>
                        
                        {/* Audio visualizer */}
                        <div className="bg-dark-100 rounded-md overflow-hidden aspect-[4/1]">
                          <canvas
                            ref={canvasRef}
                            className="w-full h-full"
                            width={600}
                            height={150}
                          />
                        </div>
                        
                        {/* Hidden audio element */}
                        <audio
                          ref={audioRef}
                          className="hidden"
                          autoPlay
                          muted={isMuted}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
              
              {/* Chat area */}
              <div className="bg-dark-200 rounded-lg overflow-hidden flex flex-col h-[600px]">
                <div className="p-3 border-b border-dark-100 flex justify-between items-center">
                  <h3 className="font-medium">Live Chat</h3>
                  <div className="flex items-center text-xs">
                    {isConnected ? (
                      <span className="flex items-center text-green-500">
                        <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse mr-1.5"></span>
                        Connected
                      </span>
                    ) : (
                      <span className="flex items-center text-red-500">
                        <span className="inline-block w-2 h-2 bg-red-500 rounded-full mr-1.5"></span>
                        Disconnected
                      </span>
                    )}
                  </div>
                </div>
                
                <div 
                  ref={chatContainerRef}
                  className="flex-1 overflow-y-auto p-3 space-y-3"
                >
                  {chatMessages.length > 0 ? (
                    chatMessages.map((msg) => (
                      <div key={msg.id} className="flex space-x-2">
                        <div className="shrink-0">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback className="text-xs">{msg.username[0]}</AvatarFallback>
                          </Avatar>
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className={`text-sm font-medium ${msg.username === user?.displayName ? 'text-primary' : 'text-gray-300'}`}>
                              {msg.username}
                            </span>
                            <span className="text-xs text-gray-500">
                              {formatTimestamp(msg.timestamp)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-200 break-words">{msg.message}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
                      <p>No messages yet</p>
                      <p className="mt-2">Be the first to chat!</p>
                    </div>
                  )}
                </div>
                
                <form onSubmit={handleSendMessage} className="p-3 border-t border-dark-100 flex">
                  <Input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder="Send a message"
                    className="bg-dark-100 border-dark-100 focus-visible:ring-primary"
                  />
                  <Button type="submit" size="icon" className="ml-2 bg-primary hover:bg-primary/80">
                    <Send size={16} />
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      <div className="fixed bottom-16 left-0 right-0 bg-dark-200 border-t border-dark-100">
  <div className="h-12 px-4">
    <AudioVisualizer audioLevel={typeof streamStatus.audioLevel === 'number' ? streamStatus.audioLevel : -60} />
  </div>
  <AudioPlayer />
</div>
      <MobileNavigation />
    </div>
  );
}