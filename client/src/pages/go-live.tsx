import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import LiveStream from "@/components/LiveStream";
import { useToast } from "@/hooks/use-toast";
import { createStream } from "@/lib/api"; // Function to create stream via API
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, Mic, Video, Volume2, Monitor, Image, Music, Radio } from "lucide-react";

export default function GoLivePage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Stream type and state
  const [streamType, setStreamType] = useState<"video" | "audio">("video");
  const [setupStep, setSetupStep] = useState<"choose" | "setup" | "live">("choose");
  
  // Stream settings state
  const [streamTitle, setStreamTitle] = useState<string>("");
  const [streamDescription, setStreamDescription] = useState<string>("");
  const [streamCategory, setStreamCategory] = useState<string>("Music");
  const [streamId, setStreamId] = useState<string | null>(null);
  
  // Media state
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [availableDevices, setAvailableDevices] = useState<{
    videoDevices: MediaDeviceInfo[];
    audioDevices: MediaDeviceInfo[];
    audioOutputDevices: MediaDeviceInfo[];
  }>({ 
    videoDevices: [], 
    audioDevices: [],
    audioOutputDevices: []
  });
  
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>("");
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>("");
  const [selectedAudioOutputDevice, setSelectedAudioOutputDevice] = useState<string>("");
  const [useCamera, setUseCamera] = useState<boolean>(true);
  const [useMicrophone, setUseMicrophone] = useState<boolean>(true);
  const [useSystemAudio, setUseSystemAudio] = useState<boolean>(false);
  
  // Visual element for audio streams
  const [visualElement, setVisualElement] = useState<File | null>(null);
  const [visualPreviewUrl, setVisualPreviewUrl] = useState<string>("");
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Check if user is logged in
  useEffect(() => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "You need to be logged in to start a live stream.",
        variant: "destructive",
      });
      navigate("/login");
    } else {
      // Set default title and description
      setStreamTitle(`${user.username || user.displayName}'s Stream`);
      setStreamDescription(`Live stream by ${user.username || user.displayName}`);
    }
  }, [user, navigate, toast]);
  
  // Handle choosing stream type
  const handleChooseStreamType = (type: "video" | "audio") => {
    setStreamType(type);
    setSetupStep("setup");
    
    // Reset certain settings based on stream type
    if (type === "audio") {
      setUseCamera(false);
      setUseMicrophone(true);
    } else {
      setUseCamera(true);
      setUseMicrophone(true);
    }
    
    // Get available devices after stream type is chosen
    getDevices();
  };
  
  // Get available media devices
  const getDevices = async () => {
    try {
      // Request permissions to get device labels
      let tempStream: MediaStream | null = null;
      try {
        tempStream = await navigator.mediaDevices.getUserMedia({ 
          video: streamType === "video", 
          audio: true 
        });
      } catch (err) {
        console.warn("Could not get full media access:", err);
        try {
          // If video stream failed and we're in video mode, try just video
          if (streamType === "video") {
            tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          } else {
            // If we're in audio mode, try just audio
            tempStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          }
        } catch (err2) {
          console.warn(`Could not get ${streamType} access:`, err2);
          try {
            // Last resort, try just audio for both modes
            tempStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          } catch (err3) {
            console.error("Could not get any media access:", err3);
            toast({
              title: "Media Access Required",
              description: `Please allow access to your ${streamType === "video" ? "camera and/or microphone" : "microphone"} to stream.`,
              variant: "destructive",
            });
          }
        }
      }
      
      // Get devices only after permissions granted
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const videoDevices = devices.filter(device => device.kind === "videoinput");
      const audioDevices = devices.filter(device => device.kind === "audioinput");
      const audioOutputDevices = devices.filter(device => device.kind === "audiooutput");
      
      setAvailableDevices({
        videoDevices,
        audioDevices,
        audioOutputDevices
      });
      
      // Set default devices
      if (videoDevices.length > 0 && !selectedVideoDevice) {
        setSelectedVideoDevice(videoDevices[0].deviceId);
      }
      
      if (audioDevices.length > 0 && !selectedAudioDevice) {
        setSelectedAudioDevice(audioDevices[0].deviceId);
      }
      
      if (audioOutputDevices.length > 0 && !selectedAudioOutputDevice) {
        setSelectedAudioOutputDevice(audioOutputDevices[0].deviceId);
      }
      
      // If we already got a stream in the permission request, use it as preview
      if (tempStream) {
        if (streamType === "video" && videoRef.current) {
          videoRef.current.srcObject = tempStream;
        }
        setLocalStream(tempStream);
      }
    } catch (error) {
      console.error("Error getting media devices:", error);
    }
  };
  
  // Update preview when device selection changes
  useEffect(() => {
    if (setupStep !== "setup") return;
    
    const updatePreview = async () => {
      // Stop any existing tracks
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      
      // Skip if no devices selected or preview not needed
      if (
        (streamType === "video" && !selectedVideoDevice && !selectedAudioDevice) || 
        (streamType === "audio" && !selectedAudioDevice) ||
        (!useCamera && !useMicrophone)
      ) {
        return;
      }
      
      try {
        // Create constraints based on selections and stream type
        const constraints: MediaStreamConstraints = {
          video: streamType === "video" && useCamera && selectedVideoDevice ? {
            deviceId: { exact: selectedVideoDevice }
          } : false,
          audio: useMicrophone && selectedAudioDevice ? {
            deviceId: { exact: selectedAudioDevice },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } : false
        };
        
        // Get media stream
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Update video preview if in video mode
        if (streamType === "video" && videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        
        setLocalStream(stream);
      } catch (error) {
        console.error("Error updating preview:", error);
        toast({
          title: "Preview Error",
          description: "Could not access the selected devices. Please check permissions.",
          variant: "destructive",
        });
      }
    };
    
    updatePreview();
    
    // Cleanup
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [selectedVideoDevice, selectedAudioDevice, useCamera, useMicrophone, streamType, setupStep, toast]);
  
  // Handle visual element upload for audio streams
  const handleVisualElementChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Check file type (image or video)
    const fileType = file.type;
    if (!fileType.startsWith('image/') && !fileType.startsWith('video/')) {
      toast({
        title: "Invalid File",
        description: "Please upload an image (JPEG, PNG, GIF) or video (MP4, WebM) file.",
        variant: "destructive",
      });
      return;
    }
    
    // Check file size (limit to 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB in bytes
    if (file.size > maxSize) {
      toast({
        title: "File Too Large",
        description: "Please upload a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }
    
    setVisualElement(file);
    
    // Create a preview URL
    const previewUrl = URL.createObjectURL(file);
    setVisualPreviewUrl(previewUrl);
    
    toast({
      title: "Visual Element Added",
      description: "Your visual element has been added to the stream.",
    });
  };
  
  // Handle removing visual element
  const handleRemoveVisualElement = () => {
    setVisualElement(null);
    
    // Revoke the object URL to avoid memory leaks
    if (visualPreviewUrl) {
      URL.revokeObjectURL(visualPreviewUrl);
    }
    setVisualPreviewUrl("");
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  
  // Handle go live button
  const handleGoLive = async () => {
    if (!user) return;
    
    try {
      // Create a new stream via API
      const streamData = await createStream({
        title: streamTitle,
        description: streamDescription,
        category: streamCategory,
        tags: ["live", streamType],
        // Stream type and settings
        streamType,
        useCamera: streamType === "video" ? useCamera : false,
        useMicrophone,
        useSystemAudio,
        hasVisualElement: !!visualElement
      } as any);
      
      // If we have a visual element for audio stream, upload it
      if (streamType === "audio" && visualElement) {
        try {
          // Import the uploadVisualElement function
          const { uploadVisualElement } = await import("@/lib/api");
          
          // Upload the visual element
          await uploadVisualElement(streamData.id, visualElement);
          
          toast({
            title: "Visual Element Uploaded",
            description: "Your visual element has been added to the stream.",
          });
        } catch (uploadError) {
          console.error("Failed to upload visual element:", uploadError);
          toast({
            title: "Visual Element Upload Failed",
            description: "The stream was created, but we couldn't upload your visual element.",
            variant: "default",
          });
        }
      }
      
      // Set the stream ID from the created stream
      setStreamId(streamData.id.toString());
      setSetupStep("live");
      
      toast({
        title: "Stream Created",
        description: "Your stream has been created successfully!",
      });
      
      // Navigate to the stream page
      navigate(`/stream/${streamData.id}`);
    } catch (error) {
      console.error("Failed to create stream:", error);
      toast({
        title: "Error",
        description: "Failed to create stream. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  // Toggle controls
  const toggleCamera = () => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !useCamera;
      });
    }
    setUseCamera(!useCamera);
  };
  
  const toggleMicrophone = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !useMicrophone;
      });
    }
    setUseMicrophone(!useMicrophone);
  };
  
  const toggleSystemAudio = () => {
    setUseSystemAudio(!useSystemAudio);
  };
  
  // Back to stream type selection
  const handleBackToSelection = () => {
    setSetupStep("choose");
    
    // Stop any active streams
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    
    // Clear visual element if any
    handleRemoveVisualElement();
  };
  
  // If we already created a stream, render the LiveStream component
  if (streamId && setupStep === "live") {
    return (
      <div className="container max-w-6xl mx-auto py-8">
        <h1 className="text-3xl font-bold mb-6">Live Streaming Studio</h1>
        <p className="text-zinc-400 mb-8">
          Create and share live streams with your audience using our WebRTC-based streaming platform.
        </p>

        <LiveStream 
          userId={user?.id} 
          userName={user?.username || user?.displayName} 
          initialStreamId={streamId} 
        />
      </div>
    );
  }
  
  // Stream type selection screen
  if (setupStep === "choose") {
    return (
      <div className="container max-w-4xl mx-auto py-8">
        <h1 className="text-3xl font-bold mb-6">Go Live</h1>
        <p className="text-zinc-400 mb-8">
          Choose what type of stream you want to create.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card 
            className="cursor-pointer transition-all hover:shadow-md"
            onClick={() => handleChooseStreamType("video")}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="h-5 w-5" />
                Video Stream
              </CardTitle>
              <CardDescription>
                Stream with video and audio from your camera and microphone
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="aspect-video bg-zinc-900 rounded-md flex items-center justify-center mb-4">
                <Video className="h-12 w-12 text-zinc-400" />
              </div>
              <ul className="space-y-2 text-sm text-zinc-400">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Show your face and surroundings
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Perfect for performances, tutorials, and talk shows
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Support for multiple camera and audio inputs
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button className="w-full">Select Video Stream</Button>
            </CardFooter>
          </Card>
          
          <Card 
            className="cursor-pointer transition-all hover:shadow-md"
            onClick={() => handleChooseStreamType("audio")}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Music className="h-5 w-5" />
                Audio Stream
              </CardTitle>
              <CardDescription>
                Stream audio only with optional visual elements
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="aspect-video bg-zinc-900 rounded-md flex items-center justify-center mb-4">
                <Radio className="h-12 w-12 text-zinc-400" />
              </div>
              <ul className="space-y-2 text-sm text-zinc-400">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Focus on your sound without camera requirements
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Perfect for DJs, podcasts, and music performances
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Add optional static image or video background
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button className="w-full">Select Audio Stream</Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }
  
  // Setup screen (different based on stream type)
  return (
    <div className="container max-w-6xl mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">
            {streamType === "video" ? "Video Stream Setup" : "Audio Stream Setup"}
          </h1>
          <p className="text-zinc-400">
            Configure your stream settings before going live
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={handleBackToSelection}
        >
          Change Stream Type
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Preview card */}
        <div className="md:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Stream Preview</CardTitle>
              <CardDescription>
                This is how your stream will look to viewers
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center">
              <div className="relative w-full bg-black rounded-md overflow-hidden aspect-video">
                {streamType === "video" && useCamera ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : streamType === "audio" && visualPreviewUrl ? (
                  visualPreviewUrl.startsWith('blob:') && visualElement?.type.startsWith('video/') ? (
                    <video
                      src={visualPreviewUrl}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={visualPreviewUrl}
                      alt="Stream visual"
                      className="w-full h-full object-cover"
                    />
                  )
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900">
                    {streamType === "video" ? (
                      <p className="text-zinc-400">Camera is disabled</p>
                    ) : (
                      <>
                        <Music className="h-12 w-12 text-zinc-500 mb-2" />
                        <p className="text-zinc-400">Audio-only stream</p>
                        <p className="text-zinc-500 text-sm mt-2">
                          You can add a visual element below
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
              
              <div className="flex gap-3 mt-4 flex-wrap">
                {streamType === "video" && (
                  <Button 
                    variant={useCamera ? "default" : "outline"} 
                    size="sm" 
                    onClick={toggleCamera}
                    className="flex items-center gap-2"
                  >
                    <Video size={18} />
                    {useCamera ? "Camera On" : "Camera Off"}
                  </Button>
                )}
                
                <Button 
                  variant={useMicrophone ? "default" : "outline"} 
                  size="sm" 
                  onClick={toggleMicrophone}
                  className="flex items-center gap-2"
                >
                  <Mic size={18} />
                  {useMicrophone ? "Mic On" : "Mic Off"}
                </Button>
                
                <Button 
                  variant={useSystemAudio ? "default" : "outline"} 
                  size="sm" 
                  onClick={toggleSystemAudio}
                  className="flex items-center gap-2"
                >
                  <Volume2 size={18} />
                  {useSystemAudio ? "System Audio On" : "System Audio Off"}
                </Button>
              </div>
              
              {/* Visual element upload for audio streams */}
              {streamType === "audio" && (
                <div className="w-full mt-6 border rounded-md p-4">
                  <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Image size={16} />
                    Visual Element (Optional)
                  </h3>
                  
                  {!visualElement ? (
                    <div className="flex flex-col items-center">
                      <p className="text-sm text-zinc-400 mb-4">
                        Add an image or video to display during your audio stream
                      </p>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleVisualElementChange}
                        accept="image/*,video/mp4,video/webm"
                        className="hidden"
                      />
                      <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full"
                      >
                        Upload Image or Video
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">
                          {visualElement.name}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleRemoveVisualElement}
                          className="h-8 w-8 p-0"
                        >
                          <X size={16} />
                        </Button>
                      </div>
                      <p className="text-xs text-zinc-400">
                        {(visualElement.size / (1024 * 1024)).toFixed(2)}MB • 
                        {visualElement.type.startsWith('image/') ? ' Image' : ' Video'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* Settings card */}
        <div>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Stream Settings</CardTitle>
              <CardDescription>
                Configure your stream details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="stream-title">Stream Title</Label>
                <Input 
                  id="stream-title" 
                  value={streamTitle} 
                  onChange={(e) => setStreamTitle(e.target.value)} 
                  placeholder="Enter a stream title"
                />
              </div>
              
              <div>
                <Label htmlFor="stream-description">Description</Label>
                <Textarea 
                  id="stream-description" 
                  value={streamDescription} 
                  onChange={(e) => setStreamDescription(e.target.value)}
                  placeholder="Describe your stream"
                  rows={3}
                />
              </div>
              
              <div>
                <Label htmlFor="stream-category">Category</Label>
                <Select 
                  value={streamCategory} 
                  onValueChange={setStreamCategory}
                >
                  <SelectTrigger id="stream-category">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Music">Music</SelectItem>
                    <SelectItem value="Gaming">Gaming</SelectItem>
                    <SelectItem value="Talk Show">Talk Show</SelectItem>
                    <SelectItem value="Tutorial">Tutorial</SelectItem>
                    <SelectItem value="Podcast">Podcast</SelectItem>
                    <SelectItem value="DJ Set">DJ Set</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Tabs defaultValue="devices" className="w-full">
                <TabsList className="w-full">
                  <TabsTrigger value="devices" className="flex-1">Devices</TabsTrigger>
                  <TabsTrigger value="advanced" className="flex-1">Advanced</TabsTrigger>
                </TabsList>
                
                <TabsContent value="devices" className="space-y-4 pt-2">
                  {streamType === "video" && availableDevices.videoDevices.length > 0 && (
                    <div>
                      <Label htmlFor="video-device">Camera</Label>
                      <Select 
                        value={selectedVideoDevice} 
                        onValueChange={setSelectedVideoDevice}
                        disabled={!useCamera}
                      >
                        <SelectTrigger id="video-device">
                          <SelectValue placeholder="Select a camera" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableDevices.videoDevices.map((device) => (
                            <SelectItem key={device.deviceId} value={device.deviceId}>
                              {device.label || `Camera ${device.deviceId.substring(0, 5)}...`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  
                  {availableDevices.audioDevices.length > 0 && (
                    <div>
                      <Label htmlFor="audio-device">Microphone</Label>
                      <Select 
                        value={selectedAudioDevice} 
                        onValueChange={setSelectedAudioDevice}
                        disabled={!useMicrophone}
                      >
                        <SelectTrigger id="audio-device">
                          <SelectValue placeholder="Select a microphone" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableDevices.audioDevices.map((device) => (
                            <SelectItem key={device.deviceId} value={device.deviceId}>
                              {device.label || `Mic ${device.deviceId.substring(0, 5)}...`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  
                  {availableDevices.audioOutputDevices.length > 0 && (
                    <div>
                      <Label htmlFor="audio-output-device">Speaker (for monitoring)</Label>
                      <Select 
                        value={selectedAudioOutputDevice} 
                        onValueChange={setSelectedAudioOutputDevice}
                      >
                        <SelectTrigger id="audio-output-device">
                          <SelectValue placeholder="Select a speaker" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableDevices.audioOutputDevices.map((device) => (
                            <SelectItem key={device.deviceId} value={device.deviceId}>
                              {device.label || `Speaker ${device.deviceId.substring(0, 5)}...`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="advanced" className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="system-audio">Capture System Audio</Label>
                    <Switch 
                      id="system-audio" 
                      checked={useSystemAudio} 
                      onCheckedChange={toggleSystemAudio}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="echo-cancellation">Echo Cancellation</Label>
                    <Switch 
                      id="echo-cancellation" 
                      defaultChecked={true}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="noise-suppression">Noise Suppression</Label>
                    <Switch 
                      id="noise-suppression" 
                      defaultChecked={true}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
            <CardFooter>
              <Button 
                onClick={handleGoLive} 
                className="w-full"
                disabled={!streamTitle || (streamType === "video" && !useCamera && !useMicrophone) || (streamType === "audio" && !useMicrophone)}
              >
                Go Live
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
