import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import { Separator } from "@/components/ui/separator";
import { User, Genre } from "@shared/schema";

export default function Sidebar() {
  // Mock data for initial render
  const followedChannels = [
    { id: 1, username: "dj_vibe", displayName: "DJ Vibe", profileImageUrl: "", isStreaming: true },
    { id: 2, username: "music_lover", displayName: "Music Lover", profileImageUrl: "", isStreaming: false },
    { id: 3, username: "beatmaker", displayName: "Beat Maker", profileImageUrl: "", isStreaming: false },
  ];
  
  const genres = [
    { id: 1, name: "Electronic" },
    { id: 2, name: "Hip Hop" },
    { id: 3, name: "Lo-Fi" },
    { id: 4, name: "House" },
    { id: 5, name: "Indie" },
  ];

  const { data: channelsData, isLoading: channelsLoading } = useQuery<User[]>({
    queryKey: ['/api/channels/followed'],
    enabled: false // Disable for now, we'll use mock data
  });

  const { data: genresData, isLoading: genresLoading } = useQuery<Genre[]>({
    queryKey: ['/api/genres'],
    enabled: false // Disable for now, we'll use mock data
  });

  const channels = channelsData || followedChannels;
  const genreList = genresData || genres;

  return (
    <aside className="hidden md:flex flex-col w-60 bg-dark-200 fixed h-full border-r border-dark-100 pt-2">
      <div className="p-3">
        <h2 className="font-semibold text-lg mb-4">Navigation</h2>
        <div className="space-y-2 mb-4">
          <Link href="/" className="flex items-center space-x-3 p-2 rounded hover:bg-dark-100 transition">
            <span className="text-sm font-medium">Home</span>
          </Link>
          <Link href="/streams" className="flex items-center space-x-3 p-2 rounded hover:bg-dark-100 transition">
            <span className="text-sm font-medium">Live Streams</span>
          </Link>
          <Link href="/dashboard" className="flex items-center space-x-3 p-2 rounded hover:bg-dark-100 transition">
            <span className="text-sm font-medium">Creator Dashboard</span>
          </Link>
          <Link href="/library" className="flex items-center space-x-3 p-2 rounded hover:bg-dark-100 transition">
            <span className="text-sm font-medium">Library</span>
          </Link>
          <Link href="/posts" className="flex items-center space-x-3 p-2 rounded hover:bg-dark-100 transition">
            <span className="text-sm font-medium">Posts</span>
          </Link>
          <Link href="/upload-track" className="flex items-center space-x-3 p-2 rounded hover:bg-dark-100 transition">
            <span className="text-sm font-medium">Upload Track</span>
          </Link>
          <Link href="/go-live" className="flex items-center space-x-3 p-2 rounded hover:bg-dark-100 transition">
            <span className="text-sm font-medium">Go Live</span>
          </Link>
          <Link href="/settings" className="flex items-center space-x-3 p-2 rounded hover:bg-dark-100 transition">
            <span className="text-sm font-medium">Settings</span>
          </Link>
        </div>
        
        <h2 className="font-semibold text-lg mb-2 mt-6">Channels</h2>
        <div className="space-y-2">
          {channels.map((channel) => (
            <Link 
              key={channel.id} 
              href={`/profile/${channel.username}`}
              className="flex items-center space-x-3 p-2 rounded hover:bg-dark-100 transition"
            >
              <div className="relative">
                <Avatar className="w-9 h-9">
                  {channel.profileImageUrl ? (
                    <AvatarImage src={channel.profileImageUrl} />
                  ) : null}
                  <AvatarFallback>{channel.displayName.charAt(0)}</AvatarFallback>
                </Avatar>
                {channel.isStreaming && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#00b074] rounded-full border border-dark-200"></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{channel.displayName}</p>
                <p className="text-xs text-gray-400 truncate">
                  {channel.isStreaming ? 'Live' : 'Offline'}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <Separator className="my-2 bg-dark-100" />

      <div className="p-3">
        <h2 className="font-semibold text-lg mb-2">Recommended Genres</h2>
        <div className="flex flex-wrap gap-2">
          {genreList.map((genre) => (
            <Link 
              key={genre.id} 
              href={`/genre/${genre.name.toLowerCase()}`}
              className="px-3 py-1 text-sm bg-dark-100 hover:bg-primary/20 rounded-full transition"
            >
              {genre.name}
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
}
