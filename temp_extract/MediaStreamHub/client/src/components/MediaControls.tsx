import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Download, 
  Settings 
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MediaControlsProps {
  isPlaying: boolean;
  togglePlayPause: () => void;
  currentTime: number;
  duration: number;
  formatTime: (time: number) => string;
  handleSeek: (value: number) => void;
  volume: number;
  handleVolumeChange: (value: number) => void;
  muted: boolean;
  toggleMute: () => void;
  mediaType: "audio" | "video";
  toggleFullscreen: () => void;
  downloadMedia: () => void;
  toggleSettings: () => void;
  disabled: boolean;
}

const MediaControls = ({
  isPlaying,
  togglePlayPause,
  currentTime,
  duration,
  formatTime,
  handleSeek,
  volume,
  handleVolumeChange,
  muted,
  toggleMute,
  mediaType,
  toggleFullscreen,
  downloadMedia,
  toggleSettings,
  disabled
}: MediaControlsProps) => {
  // Calculate percentage for the progress bar
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="py-4">
      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={progress}
          onChange={(e) => handleSeek(parseFloat(e.target.value))}
          className="w-full"
          disabled={disabled}
        />
      </div>
      
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {/* Play/Pause Button */}
          <button
            className={cn(
              "w-12 h-12 flex items-center justify-center rounded-full text-white transition-colors",
              disabled ? "bg-gray-400 cursor-not-allowed" : "bg-primary hover:bg-primary/90"
            )}
            onClick={togglePlayPause}
            disabled={disabled}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="h-6 w-6" />
            ) : (
              <Play className="h-6 w-6" />
            )}
          </button>
          
          {/* Volume Controls */}
          <div className="flex items-center space-x-2">
            {/* Mute Button */}
            <button
              className={cn(
                "text-gray-700 hover:text-primary",
                disabled && "text-gray-400 hover:text-gray-400 cursor-not-allowed"
              )}
              onClick={toggleMute}
              disabled={disabled}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? (
                <VolumeX className="h-5 w-5" />
              ) : (
                <Volume2 className="h-5 w-5" />
              )}
            </button>
            
            {/* Volume Slider */}
            <input
              type="range"
              min="0"
              max="100"
              value={volume * 100}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-20 md:w-32"
              disabled={disabled}
              aria-label="Volume control"
            />
          </div>
        </div>
        
        {/* Additional Controls */}
        <div className="flex items-center space-x-2">
          {/* Fullscreen Button (Video Only) */}
          {mediaType === "video" && (
            <button
              className={cn(
                "p-2 text-gray-700 hover:text-primary rounded-full hover:bg-gray-100",
                disabled && "text-gray-400 hover:text-gray-400 hover:bg-transparent cursor-not-allowed"
              )}
              onClick={toggleFullscreen}
              disabled={disabled}
              aria-label="Toggle fullscreen"
            >
              <Maximize className="h-5 w-5" />
            </button>
          )}
          
          {/* Download Button */}
          <button
            className={cn(
              "p-2 text-gray-700 hover:text-primary rounded-full hover:bg-gray-100",
              disabled && "text-gray-400 hover:text-gray-400 hover:bg-transparent cursor-not-allowed"
            )}
            onClick={downloadMedia}
            disabled={disabled}
            aria-label="Download media"
          >
            <Download className="h-5 w-5" />
          </button>
          
          {/* Settings Button */}
          <button
            className={cn(
              "p-2 text-gray-700 hover:text-primary rounded-full hover:bg-gray-100",
              disabled && "text-gray-400 hover:text-gray-400 hover:bg-transparent cursor-not-allowed"
            )}
            onClick={toggleSettings}
            disabled={disabled}
            aria-label="Player settings"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MediaControls;
