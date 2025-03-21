import { useState } from "react";
import { Play, Pause, Heart, Music, ListPlus, MoreHorizontal } from "lucide-react";
import { useAudioPlayer } from "@/context/AudioPlayerContext";
import { Track } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

interface TrackCardProps {
  track: Track;
  showBadge?: boolean;
}

export default function TrackCard({ track, showBadge = false }: TrackCardProps) {
  const { currentTrack, isPlaying, playTrack, togglePlayPause, addToQueue, addTrackAndPlayNext } = useAudioPlayer();
  const isCurrentTrack = currentTrack?.id === track.id;
  const { toast } = useToast();
  
  // Format duration from seconds to mm:ss
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handlePlayClick = (e: React.MouseEvent) => {
    if (isCurrentTrack) {
      togglePlayPause();
    } else {
      playTrack(track);
    }
  };

  const handleAddToQueue = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click from triggering
    addToQueue(track);
    toast({
      title: "Added to queue",
      description: `${track.title} by ${track.artistName} added to your queue`,
      duration: 3000,
    });
  };

  const handlePlayNext = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click from triggering
    addTrackAndPlayNext(track);
    toast({
      title: "Playing next",
      description: `${track.title} by ${track.artistName} will play next`,
      duration: 3000,
    });
  };

  // Get play count and like count with fallbacks
  const playCount = track.playCount ?? 0;
  const likeCount = track.likeCount ?? 0;

  return (
    <div 
      className={cn(
        "p-4 rounded-lg group hover:bg-muted transition cursor-pointer border",
        isCurrentTrack ? "border-primary bg-muted" : "border-border"
      )}
      onClick={handlePlayClick}
    >
      <div className="flex space-x-3">
        <div className="relative flex-shrink-0">
          {track.coverUrl ? (
            <img 
              src={track.coverUrl}
              alt={track.title} 
              className="w-16 h-16 object-cover rounded shadow-md" 
            />
          ) : (
            <div className="w-16 h-16 rounded flex items-center justify-center bg-muted shadow-md">
              <Music className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
          <button className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition rounded">
            {isCurrentTrack && isPlaying ? (
              <Pause className="h-6 w-6 text-white" />
            ) : (
              <Play className="h-6 w-6 text-white" />
            )}
          </button>
          {showBadge && (
            <Badge className="absolute -top-2 -right-2 px-2 py-1">
              New
            </Badge>
          )}
        </div>
        
        <div className="flex-1">
          <div className="flex justify-between">
            <div>
              <h3 className="font-medium line-clamp-1">{track.title}</h3>
              <p className="text-sm text-muted-foreground">{track.artistName}</p>
              {track.genre && (
                <Badge variant="outline" className="mt-1 text-xs">
                  {track.genre}
                </Badge>
              )}
            </div>
            <div className="text-right">
              <div className="flex items-center space-x-2">
                <p className="text-xs text-muted-foreground">{formatDuration(track.duration)}</p>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button 
                        className="text-muted-foreground hover:text-primary"
                        onClick={handleAddToQueue}
                      >
                        <ListPlus size={16} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Add to queue</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <button className="text-muted-foreground hover:text-primary">
                      <MoreHorizontal size={16} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handlePlayNext}>
                      Play next
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleAddToQueue}>
                      Add to queue
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                      Like track
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                      Share
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex items-center mt-1 space-x-3 text-muted-foreground text-xs">
                <span className="flex items-center">
                  <Play className="h-3 w-3 mr-1" /> {playCount.toLocaleString()}
                </span>
                <span className="flex items-center">
                  <Heart className="h-3 w-3 mr-1" /> {likeCount.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-2">
            <div className="h-1.5 bg-muted-foreground/20 rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-300",
                  isCurrentTrack ? "w-1/2" : "w-0 group-hover:w-full"
                )}
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
