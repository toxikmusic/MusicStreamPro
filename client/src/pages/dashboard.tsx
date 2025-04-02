import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { getPostsByUser, getTracksByUser, getStreamsByUser } from "@/lib/api";
import { Track, Stream, Post } from "@shared/schema";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import TrackCard from "@/components/tracks/TrackCard";
import StreamCard from "@/components/streams/StreamCard";
import PostCard from "@/components/posts/PostCard";
import { Activity, Users, Music, Radio, FileText, TrendingUp, Clock } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  // Fetch user's tracks
  const { data: tracks = [] } = useQuery({
    queryKey: ["/api/tracks/user", user?.id],
    queryFn: () => getTracksByUser(user?.id as number),
    enabled: !!user?.id,
  });

  // Fetch user's streams
  const { data: streams = [] } = useQuery({
    queryKey: ["/api/streams/user", user?.id],
    queryFn: () => getStreamsByUser(user?.id as number),
    enabled: !!user?.id,
  });

  // Fetch user's posts
  const { data: posts = [] } = useQuery({
    queryKey: ["/api/posts/user", user?.id],
    queryFn: () => getPostsByUser(user?.id as number),
    enabled: !!user?.id,
  });

  // Calculate metrics
  const totalTracks = tracks.length;
  const totalStreams = streams.length;
  const totalPosts = posts.length;
  
  // Calculate total plays
  const totalPlays = tracks.reduce((sum, track) => sum + (track.playCount || 0), 0);
  
  // Calculate total stream viewers
  const totalStreamViewers = streams.reduce((sum, stream) => sum + (stream.viewerCount || 0), 0);
  
  // Calculate total followers (from user's follower count)
  const totalFollowers = user?.followerCount || 0;
  
  // Calculate average stream duration based on completed streams
  const calculateAverageStreamDuration = () => {
    // Filter to only include completed streams with start and end times
    const completedStreams = streams.filter(stream => 
      stream.startedAt && stream.endedAt && !stream.isLive
    );
    
    if (completedStreams.length === 0) {
      return 'N/A';
    }
    
    // Calculate total duration in milliseconds
    const totalDuration = completedStreams.reduce((sum, stream) => {
      const start = new Date(stream.startedAt || 0).getTime();
      const end = new Date(stream.endedAt || 0).getTime();
      return sum + (end - start);
    }, 0);
    
    // Calculate average duration in milliseconds
    const avgDurationMs = totalDuration / completedStreams.length;
    
    // Convert to hours and minutes
    const hours = Math.floor(avgDurationMs / (1000 * 60 * 60));
    const minutes = Math.floor((avgDurationMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  // Get live streams
  const liveStreams = streams.filter(stream => stream.isLive);
  
  // Get recent tracks (sort by upload date)
  const recentTracks = [...tracks].sort((a, b) => 
    new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime()
  ).slice(0, 4);

  // Get recent streams (sort by start date)
  const recentStreams = [...streams].sort((a, b) => 
    new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime()
  ).slice(0, 3);

  // Get recent posts (sort by creation date)
  const recentPosts = [...posts].sort((a, b) => 
    new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  ).slice(0, 3);

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Creator Dashboard</h1>
          <p className="text-muted-foreground">
            Manage your content, view analytics, and grow your audience
          </p>
        </div>
        <div className="flex space-x-3 mt-4 md:mt-0">
          <Button asChild variant="outline">
            <Link href="/upload-track">Upload Track</Link>
          </Button>
          <Button asChild>
            <Link href="/go-live">Go Live</Link>
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="streams">Streams</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Tracks</CardTitle>
                <Music className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalTracks}</div>
                <p className="text-xs text-muted-foreground">
                  {totalPlays.toLocaleString()} total plays
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Streams</CardTitle>
                <Radio className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalStreams}</div>
                <p className="text-xs text-muted-foreground">
                  {totalStreamViewers.toLocaleString()} total viewers
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Posts</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalPosts}</div>
                <p className="text-xs text-muted-foreground">
                  Content updates & announcements
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Followers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalFollowers.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  Growing your audience
                </p>
              </CardContent>
            </Card>
          </div>

          {liveStreams.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center mb-4">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse mr-2" />
                <h2 className="text-xl font-bold">You're Live</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {liveStreams.map(stream => (
                  <StreamCard key={stream.id} stream={stream} />
                ))}
              </div>
            </div>
          )}

          <div className="mt-8">
            <h2 className="text-xl font-bold mb-4">Recent Activity</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="col-span-1">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Music className="h-5 w-5 mr-2" />
                    Recent Tracks
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {recentTracks.length > 0 ? (
                    <div className="space-y-4">
                      {recentTracks.slice(0, 3).map(track => (
                        <div key={track.id} className="flex items-center gap-3">
                          {track.coverUrl && (
                            <img src={track.coverUrl} alt={track.title} className="h-10 w-10 rounded-md object-cover" />
                          )}
                          <div>
                            <p className="font-medium line-clamp-1">{track.title}</p>
                            <p className="text-xs text-muted-foreground">{track.playCount} plays</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">No tracks uploaded yet</p>
                  )}
                  <Button variant="ghost" size="sm" asChild className="w-full">
                    <Link href="/upload-track">Upload New Track</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="col-span-1">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Radio className="h-5 w-5 mr-2" />
                    Recent Streams
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {recentStreams.length > 0 ? (
                    <div className="space-y-4">
                      {recentStreams.map(stream => (
                        <div key={stream.id} className="flex items-start gap-3">
                          {stream.thumbnailUrl && (
                            <img src={stream.thumbnailUrl} alt={stream.title} className="h-10 w-16 rounded-md object-cover" />
                          )}
                          <div>
                            <p className="font-medium line-clamp-1">{stream.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {stream.isLive ? (
                                <span className="text-red-500">Live now • {stream.viewerCount} viewers</span>
                              ) : (
                                <span>Ended • {new Date(stream.startedAt || 0).toLocaleDateString()}</span>
                              )}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">No streams yet</p>
                  )}
                  <Button variant="ghost" size="sm" asChild className="w-full">
                    <Link href="/go-live">Go Live</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="col-span-1">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <FileText className="h-5 w-5 mr-2" />
                    Recent Posts
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {recentPosts.length > 0 ? (
                    <div className="space-y-4">
                      {recentPosts.map(post => (
                        <div key={post.id} className="space-y-1">
                          <p className="font-medium line-clamp-1">{post.title}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">{post.content}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {post.tags?.slice(0, 2).map((tag, index) => (
                              <span key={index} className="text-xs bg-muted px-1.5 py-0.5 rounded">{tag}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">No posts yet</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Content Tab */}
        <TabsContent value="content" className="space-y-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Your Tracks</h2>
            <Button asChild variant="outline">
              <Link href="/upload-track">Upload New Track</Link>
            </Button>
          </div>
          
          {tracks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {tracks.map(track => (
                <TrackCard key={track.id} track={track} showBadge />
              ))}
            </div>
          ) : (
            <Card className="bg-muted/40">
              <CardContent className="pt-6 text-center">
                <Music className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                <CardTitle className="mb-2">No tracks yet</CardTitle>
                <CardDescription className="mb-4">
                  Upload your first track to start building your library
                </CardDescription>
                <Button asChild>
                  <Link href="/upload-track">Upload Track</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="mt-12">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Your Posts</h2>
              <Button variant="outline">Create New Post</Button>
            </div>
            
            {posts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {posts.map(post => (
                  <PostCard key={post.id} post={{...post, user: { displayName: user?.displayName || "", profileImageUrl: user?.profileImageUrl }}} />
                ))}
              </div>
            ) : (
              <Card className="bg-muted/40">
                <CardContent className="pt-6 text-center">
                  <FileText className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                  <CardTitle className="mb-2">No posts yet</CardTitle>
                  <CardDescription className="mb-4">
                    Create your first post to share updates with your fans
                  </CardDescription>
                  <Button>Create Post</Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Streams Tab */}
        <TabsContent value="streams" className="space-y-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Your Streams</h2>
            <Button asChild>
              <Link href="/go-live">Go Live Now</Link>
            </Button>
          </div>
          
          {liveStreams.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center mb-4">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse mr-2" />
                <h3 className="text-xl font-medium">Live Now</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {liveStreams.map(stream => (
                  <StreamCard key={stream.id} stream={stream} />
                ))}
              </div>
            </div>
          )}
          
          <h3 className="text-xl font-medium mb-4">Past Streams</h3>
          {streams.filter(s => !s.isLive).length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {streams.filter(s => !s.isLive).map(stream => (
                <StreamCard key={stream.id} stream={stream} />
              ))}
            </div>
          ) : (
            <Card className="bg-muted/40">
              <CardContent className="pt-6 text-center">
                <Radio className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                <CardTitle className="mb-2">No previous streams</CardTitle>
                <CardDescription className="mb-4">
                  Start your first live stream to connect with your audience
                </CardDescription>
                <Button asChild>
                  <Link href="/go-live">Go Live</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Plays</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalPlays.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Across all tracks</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Stream Viewers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalStreamViewers.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Across all streams</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Followers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalFollowers.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Total followers</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Avg. Stream Length</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{calculateAverageStreamDuration()}</div>
                <p className="text-xs text-muted-foreground">Per stream</p>
              </CardContent>
            </Card>
          </div>
          
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Top Performing Tracks</CardTitle>
                <CardDescription>Tracks with the highest play counts</CardDescription>
              </CardHeader>
              <CardContent>
                {tracks.length > 0 ? (
                  <div className="space-y-4">
                    {[...tracks]
                      .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
                      .slice(0, 5)
                      .map((track, index) => (
                        <div key={track.id} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-muted-foreground w-6">{index + 1}</span>
                            {track.coverUrl && (
                              <img src={track.coverUrl} alt={track.title} className="h-10 w-10 rounded-md object-cover" />
                            )}
                            <div>
                              <p className="font-medium line-clamp-1">{track.title}</p>
                              <p className="text-xs text-muted-foreground">{track.genre || "Unknown genre"}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{track.playCount?.toLocaleString() || 0}</p>
                            <p className="text-xs text-muted-foreground">plays</p>
                          </div>
                        </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm text-center py-8">
                    Upload tracks to see performance analytics
                  </p>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Popular Streams</CardTitle>
                <CardDescription>Streams with the highest view counts</CardDescription>
              </CardHeader>
              <CardContent>
                {streams.length > 0 ? (
                  <div className="space-y-4">
                    {[...streams]
                      .sort((a, b) => (b.viewerCount || 0) - (a.viewerCount || 0))
                      .slice(0, 5)
                      .map((stream, index) => (
                        <div key={stream.id} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-muted-foreground w-6">{index + 1}</span>
                            {stream.thumbnailUrl && (
                              <img src={stream.thumbnailUrl} alt={stream.title} className="h-10 w-16 rounded-md object-cover" />
                            )}
                            <div>
                              <p className="font-medium line-clamp-1">{stream.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {stream.isLive ? (
                                  <span className="text-red-500">Live now</span>
                                ) : (
                                  <span>{new Date(stream.startedAt || 0).toLocaleDateString()}</span>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{stream.viewerCount?.toLocaleString() || 0}</p>
                            <p className="text-xs text-muted-foreground">viewers</p>
                          </div>
                        </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm text-center py-8">
                    Start streaming to see performance analytics
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}