import { useEffect } from "react";
import { useLocation } from "wouter";
import LiveStream from "@/components/LiveStream";

export default function Stream() {
  const [location] = useLocation();
  const streamId = location.split("/stream/")[1];

  // Set page title with stream ID if available
  useEffect(() => {
    if (streamId) {
      document.title = `Stream: ${streamId} | React Media Streamer`;
    } else {
      document.title = "Live Streaming | React Media Streamer";
    }
  }, [streamId]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {/* Header with App Title */}
        <div className="bg-gradient-to-r from-primary to-secondary p-4 text-white rounded-t-xl">
          <h1 className="text-xl md:text-2xl font-semibold">Live Streaming</h1>
          <p className="text-sm opacity-90">Stream directly from your device or watch others</p>
        </div>
        
        <div className="bg-white rounded-b-xl shadow-lg overflow-hidden p-4">
          <LiveStream initialStreamId={streamId} />
        </div>
      </div>
      
      {/* Features Information */}
      <div className="mt-8 w-full max-w-4xl text-sm text-gray-600">
        <h3 className="font-medium mb-2 text-gray-700">Streaming Features</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white p-3 rounded shadow-sm">
            <div className="font-medium">Camera Streaming</div>
            <div className="text-xs mt-1 text-gray-500">Stream video from your device cameras</div>
          </div>
          <div className="bg-white p-3 rounded shadow-sm">
            <div className="font-medium">Microphone Support</div>
            <div className="text-xs mt-1 text-gray-500">High-quality audio streaming</div>
          </div>
          <div className="bg-white p-3 rounded shadow-sm">
            <div className="font-medium">Live Chat</div>
            <div className="text-xs mt-1 text-gray-500">Real-time messaging with viewers</div>
          </div>
          <div className="bg-white p-3 rounded shadow-sm">
            <div className="font-medium">Shareable Links</div>
            <div className="text-xs mt-1 text-gray-500">Invite others to your stream</div>
          </div>
        </div>
      </div>
    </div>
  );
}