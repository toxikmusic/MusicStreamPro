import { useState, useRef, useCallback, useEffect } from "react";
import ReactPlayer from "react-player";
import SourceSelector from "./SourceSelector";
import MediaControls from "./MediaControls";
import SettingsModal from "./SettingsModal";
import AudioVisualizer from "./AudioVisualizer";
import { AlertCircle } from "lucide-react";

const sampleSources = {
  video: [
    {
      name: "Big Buck Bunny",
      url: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    },
    {
      name: "Elephant Dream",
      url: "https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    },
  ],
  audio: [
    {
      name: "Sample MP3",
      url: "https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg",
    },
    {
      name: "Sample Music",
      url: "https://actions.google.com/sounds/v1/alarms/bugle_tune.ogg",
    },
  ],
};

const MediaPlayer = () => {
  // Media type state
  const [mediaType, setMediaType] = useState<"audio" | "video">("video");

  // Media source state
  const [mediaUrl, setMediaUrl] = useState("");
  const [currentSource, setCurrentSource] = useState("");

  // Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [mediaInfo, setMediaInfo] = useState({
    title: "No media loaded",
    format: "Unknown format",
  });

  // Player settings
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [videoQuality, setVideoQuality] = useState("auto");
  const [autoplay, setAutoplay] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Refs
  const playerRef = useRef<ReactPlayer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);

  // Set up audio element for visualizer
  useEffect(() => {
    if (mediaType === "audio" && currentSource) {
      const audio = new Audio(currentSource);
      audioRef.current = audio;

      return () => {
        audio.pause();
        audio.src = "";
      };
    }
  }, [mediaType, currentSource]);

  // Handle media loading
  const handleMediaLoad = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
    
    // Extract media name from URL for display
    try {
      const url = new URL(currentSource);
      const pathParts = url.pathname.split("/");
      const filename = pathParts[pathParts.length - 1];
      const nameWithoutExt = filename.split(".")[0];
      
      // Determine format based on URL extension
      const extension = filename.split(".").pop() || "unknown";
      
      setMediaInfo({
        title: nameWithoutExt.replace(/-|_/g, " "),
        format: extension.toUpperCase(),
      });
    } catch (error) {
      setMediaInfo({
        title: "Media",
        format: mediaType === "video" ? "Video" : "Audio",
      });
    }
  }, [currentSource, mediaType]);

  // Handle media error
  const handleMediaError = () => {
    setIsLoading(false);
    setHasError(true);
    setIsPlaying(false);
  };

  // Load media from URL
  const loadFromUrl = useCallback(() => {
    if (!mediaUrl) return;
    
    setIsLoading(true);
    setHasError(false);
    setCurrentSource(mediaUrl);
    setIsPlaying(autoplay);
  }, [mediaUrl, autoplay]);

  // Handle file upload
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setHasError(false);

    // Create object URL for the file
    const objectUrl = URL.createObjectURL(file);
    setMediaUrl(objectUrl);
    setCurrentSource(objectUrl);
    setIsPlaying(autoplay);
    
    // Update media info
    setMediaInfo({
      title: file.name.split(".")[0],
      format: file.type.split("/")[1].toUpperCase(),
    });
  };

  // Load sample source
  const loadSampleSource = (type: "audio" | "video", index: number) => {
    const source = sampleSources[type][index];
    setMediaType(type);
    setMediaUrl(source.url);
    setCurrentSource(source.url);
    setIsLoading(true);
    setHasError(false);
    setIsPlaying(autoplay);
  };

  // Toggle play/pause
  const togglePlayPause = () => {
    if (currentSource) {
      setIsPlaying(!isPlaying);
    }
  };

  // Toggle mute
  const toggleMute = () => {
    setMuted(!muted);
  };

  // Handle seeking
  const handleSeek = (value: number) => {
    const seekTime = (value / 100) * duration;
    setCurrentTime(seekTime);
    if (playerRef.current) {
      playerRef.current.seekTo(seekTime, "seconds");
    }
  };

  // Handle volume change
  const handleVolumeChange = (value: number) => {
    setVolume(value / 100);
    if (muted) setMuted(false);
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (videoContainerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoContainerRef.current.requestFullscreen();
      }
    }
  };

  // Download media
  const downloadMedia = () => {
    if (!currentSource) return;
    
    const link = document.createElement("a");
    link.href = currentSource;
    link.download = mediaInfo.title || "download";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Progress handler
  const handleProgress = (state: { played: number; playedSeconds: number; loaded: number; loadedSeconds: number }) => {
    setCurrentTime(state.playedSeconds);
  };

  // Duration handler
  const handleDuration = (duration: number) => {
    setDuration(duration);
  };

  // Format time for display
  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return "0:00";
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };

  return (
    <div className="p-4">
      {/* Source Selection Component */}
      <SourceSelector
        mediaType={mediaType}
        setMediaType={setMediaType}
        mediaUrl={mediaUrl}
        setMediaUrl={setMediaUrl}
        loadFromUrl={loadFromUrl}
        handleFileChange={handleFileChange}
        loadSampleSource={loadSampleSource}
        sampleSources={sampleSources}
      />
      
      {/* Media Display Area */}
      <div 
        ref={videoContainerRef}
        className="relative bg-gray-900 rounded-lg overflow-hidden"
        style={{ minHeight: "200px" }}
      >
        {/* Loading Indicator */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-70 z-10">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
          </div>
        )}
        
        {/* Error Message */}
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-90 z-10">
            <div className="text-center p-4">
              <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-2" />
              <p className="text-white text-sm md:text-base">Error loading media. Please check the source and try again.</p>
            </div>
          </div>
        )}
        
        {/* Video Player */}
        <div className={`aspect-w-16 aspect-h-9 ${mediaType === 'video' ? 'block' : 'hidden'}`}>
          {currentSource && (
            <ReactPlayer
              ref={playerRef}
              url={currentSource}
              playing={isPlaying}
              volume={volume}
              muted={muted}
              playbackRate={playbackSpeed}
              width="100%"
              height="100%"
              onReady={handleMediaLoad}
              onError={handleMediaError}
              onProgress={handleProgress}
              onDuration={handleDuration}
              config={{
                file: {
                  attributes: {
                    style: { objectFit: 'contain' }
                  }
                }
              }}
            />
          )}
        </div>
        
        {/* Audio Player with Visualizer */}
        <div 
          className={`h-48 flex items-center justify-center bg-gradient-to-r from-indigo-900 to-purple-900 ${mediaType === 'audio' ? 'flex' : 'hidden'}`}
        >
          {/* Audio Player */}
          {currentSource && mediaType === "audio" && (
            <>
              <ReactPlayer
                ref={playerRef}
                url={currentSource}
                playing={isPlaying}
                volume={volume}
                muted={muted}
                playbackRate={playbackSpeed}
                width="0"
                height="0"
                onReady={handleMediaLoad}
                onError={handleMediaError}
                onProgress={handleProgress}
                onDuration={handleDuration}
              />
              <AudioVisualizer 
                audioUrl={currentSource}
                isPlaying={isPlaying}
              />
            </>
          )}
        </div>
      </div>
      
      {/* Media Controls */}
      <MediaControls
        isPlaying={isPlaying}
        togglePlayPause={togglePlayPause}
        currentTime={currentTime}
        duration={duration}
        formatTime={formatTime}
        handleSeek={handleSeek}
        volume={volume}
        handleVolumeChange={handleVolumeChange}
        muted={muted}
        toggleMute={toggleMute}
        mediaType={mediaType}
        toggleFullscreen={toggleFullscreen}
        downloadMedia={downloadMedia}
        toggleSettings={() => setIsSettingsOpen(true)}
        disabled={!currentSource || hasError}
      />
      
      {/* Media Information Bar */}
      <div className="mt-2 flex items-center justify-between text-sm text-gray-600 border-t border-gray-100 pt-3">
        <div>
          <span className="font-medium">{mediaInfo.title}</span>
          <span className="mx-1">•</span>
          <span>{mediaInfo.format}</span>
        </div>
        <div>
          <span className="bg-gray-100 px-2 py-0.5 rounded text-xs font-medium">
            {mediaType.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        playbackSpeed={playbackSpeed}
        setPlaybackSpeed={setPlaybackSpeed}
        videoQuality={videoQuality}
        setVideoQuality={setVideoQuality}
        autoplay={autoplay}
        setAutoplay={setAutoplay}
        mediaType={mediaType}
      />
    </div>
  );
};

export default MediaPlayer;
