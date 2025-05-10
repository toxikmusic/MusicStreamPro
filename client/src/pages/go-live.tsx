import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { createStream } from '@/lib/api';
import { Stream } from '@shared/schema';
import { audioStreamingService, type StreamStatus } from '@/lib/audioStreaming';
import { useLocation } from 'wouter';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { AlertCircle, Camera, Radio, Mic, Volume2, VolumeX, BarChart3 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import MobileNavigation from '@/components/layout/MobileNavigation';
import AudioPlayer from '@/components/layout/AudioPlayer';
import { useAuth } from '@/hooks/use-auth';

// Form schema
const streamFormSchema = z.object({
  title: z.string().min(3, { message: "Title must be at least 3 characters" }),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.string().optional(),
  thumbnailUrl: z.string().url({ message: "Please enter a valid URL" }).optional().or(z.literal("")),
  saveStream: z.boolean().default(true),
});

type StreamFormValues = z.infer<typeof streamFormSchema>;

export default function GoLivePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [streamKey, setStreamKey] = useState("••••••••••••••••");
  const [showStreamKey, setShowStreamKey] = useState(false);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>({ 
    isLive: false, 
    viewerCount: 0, 
    peakViewerCount: 0 
  });
  const [frequencyData, setFrequencyData] = useState<Uint8Array | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeStreamId, setActiveStreamId] = useState<number | null>(null);
  
  // For demo, a fixed userId (in real app would come from auth)
  const userId = user?.id || 1;
  
  // Initialize audio streaming when component mounts
  useEffect(() => {
    const initializeAudio = async () => {
      try {
        const result = await audioStreamingService.initialize({
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        });
        
        if (result) {
          setAudioInitialized(true);
          audioStreamingService.setVolume(volume);
          
          // Register status change listener
          audioStreamingService.onStatusChange((status) => {
            setStreamStatus(status);
          });
          
          // Register visualization data listener
          audioStreamingService.onVisualize((data) => {
            setFrequencyData(data);
          });
          
          toast({
            title: "Audio initialized",
            description: "Your microphone is ready for streaming.",
          });
        } else {
          toast({
            title: "Audio initialization failed",
            description: "Could not access your microphone. Please check permissions.",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Error initializing audio:", error);
        toast({
          title: "Audio error",
          description: "Failed to initialize audio streaming. Please check your microphone settings.",
          variant: "destructive",
        });
      }
    };

    initializeAudio();
    
    // Clean up resources when component unmounts
    return () => {
      if (isStreaming) {
        audioStreamingService.stopStreaming();
      }
      audioStreamingService.dispose();
    };
  }, [toast, volume]);

  // Set up form with validation
  const form = useForm<StreamFormValues>({
    resolver: zodResolver(streamFormSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "",
      tags: "",
      thumbnailUrl: "",
      saveStream: true,
    }
  });

  // Draw audio visualization on canvas
  useEffect(() => {
    if (!canvasRef.current || !frequencyData) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Set visualization style
    const barWidth = canvas.width / frequencyData.length;
    const barGap = 2;
    const barWidthWithGap = barWidth - barGap;
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#9333ea'); // Purple from theme
    gradient.addColorStop(0.5, '#a855f7');
    gradient.addColorStop(1, '#c084fc');
    
    // Draw bars
    ctx.fillStyle = gradient;
    
    for (let i = 0; i < frequencyData.length; i++) {
      // Normalize value to canvas height (frequencyData values are 0-255)
      const barHeight = (frequencyData[i] / 255) * canvas.height;
      const x = i * barWidth;
      const y = canvas.height - barHeight;
      
      // Draw rounded bars
      ctx.beginPath();
      ctx.roundRect(x, y, barWidthWithGap, barHeight, 4);
      ctx.fill();
    }
  }, [frequencyData]);
  
  // Handle volume change
  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    audioStreamingService.setVolume(newVolume);
  };
  
  // Toggle mute
  const toggleMute = () => {
    if (isMuted) {
      audioStreamingService.setVolume(volume);
    } else {
      audioStreamingService.setVolume(0);
    }
    setIsMuted(!isMuted);
  };
  
  // Start streaming function
  const startStreaming = async (streamId: number) => {
    if (!audioInitialized) {
      toast({
        title: "Audio not initialized",
        description: "Please check your microphone permissions.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      // Generate a new stream key for demo
      const newStreamKey = Math.random().toString(36).substring(2, 15);
      setStreamKey(newStreamKey);
      
      const result = await audioStreamingService.startStreaming(streamId, newStreamKey);
      
      if (result) {
        setIsStreaming(true);
        setActiveStreamId(streamId);
        toast({
          title: "Stream started",
          description: "Your audio is now streaming live.",
        });
      } else {
        toast({
          title: "Streaming failed",
          description: "Could not start audio streaming. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error starting stream:", error);
      toast({
        title: "Streaming error",
        description: "An error occurred while starting the stream.",
        variant: "destructive",
      });
    }
  };
  
  // Stop streaming function
  const stopStreaming = () => {
    audioStreamingService.stopStreaming();
    setIsStreaming(false);
    setActiveStreamId(null);
    toast({
      title: "Stream ended",
      description: "Your live stream has ended successfully.",
    });
  };

  // Stream creation mutation
  const createStreamMutation = useMutation({
    mutationFn: (data: StreamFormValues) => {
      // Process tags if provided
      const tagArray = data.tags ? data.tags.split(",").map(tag => tag.trim()) : [];
      
      // Create stream data object
      const streamData: Partial<Stream> = {
        title: data.title,
        description: data.description || null,
        category: data.category || null,
        tags: tagArray.length > 0 ? tagArray : null,
        thumbnailUrl: data.thumbnailUrl || null,
        userId: userId,
        isLive: true,
        viewerCount: 0,
        startedAt: new Date(),
      };
      
      return createStream(streamData);
    },
    onSuccess: (stream) => {
      queryClient.invalidateQueries({ queryKey: ['/api/streams/featured'] });
      toast({
        title: 'Stream created!',
        description: 'Your live stream has been created. You can now go live.',
      });
      
      // Start streaming with the newly created stream ID
      startStreaming(stream.id);
      
      // Navigate to the stream page after a brief delay
      setTimeout(() => {
        navigate(`/stream/${stream.id}`);
      }, 2000);
    },
    onError: (error) => {
      toast({
        title: 'Error creating stream',
        description: error.message || 'Something went wrong',
        variant: 'destructive',
      });
    },
  });

  // Form submission handler
  function onSubmit(data: StreamFormValues) {
    createStreamMutation.mutate(data);
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 px-4 pt-16 pb-20 md:pb-10 lg:pl-72">
          <div className="container max-w-3xl mx-auto pt-6">
            <h1 className="text-3xl font-bold mb-2">Go Live</h1>
            <p className="text-muted-foreground mb-6">Set up your live stream and connect with your audience</p>
            
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              <Card className="md:col-span-3">
                <CardHeader>
                  <CardTitle>Stream Settings</CardTitle>
                  <CardDescription>Configure your stream details</CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Stream Title</FormLabel>
                            <FormControl>
                              <Input placeholder="Give your stream a title" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Describe what your stream is about" 
                                rows={4} 
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="category"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Category</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="e.g. Electronic, Hip-Hop, Production" 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="tags"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tags (comma separated)</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="e.g. live production, house, remix" 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="thumbnailUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Thumbnail URL</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="https://example.com/thumbnail.jpg" 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="saveStream"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0 pt-2">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Save stream for followers to watch later</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />

                      <Button 
                        type="submit" 
                        className="w-full" 
                        disabled={createStreamMutation.isPending}
                      >
                        {createStreamMutation.isPending ? (
                          <>
                            <Spinner className="mr-2" size="sm" />
                            Starting stream...
                          </>
                        ) : 'Start Stream'}
                      </Button>
                    </form>
                  </Form>
                </CardContent>
              </Card>

              <div className="md:col-span-2 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Audio Preview</CardTitle>
                    <CardDescription>Check your audio levels and visualization</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="aspect-video bg-black rounded-md flex flex-col items-center justify-center relative">
                      {audioInitialized ? (
                        <>
                          <canvas
                            ref={canvasRef}
                            width={500}
                            height={200}
                            className="w-full h-full absolute inset-0"
                          />
                          {!frequencyData && (
                            <div className="absolute inset-0 flex items-center justify-center flex-col">
                              <BarChart3 className="h-12 w-12 text-white/30 mb-2" />
                              <p className="text-white/70 text-sm">Speak or play audio to see visualization</p>
                            </div>
                          )}
                          
                          {/* Stream Status Indicators */}
                          <div className="absolute top-4 right-4 flex gap-2">
                            {isStreaming && (
                              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full flex items-center">
                                <span className="w-2 h-2 bg-white rounded-full mr-1 animate-pulse"></span>
                                LIVE
                              </span>
                            )}
                            {streamStatus.viewerCount > 0 && (
                              <span className="bg-gray-800/80 text-white text-xs px-2 py-1 rounded-full flex items-center">
                                <span className="mr-1">👁️</span> {streamStatus.viewerCount}
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <Mic className="h-12 w-12 text-white/30 mb-2" />
                          <p className="text-white/70 text-sm">Initializing microphone...</p>
                        </>
                      )}
                    </div>
                    
                    {/* Audio Controls */}
                    <div className="mt-4 space-y-3">
                      {/* Audio Level Meter */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs w-12 text-muted-foreground">
                          {streamStatus.audioLevel ? 
                            `${Math.round(streamStatus.audioLevel)} dB` : 
                            "-∞ dB"}
                        </span>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-100 ${
                              // Color changes based on level:
                              // Green for good levels (-30 to -12dB)
                              // Yellow for high levels (-12 to -6dB)
                              // Red for too high (above -6dB)
                              streamStatus.audioLevel && streamStatus.audioLevel > -12 
                                ? streamStatus.audioLevel > -6 
                                  ? "bg-red-500" 
                                  : "bg-yellow-500"
                                : "bg-emerald-500"
                            }`}
                            style={{ 
                              // Convert dB to percentage width (from -60dB to 0dB)
                              width: `${streamStatus.audioLevel 
                                ? Math.min(100, Math.max(0, ((streamStatus.audioLevel + 60) / 60) * 100)) 
                                : 0}%` 
                            }}
                          />
                        </div>
                      </div>
                    
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="icon" 
                          onClick={toggleMute}
                          className="h-8 w-8"
                        >
                          {isMuted ? (
                            <VolumeX className="h-4 w-4" />
                          ) : (
                            <Volume2 className="h-4 w-4" />
                          )}
                        </Button>
                        <Slider
                          value={[volume]}
                          min={0}
                          max={1}
                          step={0.01}
                          onValueChange={handleVolumeChange}
                          disabled={!audioInitialized}
                          className="flex-1"
                        />
                      </div>
                      
                      <div className="flex gap-2">
                        {isStreaming ? (
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={stopStreaming}
                            className="flex-1"
                          >
                            Stop Streaming
                          </Button>
                        ) : (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => activeStreamId && startStreaming(activeStreamId)}
                            disabled={!audioInitialized || !activeStreamId}
                            className="flex-1"
                          >
                            <Mic className="h-4 w-4 mr-2" />
                            Test Audio
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Stream Info</CardTitle>
                    <CardDescription>Connection details for OBS/Streamlabs</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium">Stream URL</h3>
                      <div className="mt-1 flex">
                        <Input 
                          value="rtmp://beatstream.live/live" 
                          readOnly 
                          className="font-mono text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium">Stream Key</h3>
                      <div className="mt-1 flex gap-2">
                        <Input 
                          type={showStreamKey ? "text" : "password"} 
                          value={streamKey} 
                          readOnly 
                          className="font-mono text-xs"
                        />
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setShowStreamKey(!showStreamKey)}
                        >
                          {showStreamKey ? "Hide" : "Show"}
                        </Button>
                      </div>
                    </div>
                    
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Important</AlertTitle>
                      <AlertDescription>
                        Never share your stream key with anyone. It grants access to broadcast on your channel.
                      </AlertDescription>
                    </Alert>
                    
                    <div>
                      <h3 className="text-sm font-medium">Required Software</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        OBS Studio, StreamLabs OBS, or XSplit
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </div>
      <MobileNavigation />
      <AudioPlayer />
    </div>
  );
}