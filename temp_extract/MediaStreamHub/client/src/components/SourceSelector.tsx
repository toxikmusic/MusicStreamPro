import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SourceSelectorProps {
  mediaType: "audio" | "video";
  setMediaType: (type: "audio" | "video") => void;
  mediaUrl: string;
  setMediaUrl: (url: string) => void;
  loadFromUrl: () => void;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  loadSampleSource: (type: "audio" | "video", index: number) => void;
  sampleSources: {
    audio: { name: string; url: string }[];
    video: { name: string; url: string }[];
  };
}

const SourceSelector = ({
  mediaType,
  setMediaType,
  mediaUrl,
  setMediaUrl,
  loadFromUrl,
  handleFileChange,
  loadSampleSource,
  sampleSources,
}: SourceSelectorProps) => {
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMediaUrl(e.target.value);
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-medium">Media Source</h2>
        
        {/* Media Type Toggle */}
        <div className="flex items-center space-x-4">
          <Button
            size="sm"
            variant={mediaType === "video" ? "default" : "outline"}
            className={`rounded-full ${
              mediaType === "video"
                ? "bg-primary text-white"
                : "bg-gray-200 text-gray-700"
            }`}
            onClick={() => setMediaType("video")}
          >
            Video
          </Button>
          <Button
            size="sm"
            variant={mediaType === "audio" ? "default" : "outline"}
            className={`rounded-full ${
              mediaType === "audio"
                ? "bg-primary text-white"
                : "bg-gray-200 text-gray-700"
            }`}
            onClick={() => setMediaType("audio")}
          >
            Audio
          </Button>
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            URL Source
          </label>
          <div className="flex">
            <Input
              type="text"
              className="rounded-r-none"
              placeholder="Enter media URL"
              value={mediaUrl}
              onChange={handleUrlChange}
            />
            <Button 
              className="rounded-l-none"
              onClick={loadFromUrl}
            >
              Load
            </Button>
          </div>
        </div>
        
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Local File
          </label>
          <div className="flex">
            <Input
              type="file"
              accept={mediaType === "video" ? "video/*" : "audio/*"}
              onChange={handleFileChange}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-l-md file:border-0 
                        file:text-sm file:font-medium file:bg-primary file:text-white 
                        hover:file:bg-primary/90"
            />
          </div>
        </div>
      </div>
      
      {/* Sample Sources */}
      <div className="mt-3">
        <p className="text-sm font-medium text-gray-700 mb-1">Sample Sources:</p>
        <div className="flex flex-wrap gap-2">
          {sampleSources[mediaType].map((source, index) => (
            <button 
              key={index}
              className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded text-gray-700"
              onClick={() => loadSampleSource(mediaType, index)}
            >
              {source.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SourceSelector;
