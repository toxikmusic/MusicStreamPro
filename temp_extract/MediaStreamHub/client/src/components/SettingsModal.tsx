import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  videoQuality: string;
  setVideoQuality: (quality: string) => void;
  autoplay: boolean;
  setAutoplay: (autoplay: boolean) => void;
  mediaType: "audio" | "video";
}

const SettingsModal = ({
  isOpen,
  onClose,
  playbackSpeed,
  setPlaybackSpeed,
  videoQuality,
  setVideoQuality,
  autoplay,
  setAutoplay,
  mediaType,
}: SettingsModalProps) => {
  const handlePlaybackSpeedChange = (value: string) => {
    setPlaybackSpeed(parseFloat(value));
  };

  const handleAutoplayChange = (checked: boolean) => {
    setAutoplay(checked);
  };

  const handleSave = () => {
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Player Settings</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Playback Speed */}
          <div className="space-y-2">
            <Label htmlFor="playback-speed">Playback Speed</Label>
            <Select
              value={playbackSpeed.toString()}
              onValueChange={handlePlaybackSpeedChange}
            >
              <SelectTrigger id="playback-speed">
                <SelectValue placeholder="Select speed" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0.5">0.5x</SelectItem>
                <SelectItem value="0.75">0.75x</SelectItem>
                <SelectItem value="1">1x (Normal)</SelectItem>
                <SelectItem value="1.25">1.25x</SelectItem>
                <SelectItem value="1.5">1.5x</SelectItem>
                <SelectItem value="2">2x</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Video Quality (for video only) */}
          {mediaType === "video" && (
            <div className="space-y-2">
              <Label htmlFor="video-quality">Video Quality</Label>
              <Select 
                value={videoQuality}
                onValueChange={setVideoQuality}
              >
                <SelectTrigger id="video-quality">
                  <SelectValue placeholder="Select quality" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="1080p">1080p</SelectItem>
                  <SelectItem value="720p">720p</SelectItem>
                  <SelectItem value="480p">480p</SelectItem>
                  <SelectItem value="360p">360p</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          
          {/* Autoplay Toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="autoplay">Autoplay</Label>
            <Switch
              id="autoplay"
              checked={autoplay}
              onCheckedChange={handleAutoplayChange}
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button onClick={handleSave} className="w-full">
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsModal;
