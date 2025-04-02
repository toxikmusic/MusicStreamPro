import { 
  users,
  streams,
  tracks,
  genres,
  follows,
  userSettings,
  posts,
  likes,
  comments,
  PostType,
  type PostTypeValues,
  type User,
  type InsertUser,
  type Stream,
  type InsertStream,
  type Track,
  type InsertTrack,
  type Genre,
  type InsertGenre,
  type Follow,
  type InsertFollow,
  type UserSettings,
  type InsertUserSettings,
  type Post,
  type InsertPost,
  type Like,
  type InsertLike,
  type Comment,
  type InsertComment
} from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

export interface IStorage {
  // Session store for authentication
  sessionStore: session.Store;
  
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, userData: Partial<InsertUser>): Promise<User>;
  getAllUsers(): Promise<User[]>;
  incrementFollowerCount(userId: number): Promise<void>;
  decrementFollowerCount(userId: number): Promise<void>;
  
  // User Settings
  getUserSettings(userId: number): Promise<UserSettings | undefined>;
  createUserSettings(settings: InsertUserSettings): Promise<UserSettings>;
  updateUserSettings(userId: number, settings: Partial<InsertUserSettings>): Promise<UserSettings>;
  
  // Streams
  getStream(id: number): Promise<Stream | undefined>;
  getFeaturedStreams(): Promise<Stream[]>;
  getStreamsByUser(userId: number): Promise<Stream[]>;
  createStream(stream: InsertStream): Promise<Stream>;
  updateStream(id: number, data: Partial<Stream>): Promise<Stream | undefined>;
  updateStreamViewerCount(id: number, count: number): Promise<void>;
  deleteStream(id: number): Promise<boolean>;
  
  // Tracks
  getTrack(id: number): Promise<Track | undefined>;
  getRecentTracks(): Promise<Track[]>;
  getTracksByUser(userId: number): Promise<Track[]>;
  createTrack(track: InsertTrack): Promise<Track>;
  deleteTrack(id: number): Promise<boolean>;
  incrementTrackPlayCount(trackId: number): Promise<void>;
  
  // Posts
  getPost(id: number): Promise<Post | undefined>;
  getRecentPosts(): Promise<Post[]>;
  getPostsByUser(userId: number): Promise<Post[]>;
  createPost(post: InsertPost): Promise<Post>;
  deletePost(id: number): Promise<boolean>;
  
  // Genres
  getGenres(): Promise<Genre[]>;
  createGenre(genre: InsertGenre): Promise<Genre>;
  
  // Follows
  createFollow(follow: InsertFollow): Promise<Follow>;
  removeFollow(followerId: number, followedId: number): Promise<void>;
  isFollowing(followerId: number, followedId: number): Promise<boolean>;
  getFollowers(userId: number): Promise<User[]>;
  getFollowing(userId: number): Promise<User[]>;
  
  // Likes
  createLike(like: InsertLike): Promise<Like>;
  removeLike(userId: number, contentId: number, contentType: string): Promise<void>;
  isLiked(userId: number, contentId: number, contentType: string): Promise<boolean>;
  getLikeCount(contentId: number, contentType: string): Promise<number>;
  getUserLikes(userId: number, contentType: string): Promise<number[]>; // Returns content IDs
  
  // Comments
  getComment(id: number): Promise<Comment | undefined>;
  createComment(comment: InsertComment): Promise<Comment>;
  updateComment(id: number, text: string): Promise<Comment | undefined>;
  deleteComment(id: number): Promise<void>;
  getCommentsByContent(contentId: number, contentType: string): Promise<Comment[]>;
  getReplies(commentId: number): Promise<Comment[]>;
  
  // Creators
  getRecommendedCreators(): Promise<User[]>;
  
  // Search functionality
  searchTracks(query: string): Promise<Track[]>;
  searchUsers(query: string): Promise<User[]>;
  searchStreams(query: string): Promise<Stream[]>;
  searchPosts(query: string): Promise<Post[]>;
  
  // Analytics
  saveAnalyticsEvent(event: any): Promise<void>;
  getUserAnalytics(userId: number): Promise<any>;
  
  // Notifications
  getUserNotifications(userId: number): Promise<any[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private userSettings: Map<number, UserSettings>;
  private streams: Map<number, Stream>;
  private tracks: Map<number, Track>;
  private posts: Map<number, Post>;
  private genres: Map<number, Genre>;
  private follows: Map<number, Follow>;
  private likes: Map<number, Like>;
  private comments: Map<number, Comment>;
  
  private userId: number;
  private userSettingsId: number;
  private streamId: number;
  private trackId: number;
  private postId: number;
  private genreId: number;
  private followId: number;
  private likeId: number;
  private commentId: number;
  
  // Session store for authentication
  public sessionStore: session.Store;

  constructor() {
    this.users = new Map();
    this.userSettings = new Map();
    this.streams = new Map();
    this.tracks = new Map();
    this.posts = new Map();
    this.genres = new Map();
    this.follows = new Map();
    this.likes = new Map();
    this.comments = new Map();
    
    this.userId = 1;
    this.userSettingsId = 1;
    this.streamId = 1;
    this.trackId = 1;
    this.postId = 1;
    this.genreId = 1;
    this.followId = 1;
    this.likeId = 1;
    this.commentId = 1;
    
    // Create memory session store
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000 // prune expired entries every 24h
    });
    
    // Production mode - no seed data
    // this.seedData();
  }

  // Users
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }
  
  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userId++;
    const user: User = { 
      ...insertUser, 
      id,
      isStreaming: false,
      followerCount: 0,
      createdAt: new Date()
    };
    this.users.set(id, user);
    return user;
  }
  
  async updateUser(id: number, userData: Partial<InsertUser>): Promise<User> {
    const existingUser = await this.getUser(id);
    
    if (!existingUser) {
      throw new Error(`User with ID ${id} not found`);
    }
    
    // Don't allow password updates through this method for security
    const { password, ...safeData } = userData;
    
    // Update user data
    const updatedUser: User = {
      ...existingUser,
      ...safeData
    };
    
    this.users.set(id, updatedUser);
    return updatedUser;
  }
  
  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }
  
  async incrementFollowerCount(userId: number): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.followerCount += 1;
      this.users.set(userId, user);
    }
  }
  
  async decrementFollowerCount(userId: number): Promise<void> {
    const user = this.users.get(userId);
    if (user && user.followerCount > 0) {
      user.followerCount -= 1;
      this.users.set(userId, user);
    }
  }
  
  // User Settings
  async getUserSettings(userId: number): Promise<UserSettings | undefined> {
    return Array.from(this.userSettings.values()).find(
      settings => settings.userId === userId
    );
  }

  async createUserSettings(settings: InsertUserSettings): Promise<UserSettings> {
    const id = this.userSettingsId++;
    const userSettings: UserSettings = {
      ...settings,
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.userSettings.set(id, userSettings);
    return userSettings;
  }

  async updateUserSettings(userId: number, settings: Partial<InsertUserSettings>): Promise<UserSettings> {
    const existingSettings = await this.getUserSettings(userId);
    
    if (!existingSettings) {
      // If no settings exist, create new ones with defaults plus updates
      return this.createUserSettings({
        userId,
        uiColor: settings.uiColor || "#8B5CF6",
        enableAutoplay: settings.enableAutoplay !== undefined ? settings.enableAutoplay : true,
        defaultSortType: settings.defaultSortType || "recent"
      });
    }

    // Update existing settings
    const updatedSettings: UserSettings = {
      ...existingSettings,
      ...(settings as Partial<UserSettings>),
      updatedAt: new Date()
    };
    
    this.userSettings.set(existingSettings.id, updatedSettings);
    return updatedSettings;
  }
  
  // Posts
  async getPost(id: number): Promise<Post | undefined> {
    return this.posts.get(id);
  }
  
  async getRecentPosts(): Promise<Post[]> {
    return Array.from(this.posts.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);
  }
  
  async getPostsByUser(userId: number): Promise<Post[]> {
    return Array.from(this.posts.values())
      .filter(post => post.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  
  async createPost(insertPost: InsertPost): Promise<Post> {
    const id = this.postId++;
    
    // Ensure we have the correct post type from enum
    const postType = insertPost.postType === PostType.IMAGE ? 
      PostType.IMAGE : PostType.TEXT;
    
    // Ensure tags is an array
    const tags = Array.isArray(insertPost.tags) ? 
      insertPost.tags : 
      (insertPost.tags ? [insertPost.tags] : []);
    
    // Create post with properly validated fields
    const post: Post = {
      ...insertPost,
      id,
      likeCount: 0,
      commentCount: 0,
      tags: tags,
      postType: postType,
      imageUrl: insertPost.imageUrl || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.posts.set(id, post);
    return post;
  }
  
  async deletePost(id: number): Promise<boolean> {
    const post = this.posts.get(id);
    if (!post) {
      return false;
    }
    
    // Delete associated likes
    const likesToRemove = Array.from(this.likes.values())
      .filter(like => like.contentId === id && like.contentType === 'post')
      .map(like => like.id);
    
    likesToRemove.forEach(likeId => this.likes.delete(likeId));
    
    // Delete associated comments
    const commentsToRemove = Array.from(this.comments.values())
      .filter(comment => comment.contentId === id && comment.contentType === 'post')
      .map(comment => comment.id);
    
    commentsToRemove.forEach(commentId => this.comments.delete(commentId));
    
    // Delete the post
    this.posts.delete(id);
    return true;
  }
  
  // Streams
  async getStream(id: number): Promise<Stream | undefined> {
    return this.streams.get(id);
  }
  
  async getFeaturedStreams(): Promise<Stream[]> {
    return Array.from(this.streams.values())
      .filter(stream => stream.isLive)
      .sort((a, b) => b.viewerCount - a.viewerCount)
      .slice(0, 6);
  }
  
  async getStreamsByUser(userId: number): Promise<Stream[]> {
    return Array.from(this.streams.values())
      .filter(stream => stream.userId === userId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }
  
  async createStream(insertStream: InsertStream): Promise<Stream> {
    const id = this.streamId++;
    const stream: Stream = {
      ...insertStream,
      id,
      isLive: true,
      viewerCount: 0,
      startedAt: new Date(),
      endedAt: null,
      description: insertStream.description || null,
      thumbnailUrl: insertStream.thumbnailUrl || null,
      category: insertStream.category || null,
      tags: insertStream.tags || null
    };
    this.streams.set(id, stream);
    
    // Update user to be streaming
    const user = this.users.get(stream.userId);
    if (user) {
      user.isStreaming = true;
      this.users.set(user.id, user);
    }
    
    return stream;
  }
  
  async updateStream(id: number, data: Partial<Stream>): Promise<Stream | undefined> {
    const stream = this.streams.get(id);
    
    if (!stream) {
      return undefined;
    }
    
    const updatedStream = {
      ...stream,
      ...data
    };
    
    this.streams.set(id, updatedStream);
    
    // If stream is no longer live, update the user streaming status
    if (data.isLive === false) {
      const user = this.users.get(stream.userId);
      if (user) {
        user.isStreaming = false;
        this.users.set(user.id, user);
      }
    }
    
    return updatedStream;
  }
  
  async updateStreamViewerCount(id: number, count: number): Promise<void> {
    const stream = this.streams.get(id);
    
    if (stream) {
      stream.viewerCount = count;
      this.streams.set(id, stream);
    }
  }
  
  async deleteStream(id: number): Promise<boolean> {
    const stream = this.streams.get(id);
    if (!stream) {
      return false;
    }
    
    // Update user streaming status if needed
    if (stream.isLive) {
      const user = this.users.get(stream.userId);
      if (user) {
        user.isStreaming = false;
        this.users.set(user.id, user);
      }
    }
    
    this.streams.delete(id);
    return true;
  }
  
  // Tracks
  async getTrack(id: number): Promise<Track | undefined> {
    return this.tracks.get(id);
  }
  
  async getRecentTracks(): Promise<Track[]> {
    return Array.from(this.tracks.values())
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
      .slice(0, 10);
  }
  
  async getTracksByUser(userId: number): Promise<Track[]> {
    return Array.from(this.tracks.values())
      .filter(track => track.userId === userId)
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }
  
  async createTrack(insertTrack: InsertTrack): Promise<Track> {
    const id = this.trackId++;
    const track: Track = {
      ...insertTrack,
      id,
      playCount: 0,
      likeCount: 0,
      uploadedAt: new Date()
    };
    this.tracks.set(id, track);
    return track;
  }
  
  // Genres
  async getGenres(): Promise<Genre[]> {
    return Array.from(this.genres.values());
  }
  
  async createGenre(insertGenre: InsertGenre): Promise<Genre> {
    const id = this.genreId++;
    const genre: Genre = { ...insertGenre, id };
    this.genres.set(id, genre);
    return genre;
  }
  
  // Follows
  async createFollow(insertFollow: InsertFollow): Promise<Follow> {
    const id = this.followId++;
    const follow: Follow = { ...insertFollow, id };
    this.follows.set(id, follow);
    return follow;
  }
  
  async removeFollow(followerId: number, followedId: number): Promise<void> {
    const followToRemove = Array.from(this.follows.values()).find(
      f => f.followerId === followerId && f.followedId === followedId
    );
    
    if (followToRemove) {
      this.follows.delete(followToRemove.id);
    }
  }
  
  async isFollowing(followerId: number, followedId: number): Promise<boolean> {
    return Array.from(this.follows.values()).some(
      f => f.followerId === followerId && f.followedId === followedId
    );
  }
  
  async getFollowers(userId: number): Promise<User[]> {
    const followerIds = Array.from(this.follows.values())
      .filter(f => f.followedId === userId)
      .map(f => f.followerId);
    
    return Promise.all(followerIds.map(id => this.getUser(id)))
      .then(users => users.filter(Boolean) as User[]);
  }
  
  async getFollowing(userId: number): Promise<User[]> {
    const followingIds = Array.from(this.follows.values())
      .filter(f => f.followerId === userId)
      .map(f => f.followedId);
    
    return Promise.all(followingIds.map(id => this.getUser(id)))
      .then(users => users.filter(Boolean) as User[]);
  }
  
  // Likes
  async createLike(insertLike: InsertLike): Promise<Like> {
    const id = this.likeId++;
    const like: Like = { ...insertLike, id, createdAt: new Date() };
    this.likes.set(id, like);
    
    // Update like count on the content
    if (insertLike.contentType === 'track') {
      const track = this.tracks.get(insertLike.contentId);
      if (track) {
        track.likeCount += 1;
        this.tracks.set(track.id, track);
      }
    } else if (insertLike.contentType === 'post') {
      const post = this.posts.get(insertLike.contentId);
      if (post) {
        post.likeCount += 1;
        this.posts.set(post.id, post);
      }
    }
    
    return like;
  }
  
  async removeLike(userId: number, contentId: number, contentType: string): Promise<void> {
    const likeToRemove = Array.from(this.likes.values()).find(
      l => l.userId === userId && l.contentId === contentId && l.contentType === contentType
    );
    
    if (likeToRemove) {
      this.likes.delete(likeToRemove.id);
      
      // Update like count on the content
      if (contentType === 'track') {
        const track = this.tracks.get(contentId);
        if (track && track.likeCount > 0) {
          track.likeCount -= 1;
          this.tracks.set(track.id, track);
        }
      } else if (contentType === 'post') {
        const post = this.posts.get(contentId);
        if (post && post.likeCount > 0) {
          post.likeCount -= 1;
          this.posts.set(post.id, post);
        }
      }
    }
  }
  
  async isLiked(userId: number, contentId: number, contentType: string): Promise<boolean> {
    return Array.from(this.likes.values()).some(
      l => l.userId === userId && l.contentId === contentId && l.contentType === contentType
    );
  }
  
  async getLikeCount(contentId: number, contentType: string): Promise<number> {
    return Array.from(this.likes.values()).filter(
      l => l.contentId === contentId && l.contentType === contentType
    ).length;
  }
  
  async getUserLikes(userId: number, contentType: string): Promise<number[]> {
    return Array.from(this.likes.values())
      .filter(l => l.userId === userId && l.contentType === contentType)
      .map(l => l.contentId);
  }
  
  // Comments
  async getComment(id: number): Promise<Comment | undefined> {
    return this.comments.get(id);
  }
  
  async createComment(insertComment: InsertComment): Promise<Comment> {
    const id = this.commentId++;
    const comment: Comment = {
      ...insertComment,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
      likeCount: 0
    };
    this.comments.set(id, comment);
    
    // Update comment count on the content
    if (insertComment.contentType === 'track') {
      const track = this.tracks.get(insertComment.contentId);
      if (track) {
        // Ensure track has commentCount property or add it
        if (!('commentCount' in track)) {
          (track as any).commentCount = 0;
        }
        (track as any).commentCount += 1;
        this.tracks.set(track.id, track);
      }
    } else if (insertComment.contentType === 'post') {
      const post = this.posts.get(insertComment.contentId);
      if (post) {
        post.commentCount += 1;
        this.posts.set(post.id, post);
      }
    }
    
    return comment;
  }
  
  async updateComment(id: number, text: string): Promise<Comment | undefined> {
    const comment = this.comments.get(id);
    
    if (!comment) {
      return undefined;
    }
    
    const updatedComment: Comment = {
      ...comment,
      text,
      updatedAt: new Date()
    };
    
    this.comments.set(id, updatedComment);
    return updatedComment;
  }
  
  async deleteComment(id: number): Promise<void> {
    const comment = this.comments.get(id);
    
    if (comment) {
      this.comments.delete(id);
      
      // Update comment count on the content
      if (comment.contentType === 'track') {
        const track = this.tracks.get(comment.contentId);
        if (track && (track as any).commentCount > 0) {
          (track as any).commentCount -= 1;
          this.tracks.set(track.id, track);
        }
      } else if (comment.contentType === 'post') {
        const post = this.posts.get(comment.contentId);
        if (post && post.commentCount > 0) {
          post.commentCount -= 1;
          this.posts.set(post.id, post);
        }
      }
    }
  }
  
  async getCommentsByContent(contentId: number, contentType: string): Promise<Comment[]> {
    return Array.from(this.comments.values())
      .filter(c => c.contentId === contentId && c.contentType === contentType && !c.parentId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  
  async getReplies(commentId: number): Promise<Comment[]> {
    return Array.from(this.comments.values())
      .filter(c => c.parentId === commentId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  
  // Track play count
  async incrementTrackPlayCount(trackId: number): Promise<void> {
    const track = this.tracks.get(trackId);
    if (track) {
      track.playCount += 1;
      this.tracks.set(trackId, track);
    }
  }
  
  async deleteTrack(id: number): Promise<boolean> {
    const track = this.tracks.get(id);
    if (!track) {
      return false;
    }
    this.tracks.delete(id);
    
    // Also remove associated likes
    const likesToRemove = Array.from(this.likes.values())
      .filter(like => like.contentId === id && like.contentType === 'track')
      .map(like => like.id);
    
    likesToRemove.forEach(likeId => this.likes.delete(likeId));
    
    // Also remove associated comments
    const commentsToRemove = Array.from(this.comments.values())
      .filter(comment => comment.contentId === id && comment.contentType === 'track')
      .map(comment => comment.id);
    
    commentsToRemove.forEach(commentId => this.comments.delete(commentId));
    
    return true;
  }
  
  // Creators
  async getRecommendedCreators(): Promise<User[]> {
    return Array.from(this.users.values())
      .sort((a, b) => b.followerCount - a.followerCount)
      .slice(0, 10);
  }
  
  // Search functionality
  async searchTracks(query: string): Promise<Track[]> {
    const lowercaseQuery = query.toLowerCase();
    return Array.from(this.tracks.values())
      .filter(track => 
        track.title.toLowerCase().includes(lowercaseQuery) ||
        track.artistName.toLowerCase().includes(lowercaseQuery) ||
        (track.genre && track.genre.toLowerCase().includes(lowercaseQuery))
      )
      .slice(0, 10);
  }
  
  async searchUsers(query: string): Promise<User[]> {
    const lowercaseQuery = query.toLowerCase();
    return Array.from(this.users.values())
      .filter(user => 
        user.username.toLowerCase().includes(lowercaseQuery) ||
        (user.displayName && user.displayName.toLowerCase().includes(lowercaseQuery)) ||
        (user.bio && user.bio.toLowerCase().includes(lowercaseQuery))
      )
      .slice(0, 10);
  }
  
  async searchStreams(query: string): Promise<Stream[]> {
    const lowercaseQuery = query.toLowerCase();
    return Array.from(this.streams.values())
      .filter(stream => 
        stream.title.toLowerCase().includes(lowercaseQuery) ||
        (stream.description && stream.description.toLowerCase().includes(lowercaseQuery)) ||
        (stream.category && stream.category.toLowerCase().includes(lowercaseQuery))
      )
      .slice(0, 10);
  }
  
  async searchPosts(query: string): Promise<Post[]> {
    const lowercaseQuery = query.toLowerCase();
    return Array.from(this.posts.values())
      .filter(post => 
        post.title.toLowerCase().includes(lowercaseQuery) ||
        post.content.toLowerCase().includes(lowercaseQuery) ||
        (post.tags && post.tags.some(tag => tag.toLowerCase().includes(lowercaseQuery)))
      )
      .slice(0, 10);
  }
  
  // Analytics
  async saveAnalyticsEvent(event: any): Promise<void> {
    // In-memory implementation - in a real app this would save to a database
    console.log('Analytics event:', event);
  }
  
  async getUserAnalytics(userId: number): Promise<any> {
    // Simplified analytics data
    return {
      playCount: Array.from(this.tracks.values())
        .filter(track => track.userId === userId)
        .reduce((sum, track) => sum + track.playCount, 0),
      totalLikes: Array.from(this.likes.values())
        .filter(like => 
          like.contentType === 'track' && 
          this.tracks.get(like.contentId)?.userId === userId
        ).length
    };
  }
  
  // Notifications
  async getUserNotifications(userId: number): Promise<any[]> {
    // Simplified notifications implementation
    return [];
  }
  
  // Seed data (empty for production)
  private seedData() {
    // For production, we don't include any seed data
    // Common genres that can be added by users or admins later
    const defaultGenres = [
      "Electronic", "Hip Hop", "Lo-Fi", "House", "Indie", "Techno", "Trap", "Ambient", "Jazz", "R&B"
    ];
    
    // Add default genres only if needed
    if (process.env.SEED_DEFAULT_GENRES === 'true') {
      defaultGenres.forEach(name => {
        const id = this.genreId++;
        this.genres.set(id, { id, name });
      });
    }
  }
}

// Import our database storage implementation
import { DatabaseStorage } from './database-storage';

// Choose which storage to use based on environment
const useDatabase = true; // Set to true to use database storage, false for memory storage

export const storage = useDatabase ? new DatabaseStorage() : new MemStorage();
