import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import LiveStream from "@/components/LiveStream";
import { useToast } from "@/hooks/use-toast";
import { createStream } from "@/lib/api"; // Function to create stream via API

export default function GoLivePage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [streamId, setStreamId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "You need to be logged in to start a live stream.",
        variant: "destructive",
      });
      navigate("/login");
    } else {
      // Create a new stream via API
      const createStreamAsync = async () => {
        try {
          const streamData = await createStream({
            title: `${user.username || user.displayName}'s Stream`,
            description: `Live stream by ${user.username || user.displayName}`,
            category: "Music",
            tags: ["live"]
          });
          
          // Set the stream ID from the created stream
          setStreamId(streamData.id.toString());
          
          // Redirect to the streaming page
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
      
      createStreamAsync();
    }
  }, [user, navigate, toast]);

  return streamId ? (
    <div className="container max-w-6xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Live Streaming Studio</h1>
      <p className="text-zinc-400 mb-8">
        Create and share live streams with your audience using our WebRTC-based streaming platform.
      </p>

      <LiveStream userId={user?.id} userName={user?.username || user?.displayName} initialStreamId={streamId} />
    </div>
  ) : null;
}
