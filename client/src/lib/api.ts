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
      body: JSON.stringify(data),
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
  return await apiRequest<UserSettings>(`/api/user-settings/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// Tracks
export async function getRecentTracks(): Promise<Track[]> {
  return await apiRequest<Track[]>("/api/tracks/recent");
}

export async function getTracksByUser(userId: number): Promise<Track[]> {
  return await apiRequest<Track[]>(`/api/tracks/user/${userId}`);
}

// Streams
export async function getFeaturedStreams(): Promise<Stream[]> {
  return await apiRequest<Stream[]>("/api/streams/featured");
}

export async function getStreamsByUser(userId: number): Promise<Stream[]> {
  return await apiRequest<Stream[]>(`/api/streams/user/${userId}`);
}

export async function createStream(data: Partial<Stream>): Promise<Stream> {
  return await apiRequest<Stream>("/api/streams", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

// Creators
export async function getRecommendedCreators(): Promise<User[]> {
  return await apiRequest<User[]>("/api/creators/recommended");
}