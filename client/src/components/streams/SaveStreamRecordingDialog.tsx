import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Trash2 } from "lucide-react";
import { finalizeStreamRecording } from "@/lib/api";

interface SaveStreamRecordingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  streamId: number;
  temporaryUrl?: string;
}

export function SaveStreamRecordingDialog({
  isOpen,
  onClose,
  streamId,
  temporaryUrl,
}: SaveStreamRecordingDialogProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const { toast } = useToast();

  const handleSaveRecording = async () => {
    setIsLoading(true);
    try {
      const result = await finalizeStreamRecording(streamId, true);
      toast({
        title: "Stream recording saved",
        description: "Your stream recording has been saved permanently.",
      });
      onClose();
    } catch (error) {
      console.error("Error saving stream recording:", error);
      toast({
        title: "Error",
        description: "Failed to save stream recording.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteRecording = async () => {
    setIsLoading(true);
    try {
      const result = await finalizeStreamRecording(streamId, false);
      toast({
        title: "Stream recording deleted",
        description: "Your stream recording has been deleted.",
      });
      onClose();
    } catch (error) {
      console.error("Error deleting stream recording:", error);
      toast({
        title: "Error",
        description: "Failed to delete stream recording.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save Stream Recording?</DialogTitle>
          <DialogDescription>
            Your stream has ended. Would you like to save the recording or delete it?
            <br />
            {temporaryUrl && (
              <span className="text-sm text-muted-foreground mt-2 block">
                The recording is temporarily available for the next 24 hours.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        {temporaryUrl && (
          <div className="mt-4 rounded-md overflow-hidden bg-black">
            <video 
              className="w-full" 
              controls 
              src={temporaryUrl}
              preload="metadata"
            />
          </div>
        )}
        <DialogFooter className="flex flex-row justify-between sm:justify-between gap-2 mt-4">
          <Button
            variant="outline"
            onClick={handleDeleteRecording}
            disabled={isLoading}
            className="flex-1"
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Delete Recording
          </Button>
          <Button
            onClick={handleSaveRecording}
            disabled={isLoading}
            className="flex-1"
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Recording
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}