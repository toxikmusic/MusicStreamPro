import { apiRequest } from "./queryClient";
import { Post, User, UserSettings, Track, Stream } from "@shared/schema";

// Posts
export async function getPosts(): Promise<Post[]> {
  const posts = await apiRequest<Post[]>("/api/posts/recent");
  
  // For each post, fetch the user details
  const postsWithUsers = await Promise.all(
    posts.map(async (post) => {
      try {
        const user = await apiRequest<User>(`/api/users/${post.userId}`);
        return { ...post, user };
      } catch (error) {
        return post;
      }
    })
  );
  
  return postsWithUsers;
}

export async function getPostsByUser(userId: number): Promise<Post[]> {
  return await apiRequest<Post[]>(`/api/posts/user/${userId}`);
}

export async function createPost(data: any): Promise<Post> {
  try {
    console.log("API: Sending post data:", data);
    const response = await apiRequest<Post>("/api/posts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: data,
    });
    console.log("API: Post creation successful:", response);
    return response;
  } catch (error) {
    console.error("API: Post creation failed:", error);
    throw error;
  }
}

// User Settings
export async function getUserSettings(userId: number): Promise<UserSettings> {
  return await apiRequest<UserSettings>(`/api/user-settings/${userId}`);
}

export async function updateUserSettings(userId: number, data: Partial<UserSettings>): Promise<UserSettings> {
  console.log("API: Updating user settings:", { userId, data });
  try {
    const result = await apiRequest<UserSettings>(`/api/user-settings/${userId}`, {
      method: "PATCH",
      body: data,
    });
    console.log("API: User settings update result:", result);
    return result;
  } catch (error) {
    console.error("API: Failed to update user settings:", error);
    throw error;
  }
}

// User Profile
export async function updateUserProfile(userId: number, data: { 
  displayName?: string; 
  bio?: string; 
  profileImageUrl?: string; 
}): Promise<User> {
  return await apiRequest<User>(`/api/users/${userId}`, {
    method: "PATCH",
    body: data,
  });
}

// Tracks
export async function getRecentTracks(): Promise<Track[]> {
  return await apiRequest<Track[]>("/api/tracks/recent");
}

export async function getTracksByUser(userId: number): Promise<Track[]> {
  return await apiRequest<Track[]>(`/api/tracks/user/${userId}`);
}

export async function deleteTrack(trackId: number): Promise<{ success: boolean }> {
  return await apiRequest<{ success: boolean }>(`/api/tracks/${trackId}`, {
    method: "DELETE"
  });
}

// Streams
export async function getFeaturedStreams(): Promise<Stream[]> {
  return await apiRequest<Stream[]>("/api/streams/featured");
}

export async function getStreamsByUser(userId: number): Promise<Stream[]> {
  return await apiRequest<Stream[]>(`/api/streams/user/${userId}`);
}

export async function getActiveStreamsByUser(userId: number): Promise<Stream[]> {
  const streams = await getStreamsByUser(userId);
  return streams.filter(stream => stream.isLive);
}

export async function createStream(data: Partial<Stream> & {
  useCamera?: boolean;
  useMicrophone?: boolean;
  useSystemAudio?: boolean;
  streamType?: "video" | "audio";
  hasVisualElement?: boolean;
}): Promise<Stream> {
  // Get current user ID from authentication
  const user = await apiRequest<User>("/api/user");
  
  // Add userId to stream data
  const streamData = {
    ...data,
    userId: user.id,
    streamType: data.streamType || "video",
    useCamera: data.streamType === "audio" ? false : (data.useCamera ?? true),
    useMicrophone: data.useMicrophone ?? true,
    useSystemAudio: data.useSystemAudio ?? false,
    hasVisualElement: data.hasVisualElement ?? false
  };
  
  console.log("Creating stream with data:", streamData);
  
  return await apiRequest<Stream>("/api/streams", {
    method: "POST",
    body: streamData
  });
}

// Upload a visual element for an audio stream
export async function uploadVisualElement(streamId: number, file: File): Promise<{
  message: string;
  stream: Stream;
}> {
  try {
    console.log(`API: Uploading visual element for stream ${streamId}, type: ${file.type}, size: ${file.size} bytes`);
    
    const formData = new FormData();
    formData.append('visualElement', file);
    
    const response = await fetch(`/api/streams/${streamId}/visual-element`, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        // Try to parse as JSON
        errorData = JSON.parse(errorText);
      } catch (e) {
        // If it's not valid JSON, use the text directly
        console.error('API: Server returned non-JSON error:', errorText);
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }
      
      console.error('API: Failed to upload visual element:', errorData);
      throw new Error(errorData.error || 'Failed to upload visual element');
    }
    
    const result = await response.json();
    console.log('API: Visual element upload successful:', result);
    return result;
  } catch (error) {
    console.error('API: Visual element upload exception:', error);
    throw error;
  }
}

export async function deleteStream(streamId: number): Promise<{ success: boolean }> {
  return await apiRequest<{ success: boolean }>(`/api/streams/${streamId}`, {
    method: "DELETE"
  });
}

// End stream (mark as not live but keep the record)
export async function endStream(streamId: number): Promise<{ success: boolean }> {
  return await apiRequest<{ success: boolean }>(`/api/streams/${streamId}/end`, {
    method: "POST"
  });
}

// HLS Specific APIs

// Create an HLS stream
export async function createHLSStream(data: {
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  createShareableUrl?: boolean;
}): Promise<{
  success: boolean;
  streamId: number;
  streamKey: string;
  hlsPlaylistUrl: string;
  hlsSegmentUrl: string;
  shareUrl: string;
}> {
  // Get current user ID from authentication
  const user = await apiRequest<User>("/api/user");
  
  // Create the stream with user ID
  return await apiRequest<any>('/api/streams/hls', {
    method: "POST",
    body: {
      ...data,
      userId: user.id
    }
  });
}

// Initialize HLS on an existing stream
export async function initializeHLSStream(streamId: number): Promise<{
  success: boolean;
  streamId: number;
  hlsPlaylistUrl: string;
  hlsSegmentUrl: string;
}> {
  return await apiRequest<any>(`/api/streams/${streamId}/hls`, {
    method: "POST"
  });
}

// End an HLS stream
export async function endHLSStream(streamId: number): Promise<{
  success: boolean;
  showSavePrompt: boolean;
  temporaryUrl?: string;
  message: string;
}> {
  return await apiRequest<any>(`/api/streams/${streamId}/hls/end`, {
    method: "POST"
  });
}

// Finalize a stream recording (save or delete)
export async function finalizeStreamRecording(streamId: number, savePermanently: boolean): Promise<{
  success: boolean;
  message: string;
  permanentUrl?: string;
}> {
  return await apiRequest<any>(`/api/streams/${streamId}/recording/finalize`, {
    method: "POST",
    body: { savePermanently }
  });
}

// Upload an HLS segment
export async function uploadHLSSegment(streamId: number, segmentData: Blob): Promise<{
  success: boolean;
  playlistUrl: string;
}> {
  try {
    console.log(`API: Uploading segment for stream ${streamId}, size: ${segmentData.size} bytes`);
    
    const formData = new FormData();
    formData.append('segment', segmentData);
    
    const response = await fetch(`/api/streams/${streamId}/segment`, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        // Try to parse as JSON
        errorData = JSON.parse(errorText);
      } catch (e) {
        // If it's not valid JSON, use the text directly
        console.error('API: Server returned non-JSON error:', errorText);
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }
      
      console.error('API: Failed to upload segment:', errorData);
      throw new Error(errorData.error || 'Failed to upload segment');
    }
    
    const result = await response.json();
    console.log('API: Segment upload successful:', result);
    return result;
  } catch (error) {
    console.error('API: Segment upload exception:', error);
    throw error;
  }
}

// Creators
export async function getRecommendedCreators(): Promise<User[]> {
  return await apiRequest<User[]>("/api/creators/recommended");
}