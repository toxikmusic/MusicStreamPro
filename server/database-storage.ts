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
import { db, sql } from "./db";
import { eq, and, desc, isNull, asc, or, like, ilike } from "drizzle-orm";
import { SQL } from "drizzle-orm/sql";
import connectPg from "connect-pg-simple";
import { IStorage } from "./storage";

// Create the session store
const PostgresSessionStore = connectPg(session);

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    // Create a PostgreSQL-backed session store using the connection from env var
    const connectionString = process.env.DATABASE_URL || '';
    const dbConfig = { connectionString };
    
    this.sessionStore = new PostgresSessionStore({
      conObject: dbConfig,
      createTableIfMissing: true,
      tableName: 'session'
    });
    
    // Run the database migration if needed
    this.initializeDatabase();
  }

  private async initializeDatabase() {
    try {
      // Check if we need to run migrations by checking if users table exists and has records
      const existingUsers = await db.select().from(users).limit(1);
      
      if (existingUsers.length === 0) {
        console.log("Initializing database with default data...");
        
        // Add default genres for a clean installation
        const defaultGenres = [
          "Electronic", "Hip Hop", "Lo-Fi", "House", "Indie", 
          "Techno", "Trap", "Ambient", "Jazz", "R&B"
        ];
        
        for (const name of defaultGenres) {
          await db.insert(genres).values({ name }).onConflictDoNothing();
        }
        
        // Initialize with just genres, no demo users or content
        console.log("Database initialized with default genres only.");
      }
    } catch (error) {
      console.error("Error initializing database:", error);
    }
  }

  // Users
  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username));
    return result[0];
  }
  
  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email));
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values(user).returning();
    return result[0];
  }
  
  async updateUser(id: number, userData: Partial<InsertUser>): Promise<User> {
    // Don't allow password updates through this method for security
    const { password, ...safeData } = userData;
    
    const result = await db.update(users)
      .set(safeData)
      .where(eq(users.id, id))
      .returning();
    
    return result[0];
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async incrementFollowerCount(userId: number): Promise<void> {
    const user = await this.getUser(userId);
    if (user) {
      await db.update(users)
        .set({
          followerCount: (user.followerCount || 0) + 1
        })
        .where(eq(users.id, userId));
    }
  }

  async decrementFollowerCount(userId: number): Promise<void> {
    const user = await this.getUser(userId);
    if (user && user.followerCount && user.followerCount > 0) {
      await db.update(users)
        .set({ followerCount: user.followerCount - 1 })
        .where(eq(users.id, userId));
    }
  }

  // User Settings
  async getUserSettings(userId: number): Promise<UserSettings | undefined> {
    const result = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    return result[0];
  }

  async createUserSettings(settings: InsertUserSettings): Promise<UserSettings> {
    const result = await db.insert(userSettings).values(settings).returning();
    return result[0];
  }

  async updateUserSettings(userId: number, settings: Partial<InsertUserSettings>): Promise<UserSettings> {
    const existing = await this.getUserSettings(userId);
    
    if (!existing) {
      // If no settings exist, create new ones with defaults plus updates
      return this.createUserSettings({
        userId,
        uiColor: settings.uiColor || "#8B5CF6",
        enableAutoplay: settings.enableAutoplay !== undefined ? settings.enableAutoplay : true,
        defaultSortType: settings.defaultSortType || "recent",
        highContrastMode: settings.highContrastMode !== undefined ? settings.highContrastMode : false
      });
    }

    // Update existing settings
    const result = await db.update(userSettings)
      .set({ ...settings, updatedAt: new Date() })
      .where(eq(userSettings.userId, userId))
      .returning();
    
    return result[0];
  }

  // Posts
  async getPost(id: number): Promise<Post | undefined> {
    const result = await db.select().from(posts).where(eq(posts.id, id));
    return result[0];
  }
  
  async getRecentPosts(): Promise<Post[]> {
    return await db.select().from(posts).orderBy(desc(posts.createdAt)).limit(10);
  }
  
  async getPostsByUser(userId: number): Promise<Post[]> {
    return await db.select().from(posts)
      .where(eq(posts.userId, userId))
      .orderBy(desc(posts.createdAt));
  }
  
  async createPost(post: InsertPost): Promise<Post> {
    // Insert post into database with minimal required fields
    const result = await db.insert(posts)
      .values({
        userId: post.userId,
        title: post.title,
        content: post.content,
        // Let the database handle defaults for the rest
      })
      .returning();
    
    // Return created post
    return result[0];
  }
  
  async deletePost(id: number): Promise<boolean> {
    try {
      // First, delete associated likes
      await db.delete(likes)
        .where(and(
          eq(likes.contentId, id),
          eq(likes.contentType, 'post')
        ));
        
      // Delete associated comments
      await db.delete(comments)
        .where(and(
          eq(comments.contentId, id),
          eq(comments.contentType, 'post')
        ));
      
      // Delete the post
      const result = await db.delete(posts)
        .where(eq(posts.id, id))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      console.error('Error deleting post:', error);
      return false;
    }
  }
  
  // Streams
  async getStream(id: number): Promise<Stream | undefined> {
    const result = await db.select({
      id: streams.id,
      userId: streams.userId,
      title: streams.title,
      description: streams.description,
      thumbnailUrl: streams.thumbnailUrl,
      streamKey: streams.streamKey,
      isLive: streams.isLive,
      viewerCount: streams.viewerCount,
      startedAt: streams.startedAt,
      endedAt: streams.endedAt,
      category: streams.category,
      tags: streams.tags
    })
    .from(streams)
    .where(eq(streams.id, id));
    
    return result[0];
  }
  
  async getFeaturedStreams(): Promise<Stream[]> {
    return await db.select({
      id: streams.id,
      userId: streams.userId,
      title: streams.title,
      description: streams.description,
      thumbnailUrl: streams.thumbnailUrl,
      streamKey: streams.streamKey,
      isLive: streams.isLive,
      viewerCount: streams.viewerCount,
      startedAt: streams.startedAt,
      endedAt: streams.endedAt,
      category: streams.category,
      tags: streams.tags
    })
    .from(streams)
    .where(eq(streams.isLive, true))
    .orderBy(desc(streams.viewerCount))
    .limit(6);
  }
  
  async getStreamsByUser(userId: number): Promise<Stream[]> {
    return await db.select({
      id: streams.id,
      userId: streams.userId,
      title: streams.title,
      description: streams.description,
      thumbnailUrl: streams.thumbnailUrl,
      streamKey: streams.streamKey,
      isLive: streams.isLive,
      viewerCount: streams.viewerCount,
      startedAt: streams.startedAt,
      endedAt: streams.endedAt,
      category: streams.category,
      tags: streams.tags
    })
    .from(streams)
    .where(eq(streams.userId, userId))
    .orderBy(desc(streams.startedAt));
  }
  
  async createStream(stream: InsertStream): Promise<Stream> {
    const result = await db.insert(streams)
      .values({
        ...stream,
        isLive: true,
        viewerCount: 0,
        startedAt: new Date()
      })
      .returning();
      
    // Update user streaming status
    await db.update(users)
      .set({ isStreaming: true })
      .where(eq(users.id, stream.userId));
      
    return result[0];
  }
  
  async updateStream(id: number, data: Partial<Stream>): Promise<Stream | undefined> {
    const result = await db.update(streams)
      .set(data)
      .where(eq(streams.id, id))
      .returning();
      
    // If stream is no longer live, update user streaming status
    if (data.isLive === false) {
      const stream = await this.getStream(id);
      if (stream) {
        await db.update(users)
          .set({ isStreaming: false })
          .where(eq(users.id, stream.userId));
      }
    }
    
    return result[0];
  }
  
  async updateStreamViewerCount(id: number, count: number): Promise<void> {
    await db.update(streams)
      .set({ viewerCount: count })
      .where(eq(streams.id, id));
  }
  
  async deleteStream(id: number): Promise<boolean> {
    try {
      // Delete the stream
      const result = await db.delete(streams)
        .where(eq(streams.id, id))
        .returning();
      
      // Update the user's streaming status if this was a live stream
      if (result.length > 0 && result[0].isLive) {
        const stream = result[0];
        await db.update(users)
          .set({ isStreaming: false })
          .where(eq(users.id, stream.userId));
      }
      
      return result.length > 0;
    } catch (error) {
      console.error('Error deleting stream:', error);
      return false;
    }
  }
  
  // Tracks
  async getTrack(id: number): Promise<Track | undefined> {
    const result = await db.select().from(tracks).where(eq(tracks.id, id));
    return result[0];
  }
  
  async getRecentTracks(): Promise<Track[]> {
    return await db.select().from(tracks)
      .orderBy(desc(tracks.uploadedAt))
      .limit(10);
  }
  
  async getTracksByUser(userId: number): Promise<Track[]> {
    return await db.select().from(tracks)
      .where(eq(tracks.userId, userId))
      .orderBy(desc(tracks.uploadedAt));
  }
  
  async createTrack(track: InsertTrack): Promise<Track> {
    const result = await db.insert(tracks)
      .values({
        ...track,
        playCount: 0,
        likeCount: 0,
        uploadedAt: new Date()
      })
      .returning();
    
    return result[0];
  }
  
  // Genres
  async getGenres(): Promise<Genre[]> {
    return await db.select().from(genres);
  }
  
  async createGenre(genre: InsertGenre): Promise<Genre> {
    const result = await db.insert(genres)
      .values(genre)
      .returning();
    
    return result[0];
  }
  
  // Follows
  async createFollow(follow: InsertFollow): Promise<Follow> {
    const result = await db.insert(follows)
      .values(follow)
      .returning();
    
    // Increment follower count
    await this.incrementFollowerCount(follow.followedId);
    
    return result[0];
  }
  
  async removeFollow(followerId: number, followedId: number): Promise<void> {
    await db.delete(follows)
      .where(
        and(
          eq(follows.followerId, followerId),
          eq(follows.followedId, followedId)
        )
      );
    
    // Decrement follower count
    await this.decrementFollowerCount(followedId);
  }
  
  async isFollowing(followerId: number, followedId: number): Promise<boolean> {
    const result = await db.select().from(follows)
      .where(
        and(
          eq(follows.followerId, followerId),
          eq(follows.followedId, followedId)
        )
      );
      
    return result.length > 0;
  }
  
  async getFollowers(userId: number): Promise<User[]> {
    const followerRelations = await db.select().from(follows)
      .where(eq(follows.followedId, userId));
      
    const followerIds = followerRelations.map(f => f.followerId);
    
    if (followerIds.length === 0) return [];
    
    return await Promise.all(followerIds.map(id => this.getUser(id)))
      .then(users => users.filter(Boolean) as User[]);
  }
  
  async getFollowing(userId: number): Promise<User[]> {
    const followingRelations = await db.select().from(follows)
      .where(eq(follows.followerId, userId));
      
    const followingIds = followingRelations.map(f => f.followedId);
    
    if (followingIds.length === 0) return [];
    
    return await Promise.all(followingIds.map(id => this.getUser(id)))
      .then(users => users.filter(Boolean) as User[]);
  }
  
  // Likes
  async createLike(like: InsertLike): Promise<Like> {
    let result;
    // Use a transaction to ensure atomic updates
    await db.transaction(async (tx) => {
      result = await tx.insert(likes)
        .values({
          ...like,
          createdAt: new Date()
        })
        .returning();
      
      // Update like count on content
      if (like.contentType === 'track') {
        const track = await this.getTrack(like.contentId);
        if (track) {
          await tx.update(tracks)
            .set({
              likeCount: (track.likeCount || 0) + 1
            })
            .where(eq(tracks.id, like.contentId));
        }
      } else if (like.contentType === 'post') {
        const post = await this.getPost(like.contentId);
        if (post) {
          await tx.update(posts)
            .set({
              likeCount: (post.likeCount || 0) + 1
            })
            .where(eq(posts.id, like.contentId));
        }
      }
    });
    
    return result![0];
  }
  
  async removeLike(userId: number, contentId: number, contentType: string): Promise<void> {
    await db.delete(likes)
      .where(
        and(
          eq(likes.userId, userId),
          eq(likes.contentId, contentId),
          eq(likes.contentType, contentType)
        )
      );
    
    // Update like count on content
    if (contentType === 'track') {
      const track = await this.getTrack(contentId);
      if (track && track.likeCount && track.likeCount > 0) {
        await db.update(tracks)
          .set({ likeCount: track.likeCount - 1 })
          .where(eq(tracks.id, contentId));
      }
    } else if (contentType === 'post') {
      const post = await this.getPost(contentId);
      if (post && post.likeCount && post.likeCount > 0) {
        await db.update(posts)
          .set({ likeCount: post.likeCount - 1 })
          .where(eq(posts.id, contentId));
      }
    }
  }
  
  async isLiked(userId: number, contentId: number, contentType: string): Promise<boolean> {
    const result = await db.select().from(likes)
      .where(
        and(
          eq(likes.userId, userId),
          eq(likes.contentId, contentId),
          eq(likes.contentType, contentType)
        )
      );
      
    return result.length > 0;
  }
  
  async getLikeCount(contentId: number, contentType: string): Promise<number> {
    const result = await db.select().from(likes)
      .where(
        and(
          eq(likes.contentId, contentId),
          eq(likes.contentType, contentType)
        )
      );
      
    return result.length;
  }
  
  async getUserLikes(userId: number, contentType: string): Promise<number[]> {
    const result = await db.select().from(likes)
      .where(
        and(
          eq(likes.userId, userId),
          eq(likes.contentType, contentType)
        )
      );
      
    return result.map(like => like.contentId);
  }
  
  // Comments
  async getComment(id: number): Promise<Comment | undefined> {
    const result = await db.select().from(comments).where(eq(comments.id, id));
    return result[0];
  }
  
  async createComment(comment: InsertComment): Promise<Comment> {
    const result = await db.insert(comments)
      .values({
        ...comment,
        createdAt: new Date(),
        updatedAt: new Date(),
        likeCount: 0
      })
      .returning();
    
    // Update comment count on content
    if (comment.contentType === 'track') {
      // No commentCount in Track schema, so we'll just leave it
    } else if (comment.contentType === 'post') {
      const post = await this.getPost(comment.contentId);
      if (post) {
        await db.update(posts)
          .set({ commentCount: (post.commentCount || 0) + 1 })
          .where(eq(posts.id, comment.contentId));
      }
    }
    
    return result[0];
  }
  
  async updateComment(id: number, text: string): Promise<Comment | undefined> {
    const result = await db.update(comments)
      .set({
        text,
        updatedAt: new Date()
      })
      .where(eq(comments.id, id))
      .returning();
    
    return result[0];
  }
  
  async deleteComment(id: number): Promise<void> {
    const comment = await this.getComment(id);
    
    if (comment) {
      await db.delete(comments).where(eq(comments.id, id));
      
      // Update comment count on content
      if (comment.contentType === 'post') {
        const post = await this.getPost(comment.contentId);
        if (post && post.commentCount && post.commentCount > 0) {
          await db.update(posts)
            .set({ commentCount: post.commentCount - 1 })
            .where(eq(posts.id, comment.contentId));
        }
      }
    }
  }
  
  async getCommentsByContent(contentId: number, contentType: string): Promise<Comment[]> {
    return await db.select().from(comments)
      .where(
        and(
          eq(comments.contentId, contentId),
          eq(comments.contentType, contentType),
          isNull(comments.parentId)
        )
      )
      .orderBy(desc(comments.createdAt));
  }
  
  async getReplies(commentId: number): Promise<Comment[]> {
    return await db.select().from(comments)
      .where(eq(comments.parentId, commentId))
      .orderBy(asc(comments.createdAt));
  }
  
  // Track play count
  async incrementTrackPlayCount(trackId: number): Promise<void> {
    const track = await this.getTrack(trackId);
    if (track) {
      await db.update(tracks)
        .set({
          playCount: (track.playCount || 0) + 1
        })
        .where(eq(tracks.id, trackId));
    }
  }
  
  async deleteTrack(id: number): Promise<boolean> {
    try {
      // First, delete associated likes
      await db.delete(likes)
        .where(and(
          eq(likes.contentId, id),
          eq(likes.contentType, 'track')
        ));
        
      // Delete associated comments
      await db.delete(comments)
        .where(and(
          eq(comments.contentId, id),
          eq(comments.contentType, 'track')
        ));
      
      // Delete the track
      const result = await db.delete(tracks)
        .where(eq(tracks.id, id))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      console.error('Error deleting track:', error);
      return false;
    }
  }
  
  // Creators
  async getRecommendedCreators(): Promise<User[]> {
    return await db.select().from(users)
      .orderBy(desc(users.followerCount))
      .limit(10);
  }

  // Search functionality
  async searchTracks(query: string): Promise<Track[]> {
    try {
      const searchPattern = `%${query}%`;
      
      return await db.select({
        id: tracks.id,
        userId: tracks.userId,
        title: tracks.title,
        artistName: tracks.artistName,
        coverUrl: tracks.coverUrl,
        audioUrl: tracks.audioUrl,
        duration: tracks.duration,
        playCount: tracks.playCount,
        likeCount: tracks.likeCount,
        uploadedAt: tracks.uploadedAt,
        genre: tracks.genre
      })
      .from(tracks)
      .where(
        or(
          ilike(tracks.title, searchPattern),
          ilike(tracks.artistName, searchPattern),
          ilike(tracks.genre, searchPattern)
        )
      )
      .limit(10);
    } catch (error) {
      console.error("Error in searchTracks:", error);
      return [];
    }
  }
  
  async searchUsers(query: string): Promise<User[]> {
    try {
      const searchPattern = `%${query}%`;
      
      return await db.select({
        id: users.id,
        username: users.username,
        password: users.password,
        displayName: users.displayName,
        bio: users.bio,
        profileImageUrl: users.profileImageUrl,
        isStreaming: users.isStreaming,
        followerCount: users.followerCount,
        createdAt: users.createdAt
      })
      .from(users)
      .where(
        or(
          ilike(users.username, searchPattern),
          ilike(users.displayName, searchPattern),
          ilike(users.bio, searchPattern)
        )
      )
      .limit(10);
    } catch (error) {
      console.error("Error in searchUsers:", error);
      return [];
    }
  }
  
  async searchStreams(query: string): Promise<Stream[]> {
    try {
      const searchPattern = `%${query}%`;
      
      return await db.select({
        id: streams.id,
        userId: streams.userId,
        title: streams.title,
        description: streams.description,
        thumbnailUrl: streams.thumbnailUrl,
        streamKey: streams.streamKey,
        isLive: streams.isLive,
        viewerCount: streams.viewerCount,
        startedAt: streams.startedAt,
        endedAt: streams.endedAt,
        category: streams.category,
        tags: streams.tags
      })
      .from(streams)
      .where(
        or(
          ilike(streams.title, searchPattern),
          ilike(streams.description, searchPattern),
          ilike(streams.category, searchPattern)
        )
      )
      .limit(10);
    } catch (error) {
      console.error("Error in searchStreams:", error);
      return [];
    }
  }
  
  async searchPosts(query: string): Promise<Post[]> {
    try {
      const searchPattern = `%${query}%`;
      
      return await db.select({
        id: posts.id,
        userId: posts.userId,
        title: posts.title,
        content: posts.content,
        imageUrl: posts.imageUrl,
        createdAt: posts.createdAt,
        updatedAt: posts.updatedAt,
        likeCount: posts.likeCount,
        commentCount: posts.commentCount,
        tags: posts.tags,
        postType: posts.postType
      })
      .from(posts)
      .where(
        or(
          ilike(posts.title, searchPattern),
          ilike(posts.content, searchPattern)
        )
      )
      .limit(10);
    } catch (error) {
      console.error("Error in searchPosts:", error);
      return [];
    }
  }
  
  // Analytics
  async saveAnalyticsEvent(event: any): Promise<void> {
    // For now just log the event
    console.log('Analytics event:', event);
  }
  
  async getUserAnalytics(userId: number): Promise<any> {
    try {
      // Get total play count for user's tracks using raw SQL
      const playCountQuery = await sql`
        SELECT SUM(play_count) as total_plays
        FROM tracks
        WHERE user_id = ${userId}
      `;
      
      // Get total likes for user's tracks using raw SQL
      const likesQuery = await sql`
        SELECT COUNT(*) as total_likes
        FROM likes
        JOIN tracks ON likes.content_id = tracks.id AND likes.content_type = 'track'
        WHERE tracks.user_id = ${userId}
      `;
      
      return {
        playCount: playCountQuery[0]?.total_plays || 0,
        totalLikes: likesQuery[0]?.total_likes || 0
      };
    } catch (error) {
      console.error("Error in getUserAnalytics:", error);
      return {
        playCount: 0,
        totalLikes: 0
      };
    }
  }
  
  // Notifications
  async getUserNotifications(userId: number): Promise<any[]> {
    // In a real implementation, we would have a notifications table
    // For now, return an empty array
    return [];
  }
}