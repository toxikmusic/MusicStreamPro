import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// Define interfaces for our data types
interface Track {
  id: number;
  title: string;
  userId: number;
  artistName: string;
  audioUrl: string;
  coverUrl: string | null;
  duration: number;
  genre: string | null;
  playCount: number;
  likeCount: number;
  uploadedAt: string;
}

interface Post {
  id: number;
  title: string;
  userId: number;
  content: string;
  imageUrl: string | null;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

// Component to test delete functionality for tracks and posts
export default function TestDeletesPage(): JSX.Element {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [deletingPostId, setDeletingPostId] = useState<number | null>(null);
  const [deletingTrackId, setDeletingTrackId] = useState<number | null>(null);
  
  // Fetch tracks
  const { data: tracks, isLoading: tracksLoading } = useQuery<Track[]>({
    queryKey: ['/api/tracks'],
    refetchOnWindowFocus: false,
  });
  
  // Fetch posts
  const { data: posts, isLoading: postsLoading } = useQuery<Post[]>({
    queryKey: ['/api/posts'],
    refetchOnWindowFocus: false,
  });
  
  // Define response interface for API calls
  interface ApiResponse {
    success: boolean;
    message?: string;
  }
  
  // Handler for deleting a post
  const handleDeletePost = async (postId: number) => {
    setDeletingPostId(postId);
    try {
      const response = await apiRequest<ApiResponse>(`/api/posts/${postId}`, {
        method: 'DELETE',
      });
      
      if (response.success) {
        toast({
          title: "Post deleted",
          description: `Successfully deleted post #${postId}`,
        });
        
        // Invalidate the posts query to refresh the list
        queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      } else {
        toast({
          title: "Error deleting post",
          description: response.message || "Unknown error occurred",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error deleting post:", error);
      toast({
        title: "Error deleting post",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setDeletingPostId(null);
    }
  };
  
  // Handler for deleting a track
  const handleDeleteTrack = async (trackId: number) => {
    setDeletingTrackId(trackId);
    try {
      const response = await apiRequest<ApiResponse>(`/api/tracks/${trackId}`, {
        method: 'DELETE',
      });
      
      if (response.success) {
        toast({
          title: "Track deleted",
          description: `Successfully deleted track #${trackId}`,
        });
        
        // Invalidate the tracks query to refresh the list
        queryClient.invalidateQueries({ queryKey: ['/api/tracks'] });
      } else {
        toast({
          title: "Error deleting track",
          description: response.message || "Unknown error occurred",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error deleting track:", error);
      toast({
        title: "Error deleting track",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setDeletingTrackId(null);
    }
  };
  
  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-6">Test Delete Endpoints</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tracks Section */}
        <Card>
          <CardHeader>
            <CardTitle>Tracks</CardTitle>
            <CardDescription>Delete tracks to test the API endpoint</CardDescription>
          </CardHeader>
          <CardContent>
            {tracksLoading ? (
              <p>Loading tracks...</p>
            ) : tracks && tracks.length > 0 ? (
              <ul className="space-y-2">
                {tracks.map((track) => (
                  <li key={track.id} className="flex justify-between items-center p-2 border rounded">
                    <div>
                      <p className="font-medium">{track.title}</p>
                      <p className="text-sm text-gray-500">ID: {track.id}</p>
                    </div>
                    <Button 
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteTrack(track.id)}
                      disabled={deletingTrackId === track.id}
                    >
                      {deletingTrackId === track.id ? "Deleting..." : "Delete"}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No tracks available</p>
            )}
          </CardContent>
        </Card>
        
        {/* Posts Section */}
        <Card>
          <CardHeader>
            <CardTitle>Posts</CardTitle>
            <CardDescription>Delete posts to test the API endpoint</CardDescription>
          </CardHeader>
          <CardContent>
            {postsLoading ? (
              <p>Loading posts...</p>
            ) : posts && posts.length > 0 ? (
              <ul className="space-y-2">
                {posts.map((post) => (
                  <li key={post.id} className="flex justify-between items-center p-2 border rounded">
                    <div>
                      <p className="font-medium">{post.title}</p>
                      <p className="text-sm text-gray-500">ID: {post.id}</p>
                    </div>
                    <Button 
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeletePost(post.id)}
                      disabled={deletingPostId === post.id}
                    >
                      {deletingPostId === post.id ? "Deleting..." : "Delete"}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No posts available</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}