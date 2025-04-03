import MediaPlayer from "@/components/MediaPlayer";
import { Separator } from "@/components/ui/separator";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white rounded-xl shadow-lg overflow-hidden">
        {/* Header with App Title */}
        <div className="bg-gradient-to-r from-primary to-secondary p-4 text-white">
          <h1 className="text-xl md:text-2xl font-semibold">React Media Streamer</h1>
          <p className="text-sm opacity-90">Stream audio and video with ease</p>
        </div>

        <MediaPlayer />
      </div>

      {/* Support and Format Information */}
      <div className="mt-8 w-full max-w-4xl text-sm text-gray-600">
        <h3 className="font-medium mb-2 text-gray-700">Supported Formats</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white p-3 rounded shadow-sm">
            <div className="font-medium">Audio</div>
            <div className="text-xs mt-1 text-gray-500">MP3, WAV, AAC, FLAC</div>
          </div>
          <div className="bg-white p-3 rounded shadow-sm">
            <div className="font-medium">Video</div>
            <div className="text-xs mt-1 text-gray-500">MP4, WebM, OGG, MOV</div>
          </div>
          <div className="bg-white p-3 rounded shadow-sm">
            <div className="font-medium">Streaming</div>
            <div className="text-xs mt-1 text-gray-500">HLS, DASH, RTMP</div>
          </div>
          <div className="bg-white p-3 rounded shadow-sm">
            <div className="font-medium">Subtitles</div>
            <div className="text-xs mt-1 text-gray-500">SRT, VTT, SSA</div>
          </div>
        </div>
      </div>
    </div>
  );
}
