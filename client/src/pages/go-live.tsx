import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import LiveStream from "@/components/LiveStream";
import { useToast } from "@/hooks/use-toast";
import { createStreamEntry } from "@/lib/database"; // Function to create stream in DB

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
      // Generate a unique stream ID
      const newStreamId = crypto.randomUUID();
      setStreamId(newStreamId);

      // Store stream entry in the database
      createStreamEntry({
        id: newStreamId,
        userId: user.id,
        userName: user.username || user.displayName,
        isLive: true,
        createdAt: new Date().toISOString(),
      });

      // Redirect to the streaming page
      navigate(`/stream/${newStreamId}`);
    }
  }, [user, navigate, toast]);

  return streamId ? (
    <div className="container max-w-6xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Live Streaming Studio</h1>
      <p className="text-zinc-400 mb-8">
        Create and share live streams with your audience using our WebRTC-based streaming platform.
      </p>

      <LiveStream userId={user?.id} userName={user?.username || user?.displayName} streamId={streamId} />
    </div>
  ) : null;
}
