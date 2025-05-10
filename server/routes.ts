import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { 
  insertUserSchema, 
  insertStreamSchema, 
  insertTrackSchema, 
  insertFollowSchema, 
  insertUserSettingsSchema,
  insertPostSchema,
  insertLikeSchema,
  insertCommentSchema,
  PostType,
  type PostTypeValues
} from "@shared/schema";
import { setupAuth } from "./auth";
import multer from "multer";
import path from "path";
import fs from "fs";
import { log } from "./vite";
import WebSocket, { WebSocketServer } from "ws";

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.mkdirSync(path.join(uploadsDir, "audio"), { recursive: true });
  fs.mkdirSync(path.join(uploadsDir, "images"), { recursive: true });
}

// Configure multer storage
const storage_config = multer.diskStorage({
  destination: function (req, file, cb) {
    const fileType = file.mimetype.startsWith('audio/') ? 'audio' : 'images';
    cb(null, path.join(uploadsDir, fileType));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// Create multer upload middleware
const upload = multer({ 
  storage: storage_config,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Allow audio and images
    if (file.mimetype.startsWith('audio/') || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup auth routes with Passport
  setupAuth(app);
  
  // API routes
  
  // Users
  app.get("/api/users/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    
    const user = await storage.getUser(id);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Don't expose password in API response
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  });
  
  app.get("/api/users/by-username/:username", async (req, res) => {
    const username = req.params.username;
    const user = await storage.getUserByUsername(username);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Don't expose password in API response
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  });
  
  app.post("/api/users", async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const user = await storage.createUser(userData);
      
      // Don't expose password in API response
      const { password, ...userWithoutPassword } = user;
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid user data", errors: error.errors });
      }
      res.status(500).json({ message: "Error creating user" });
    }
  });
  
  // Streams
  app.get("/api/streams/featured", async (req, res) => {
    const streams = await storage.getFeaturedStreams();
    res.json(streams);
  });
  
  app.get("/api/streams/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid stream ID" });
    }
    
    const stream = await storage.getStream(id);
    
    if (!stream) {
      return res.status(404).json({ message: "Stream not found" });
    }
    
    res.json(stream);
  });
  
  app.get("/api/streams/user/:userId", async (req, res) => {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    
    const streams = await storage.getStreamsByUser(userId);
    res.json(streams);
  });
  
  app.post("/api/streams", async (req, res) => {
    try {
      const streamData = insertStreamSchema.parse(req.body);
      const stream = await storage.createStream(streamData);
      res.status(201).json(stream);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid stream data", errors: error.errors });
      }
      res.status(500).json({ message: "Error creating stream" });
    }
  });
  
  // Tracks
  app.get("/api/tracks/recent", async (req, res) => {
    const tracks = await storage.getRecentTracks();
    res.json(tracks);
  });
  
  app.get("/api/tracks/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid track ID" });
    }
    
    const track = await storage.getTrack(id);
    
    if (!track) {
      return res.status(404).json({ message: "Track not found" });
    }
    
    res.json(track);
  });
  
  app.get("/api/tracks/user/:userId", async (req, res) => {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    
    const tracks = await storage.getTracksByUser(userId);
    res.json(tracks);
  });
  
  // Upload endpoints for files
  app.post("/api/upload/audio", upload.single("audio"), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No audio file provided" });
      }
      
      // Return the file path for client to use when creating tracks
      const fileUrl = `/uploads/audio/${req.file.filename}`;
      
      // Get audio duration (in a real app, we would use a library to get this)
      // For now we'll use a mock duration
      const duration = 180; // 3 minutes in seconds
      
      res.status(201).json({ 
        url: fileUrl, 
        originalName: req.file.originalname,
        size: req.file.size,
        duration: duration
      });
    } catch (error) {
      console.error("Audio upload error:", error);
      res.status(500).json({ message: "Error uploading audio file" });
    }
  });
  
  app.post("/api/upload/image", upload.single("image"), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }
      
      // Return the file path for client to use
      const fileUrl = `/uploads/images/${req.file.filename}`;
      
      res.status(201).json({ 
        url: fileUrl, 
        originalName: req.file.originalname,
        size: req.file.size
      });
    } catch (error) {
      console.error("Image upload error:", error);
      res.status(500).json({ message: "Error uploading image file" });
    }
  });
  
  // Track creation endpoint
  app.post("/api/tracks", async (req, res) => {
    try {
      const trackData = insertTrackSchema.parse(req.body);
      const track = await storage.createTrack(trackData);
      res.status(201).json(track);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid track data", errors: error.errors });
      }
      res.status(500).json({ message: "Error creating track" });
    }
  });
  
  // Genres
  app.get("/api/genres", async (req, res) => {
    const genres = await storage.getGenres();
    res.json(genres);
  });
  
  // Follows
  app.get("/api/channels/followed", async (req, res) => {
    // In a real app, this would get followed channels for the current user
    // For now, return all users as example channels
    const users = await storage.getAllUsers();
    res.json(users);
  });
  
  app.post("/api/follows", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    try {
      // Use authenticated user ID
      const followData = {
        ...req.body,
        followerId: req.user.id
      };
      
      const validatedData = insertFollowSchema.parse(followData);
      const follow = await storage.createFollow(validatedData);
      
      // Increment follower count
      await storage.incrementFollowerCount(validatedData.followedId);
      
      res.status(201).json(follow);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid follow data", errors: error.errors });
      }
      res.status(500).json({ message: "Error creating follow" });
    }
  });
  
  app.get("/api/follows/check", async (req, res) => {
    try {
      const { followerId, followedId } = req.query;
      
      if (!followerId || !followedId) {
        return res.status(400).json({ message: "Missing required parameters" });
      }
      
      const isFollowing = await storage.isFollowing(
        parseInt(followerId as string), 
        parseInt(followedId as string)
      );
      
      res.status(200).json({ isFollowing });
    } catch (error) {
      res.status(500).json({ message: "Error checking follow status" });
    }
  });
  
  app.get("/api/follows/followers/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const followers = await storage.getFollowers(userId);
      res.status(200).json(followers);
    } catch (error) {
      res.status(500).json({ message: "Error getting followers" });
    }
  });
  
  app.get("/api/follows/following/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const following = await storage.getFollowing(userId);
      res.status(200).json(following);
    } catch (error) {
      res.status(500).json({ message: "Error getting following users" });
    }
  });
  
  app.delete("/api/follows/:userId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const followedId = parseInt(req.params.userId);
    if (isNaN(followedId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    
    // Get current user ID from auth
    const followerId = req.user.id;
    
    try {
      await storage.removeFollow(followerId, followedId);
      
      // Decrement follower count
      await storage.decrementFollowerCount(followedId);
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Error removing follow" });
    }
  });
  
  // Likes endpoints
  app.post("/api/likes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    try {
      // Use authenticated user ID
      const likeData = {
        ...req.body,
        userId: req.user.id
      };
      
      const validatedData = insertLikeSchema.parse(likeData);
      const like = await storage.createLike(validatedData);
      res.status(201).json(like);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid like data", errors: error.errors });
      }
      res.status(500).json({ message: "Error creating like" });
    }
  });
  
  app.delete("/api/likes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { contentId, contentType } = req.body;
      const userId = req.user.id;
      
      if (!contentId || !contentType) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      await storage.removeLike(userId, contentId, contentType);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Error removing like" });
    }
  });
  
  app.get("/api/likes/check", async (req, res) => {
    try {
      const { userId, contentId, contentType } = req.query;
      
      if (!userId || !contentId || !contentType) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      const isLiked = await storage.isLiked(
        parseInt(userId as string), 
        parseInt(contentId as string), 
        contentType as string
      );
      
      res.status(200).json({ isLiked });
    } catch (error) {
      res.status(500).json({ message: "Error checking like status" });
    }
  });
  
  app.get("/api/likes/count/:contentType/:contentId", async (req, res) => {
    try {
      const { contentType, contentId } = req.params;
      const count = await storage.getLikeCount(parseInt(contentId), contentType);
      res.status(200).json({ count });
    } catch (error) {
      res.status(500).json({ message: "Error getting like count" });
    }
  });
  
  app.get("/api/likes/user/:userId/:contentType", async (req, res) => {
    try {
      const { userId, contentType } = req.params;
      const likedContentIds = await storage.getUserLikes(parseInt(userId), contentType);
      res.status(200).json(likedContentIds);
    } catch (error) {
      res.status(500).json({ message: "Error getting user likes" });
    }
  });
  
  // Comments endpoints
  app.post("/api/comments", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    try {
      // Use authenticated user ID
      const commentData = {
        ...req.body,
        userId: req.user.id
      };
      
      const validatedData = insertCommentSchema.parse(commentData);
      const comment = await storage.createComment(validatedData);
      
      // Fetch user data to include in response for immediate display
      const user = await storage.getUser(req.user.id);
      
      // Add username to response for easy display
      const responseData = {
        ...comment,
        username: user?.displayName || user?.username || 'Unknown User'
      };
      
      res.status(201).json(responseData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid comment data", errors: error.errors });
      }
      res.status(500).json({ message: "Error creating comment" });
    }
  });
  
  app.put("/api/comments/:commentId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    try {
      const commentId = parseInt(req.params.commentId);
      const { text } = req.body;
      
      if (isNaN(commentId) || !text) {
        return res.status(400).json({ message: "Invalid comment data" });
      }
      
      // Get the comment to verify ownership
      const comment = await storage.getComment(commentId);
      
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      // Verify the user owns this comment
      if (comment.userId !== req.user.id) {
        return res.status(403).json({ message: "You can only edit your own comments" });
      }
      
      const updatedComment = await storage.updateComment(commentId, text);
      
      if (!updatedComment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      res.status(200).json(updatedComment);
    } catch (error) {
      res.status(500).json({ message: "Error updating comment" });
    }
  });
  
  app.delete("/api/comments/:commentId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    try {
      const commentId = parseInt(req.params.commentId);
      
      if (isNaN(commentId)) {
        return res.status(400).json({ message: "Invalid comment ID" });
      }
      
      // Get the comment to verify ownership
      const comment = await storage.getComment(commentId);
      
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      // Verify the user owns this comment
      if (comment.userId !== req.user.id) {
        return res.status(403).json({ message: "You can only delete your own comments" });
      }
      
      await storage.deleteComment(commentId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Error deleting comment" });
    }
  });
  
  app.get("/api/comments/:contentType/:contentId", async (req, res) => {
    try {
      const { contentType, contentId } = req.params;
      const comments = await storage.getCommentsByContent(parseInt(contentId), contentType);
      res.status(200).json(comments);
    } catch (error) {
      res.status(500).json({ message: "Error getting comments" });
    }
  });
  
  app.get("/api/comments/replies/:commentId", async (req, res) => {
    try {
      const commentId = parseInt(req.params.commentId);
      
      if (isNaN(commentId)) {
        return res.status(400).json({ message: "Invalid comment ID" });
      }
      
      const replies = await storage.getReplies(commentId);
      res.status(200).json(replies);
    } catch (error) {
      res.status(500).json({ message: "Error getting comment replies" });
    }
  });
  
  // User Settings
  app.get("/api/user-settings/:userId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    
    // Only allow users to access their own settings
    if (userId !== req.user.id) {
      return res.status(403).json({ message: "You can only access your own settings" });
    }
    
    const settings = await storage.getUserSettings(userId);
    if (!settings) {
      // If no settings exist, create default ones
      const defaultSettings = await storage.createUserSettings({
        userId,
        uiColor: "#8B5CF6",
        enableAutoplay: true,
        defaultSortType: "recent"
      });
      return res.json(defaultSettings);
    }
    
    res.json(settings);
  });
  
  app.post("/api/user-settings", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    try {
      // Ensure user can only create their own settings
      const settingsData = {
        ...req.body,
        userId: req.user.id
      };
      
      const validatedData = insertUserSettingsSchema.parse(settingsData);
      const settings = await storage.createUserSettings(validatedData);
      res.status(201).json(settings);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid settings data", errors: error.errors });
      }
      res.status(500).json({ message: "Error creating user settings" });
    }
  });
  
  app.patch("/api/user-settings/:userId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    
    // Only allow users to update their own settings
    if (userId !== req.user.id) {
      return res.status(403).json({ message: "You can only update your own settings" });
    }
    
    try {
      const settingsData = req.body;
      const settings = await storage.updateUserSettings(userId, settingsData);
      res.json(settings);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid settings data", errors: error.errors });
      }
      res.status(500).json({ message: "Error updating user settings" });
    }
  });
  
  // Posts
  app.get("/api/posts/recent", async (req, res) => {
    const posts = await storage.getRecentPosts();
    res.json(posts);
  });
  
  app.get("/api/posts/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid post ID" });
    }
    
    const post = await storage.getPost(id);
    
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }
    
    res.json(post);
  });
  
  app.get("/api/posts/user/:userId", async (req, res) => {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    
    const posts = await storage.getPostsByUser(userId);
    res.json(posts);
  });
  
  app.post("/api/posts", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    try {
      console.log("Raw post request body:", JSON.stringify(req.body));
      
      // Prepare post data
      const rawData = req.body;
      
      // Build a clean post object with proper defaults
      const postData: {
        userId: number;
        title: string;
        content: string;
        postType: typeof PostType[keyof typeof PostType];
        imageUrl?: string | null;
        tags?: string[];
      } = {
        userId: req.user.id,
        title: typeof rawData.title === 'string' ? rawData.title : '',
        content: typeof rawData.content === 'string' ? rawData.content : '',
        postType: rawData.postType === PostType.IMAGE ? PostType.IMAGE : PostType.TEXT,
        tags: []
      };
      
      // Handle imageUrl properly
      if (typeof rawData.imageUrl === 'string' && rawData.imageUrl) {
        postData.imageUrl = rawData.imageUrl;
      }
      
      // Handle tags properly
      if (Array.isArray(rawData.tags)) {
        postData.tags = rawData.tags.filter((tag: any) => typeof tag === 'string');
      }
      
      // Simple direct validations (avoiding schema for now as debug)
      if (!postData.title) {
        return res.status(400).json({ message: "Title is required" });
      }
      
      if (!postData.content) {
        return res.status(400).json({ message: "Content is required" });
      }
      
      console.log("Final post data for storage:", JSON.stringify(postData));
      
      const post = await storage.createPost(postData);
      res.status(201).json(post);
    } catch (error) {
      console.error("Error creating post:", error);
      res.status(500).json({ 
        message: "Error creating post: " + (error instanceof Error ? error.message : "Unknown error"),
        error: String(error)
      });
    }
  });
  
  // Creators
  app.get("/api/creators/recommended", async (req, res) => {
    const creators = await storage.getRecommendedCreators();
    res.json(creators);
  });

  const httpServer = createServer(app);
  
  // Set up WebSocket servers
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Set up separate WebSocket server for audio streaming
  const audioStreamingWss = new WebSocketServer({ server: httpServer, path: '/audio' });
  
  // Types for WebSocket messages
  type ChatMessage = {
    id: number;
    userId: number;
    username: string;
    message: string;
    timestamp: Date;
  };
  
  type ClientMessage = {
    type: 'chat' | 'join' | 'leave';
    streamId: number;
    userId?: number;
    username?: string;
    message?: string;
  };
  
  type ServerMessage = {
    type: 'chat_message' | 'user_joined' | 'user_left' | 'stream_status' | 'viewer_count' | 'chat_history' | 'audio_level';
    streamId: number;
    userId?: number;
    username?: string;
    message?: string;
    messages?: ChatMessage[];
    viewerCount?: number;
    timestamp?: Date;
    isLive?: boolean;
    audioLevel?: number; // Audio level in dB
    level?: number;      // For dedicated audio_level messages
  };
  
  // Keep track of active streams and their connections
  const streamConnections = new Map<number, Set<WebSocket>>();
  const streamMessages = new Map<number, ChatMessage[]>();
  
  wss.on('connection', (ws, req) => {
    log('New WebSocket connection established', 'websocket');
    
    // Parse URL to get parameters
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const streamId = parseInt(url.searchParams.get('streamId') || '0');
    const userId = parseInt(url.searchParams.get('userId') || '0');
    const username = url.searchParams.get('username') || 'Anonymous';
    
    if (streamId <= 0) {
      ws.close(1008, 'Invalid stream ID');
      return;
    }
    
    // Add this client to the stream's connections
    if (!streamConnections.has(streamId)) {
      streamConnections.set(streamId, new Set());
      streamMessages.set(streamId, []);
    }
    
    const connections = streamConnections.get(streamId);
    if (connections) {
      connections.add(ws);
      
      // Update viewer count
      const viewerCount = connections.size;
      storage.updateStreamViewerCount(streamId, viewerCount);
      
      // Send existing chat history
      const messages = streamMessages.get(streamId) || [];
      ws.send(JSON.stringify({
        type: 'chat_history',
        streamId,
        messages
      }));
      
      // Send current viewer count to all clients
      connections.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'viewer_count',
            streamId,
            viewerCount,
            timestamp: new Date()
          }));
        }
      });
      
      // Broadcast user joined message
      if (userId > 0) {
        const joinMessage: ChatMessage = {
          id: Date.now(),
          userId,
          username,
          message: `${username} joined the stream`,
          timestamp: new Date()
        };
        
        messages.push(joinMessage);
        
        connections.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'user_joined',
              streamId,
              userId,
              username,
              timestamp: new Date()
            }));
          }
        });
      }
    }
    
    // Handle incoming messages
    ws.on('message', (message) => {
      try {
        const data: ClientMessage = JSON.parse(message.toString());
        const connections = streamConnections.get(data.streamId);
        const messages = streamMessages.get(data.streamId) || [];
        
        if (!connections) return;
        
        if (data.type === 'chat' && data.message) {
          // Create chat message
          const chatMessage: ChatMessage = {
            id: Date.now(),
            userId: data.userId || 0,
            username: data.username || 'Anonymous',
            message: data.message,
            timestamp: new Date()
          };
          
          // Add to message history
          messages.push(chatMessage);
          
          // Limit history to prevent memory issues
          if (messages.length > 100) {
            messages.splice(0, messages.length - 100);
          }
          
          // Broadcast to all clients
          connections.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'chat_message',
                streamId: data.streamId,
                message: chatMessage
              }));
            }
          });
        }
      } catch (error) {
        log(`Error processing WebSocket message: ${error}`, 'websocket');
      }
    });
    
    // Handle disconnection
    ws.on('close', () => {
      const connections = streamConnections.get(streamId);
      
      if (connections) {
        // Remove this client
        connections.delete(ws);
        
        // Update viewer count
        const viewerCount = connections.size;
        storage.updateStreamViewerCount(streamId, viewerCount);
        
        // Broadcast updated viewer count
        connections.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'viewer_count',
              streamId,
              viewerCount,
              timestamp: new Date()
            }));
          }
        });
        
        // Broadcast user left message
        if (userId > 0) {
          connections.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'user_left',
                streamId,
                userId,
                username,
                timestamp: new Date()
              }));
            }
          });
        }
        
        // Clean up empty stream connections
        if (connections.size === 0) {
          streamConnections.delete(streamId);
          streamMessages.delete(streamId);
        }
      }
    });
  });
  
  // Add endpoint to end a stream
  // Map to track audio streaming connections for each stream
  const audioStreamConnections = new Map<number, { broadcaster: WebSocket | null, listeners: Set<WebSocket> }>();
  
  // Handle audio streaming WebSocket connections
  audioStreamingWss.on('connection', (ws, req) => {
    log('New audio streaming WebSocket connection established', 'websocket');
    
    // Parse URL to get stream ID and determine if this is a broadcaster or listener
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const pathParts = url.pathname.split('/');
    const streamId = parseInt(pathParts[1] || '0');
    const isBroadcaster = url.searchParams.get('role') === 'broadcaster';
    
    if (streamId <= 0) {
      ws.close(1008, 'Invalid stream ID');
      return;
    }
    
    // Create connection entry for this stream if it doesn't exist
    if (!audioStreamConnections.has(streamId)) {
      audioStreamConnections.set(streamId, {
        broadcaster: null,
        listeners: new Set()
      });
    }
    
    const audioConnections = audioStreamConnections.get(streamId)!;
    
    // Set up connection based on role
    if (isBroadcaster) {
      // If there's already a broadcaster, reject this connection
      if (streamConnections.broadcaster && 
          streamConnections.broadcaster.readyState === WebSocket.OPEN) {
        ws.close(1008, 'Stream already has a broadcaster');
        return;
      }
      
      log(`Broadcaster connected for stream ${streamId}`, 'websocket');
      streamConnections.broadcaster = ws;
      
      // Update stream status to live
      storage.updateStream(streamId, { isLive: true }).catch(err => {
        log(`Error updating stream status: ${err}`, 'websocket');
      });
      
      // Handle broadcaster messages (audio data or control messages)
      ws.on('message', (data) => {
        // Check if this is a control message (string) or audio data (binary)
        if (typeof data === 'string') {
          try {
            const controlMessage = JSON.parse(data);
            
            // Handle audio level updates
            if (controlMessage.type === 'audio_level' && typeof controlMessage.level === 'number') {
              // Broadcast audio level to all listeners
              streamConnections.listeners.forEach(listener => {
                if (listener.readyState === WebSocket.OPEN) {
                  try {
                    listener.send(JSON.stringify({
                      type: 'audio_level',
                      streamId,
                      level: controlMessage.level
                    }));
                  } catch (error) {
                    log(`Error sending audio level to listener: ${error}`, 'websocket');
                  }
                }
              });
              
              // Also broadcast to chat clients for display in UI
              // Get chat clients from the separate chat WebSocket map (not the audio streamConnections)
              const chatClients = streamConnections.get(streamId); // This is the chat WebSocket connections
              if (chatClients) {
                // Update all connected chat clients with the audio level
                chatClients.forEach((client: WebSocket) => {
                  if (client.readyState === WebSocket.OPEN) {
                    try {
                      client.send(JSON.stringify({
                        type: 'stream_status',
                        streamId,
                        isLive: true,
                        audioLevel: controlMessage.level,
                        timestamp: new Date()
                      }));
                    } catch (error) {
                      log(`Error sending audio level to chat client: ${error}`, 'websocket');
                    }
                  }
                });
              }
            }
          } catch (error) {
            log(`Error processing control message: ${error}`, 'websocket');
          }
        } else {
          // This is binary audio data
          // Broadcast audio data to all listeners
          streamConnections.listeners.forEach(listener => {
            if (listener.readyState === WebSocket.OPEN) {
              try {
                listener.send(data);
              } catch (error) {
                log(`Error sending audio data to listener: ${error}`, 'websocket');
              }
            }
          });
        }
      });
      
      // Handle broadcaster disconnection
      ws.on('close', () => {
        log(`Broadcaster disconnected for stream ${streamId}`, 'websocket');
        streamConnections.broadcaster = null;
        
        // Update stream status to not live
        storage.updateStream(streamId, { isLive: false }).catch(err => {
          log(`Error updating stream status: ${err}`, 'websocket');
        });
        
        // Notify all listeners that the stream ended
        streamConnections.listeners.forEach(listener => {
          if (listener.readyState === WebSocket.OPEN) {
            try {
              // Send an empty buffer or end signal
              listener.close(1000, 'Stream ended');
            } catch (error) {
              log(`Error closing listener connection: ${error}`, 'websocket');
            }
          }
        });
        
        // Clean up if no more connections
        if (streamConnections.listeners.size === 0) {
          audioStreamConnections.delete(streamId);
        }
      });
    } else {
      // This is a listener
      log(`Listener connected for stream ${streamId}`, 'websocket');
      streamConnections.listeners.add(ws);
      
      // Handle listener disconnection
      ws.on('close', () => {
        log(`Listener disconnected from stream ${streamId}`, 'websocket');
        streamConnections.listeners.delete(ws);
        
        // Clean up if no more connections and no broadcaster
        if (streamConnections.listeners.size === 0 && 
            (!streamConnections.broadcaster || 
             streamConnections.broadcaster.readyState !== WebSocket.OPEN)) {
          audioStreamConnections.delete(streamId);
        }
      });
    }
  });
  
  // Add REST endpoint for stream status check
  app.get("/api/streams/:id/status", async (req, res) => {
    const streamId = parseInt(req.params.id);
    if (isNaN(streamId)) {
      return res.status(400).json({ message: "Invalid stream ID" });
    }
    
    const stream = await storage.getStream(streamId);
    if (!stream) {
      return res.status(404).json({ message: "Stream not found" });
    }
    
    const streamConnections = audioStreamConnections.get(streamId);
    const isLive = stream.isLive && 
                  streamConnections?.broadcaster && 
                  streamConnections.broadcaster.readyState === WebSocket.OPEN;
    
    const viewerCount = streamConnections?.listeners.size || 0;
    
    res.json({
      id: streamId,
      isLive,
      viewerCount,
      startTime: stream.startedAt
    });
  });
  
  app.post("/api/streams/:id/end", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const streamId = parseInt(req.params.id);
    if (isNaN(streamId)) {
      return res.status(400).json({ message: "Invalid stream ID" });
    }
    
    const stream = await storage.getStream(streamId);
    if (!stream) {
      return res.status(404).json({ message: "Stream not found" });
    }
    
    // Only allow the stream owner to end it
    if (stream.userId !== req.user.id) {
      return res.status(403).json({ message: "You can only end your own streams" });
    }
    
    // Update stream state to not live
    await storage.updateStream(streamId, { isLive: false });
    
    // Notify all connected chat clients
    const connections = streamConnections.get(streamId);
    if (connections) {
      connections.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'stream_status',
            streamId,
            isLive: false,
            timestamp: new Date()
          }));
        }
      });
    }
    
    // End audio stream if active
    const audioConnections = audioStreamConnections.get(streamId);
    if (audioConnections && audioConnections.broadcaster) {
      if (audioConnections.broadcaster.readyState === WebSocket.OPEN) {
        audioConnections.broadcaster.close(1000, 'Stream ended by user');
      }
      
      // Close all listener connections
      audioConnections.listeners.forEach(listener => {
        if (listener.readyState === WebSocket.OPEN) {
          listener.close(1000, 'Stream ended by user');
        }
      });
      
      // Clean up resources
      audioStreamConnections.delete(streamId);
    }
    
    // Clean up chat resources
    streamConnections.delete(streamId);
    streamMessages.delete(streamId);
    
    res.json({ success: true });
  });

  return httpServer;
}
