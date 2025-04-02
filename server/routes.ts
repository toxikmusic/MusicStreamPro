import express, { type Express, Request, Response, NextFunction } from "express";
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
  type PostTypeValues,
  type InsertUser
} from "@shared/schema";
import { setupAuth } from "./auth";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { checkCloudflareService } from './services/cloudflare';
import { log } from "./vite";
import { Server as SocketIOServer } from "socket.io";
import { WebSocketServer, WebSocket } from "ws";
import { db } from "./db";
import { v4 as uuidv4 } from "uuid";
import {
  handleMasterPlaylist,
  handleMediaPlaylist,
  handleSegment,
  createOrUpdateHLSPlaylist,
  uploadSegment,
  endHLSStream,
  processWebRTCChunk,
  finalizeStreamRecording
} from "./hls";
import { objectStorage } from "./object-storage";

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage_ = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, uploadsDir)
  },
  filename: function(req, file, cb) {
    // Use original filename with timestamp to avoid collisions
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    const ext = path.extname(file.originalname)
    cb(null, uniqueSuffix + ext)
  }
});

// For regular file uploads (stored on disk)
const upload = multer({ 
  storage: storage_,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// For streaming segments (stored in memory)
const memoryUpload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB limit for stream segments
  }
});

// Helper function to generate a secure stream key
function generateStreamKey(): string {
  return crypto.randomBytes(24).toString('hex');
}

// Initialize WebSocket and Socket.IO
let io: SocketIOServer;

// Setup for chat/stream messages
const streamConnections = new Map<number, Set<WebSocket>>();
const streamMessages = new Map<number, any[]>();

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server
  const server = createServer(app);
  
  // Initialize Socket.IO for streaming
  io = new SocketIOServer(server, {
    cors: {
      origin: "*", // Allow all origins, customize this in production
      methods: ["GET", "POST"]
    }
  });
  
  // Handle authentication for APIs (using passport.js)
  setupAuth(app);
  
  // Serve static files from the uploads directory
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
  
  // Add middleware for streaming content from object storage
  app.use(objectStorage.serveContent.bind(objectStorage));

  // Initialize WebSocket server for chat
  const wss = new WebSocketServer({ noServer: true });
  
  // Define a separate WebSocket server for audio streaming
  const audioStreamingWss = new WebSocketServer({ noServer: true });
  
  // Define Socket.IO namespace for chat/stream functionality
  const streamIo = io.of('/stream');
  
  streamIo.on('connection', (socket) => {
    log('New Socket.IO connection established', 'websocket');

    // Get connection parameters from handshake query or auth
    const query = socket.handshake.query;
    const streamId = parseInt(query.streamId as string || '0');
    const userId = parseInt(query.userId as string || '0');
    const username = query.username as string || 'Anonymous';
    const role = query.role as string || 'listener';
    const streamKey = query.streamKey as string || '';

    if (streamId <= 0) {
      socket.disconnect();
      return;
    }

    // Join a room specific to this stream
    socket.join(`stream:${streamId}`);
    
    // Set up Socket.IO specific handling for audio streaming
    if (role === 'broadcaster') {
      // Handle broadcaster connection
      log(`Broadcaster connected to stream ${streamId}`, 'websocket');
      
      // Verify stream key if provided
      if (streamKey) {
        storage.getStream(streamId).then(stream => {
          if (!stream) {
            log(`Stream ${streamId} not found`, 'websocket');
            socket.emit('error', { message: 'Stream not found' });
            socket.disconnect();
            return;
          }
          
          if (stream.streamKey !== streamKey) {
            log(`Invalid stream key for stream ${streamId}`, 'websocket');
            socket.emit('error', { message: 'Invalid stream key' });
            socket.disconnect();
            return;
          }
          
          log(`Broadcaster authenticated for stream ${streamId}`, 'websocket');
          
          // Mark the stream as live in the database
          storage.updateStream(streamId, { isLive: true });
          
          // Announce the stream is live to all clients in this stream's room
          streamIo.to(`stream:${streamId}`).emit('stream_status', {
            type: 'stream_status',
            streamId,
            isLive: true,
            viewerCount: streamIo.adapter.rooms.get(`stream:${streamId}`)?.size || 1
          });
        }).catch(error => {
          log(`Error authenticating stream: ${error}`, 'websocket');
          socket.emit('error', { message: 'Authentication error' });
          socket.disconnect();
        });
      }
      
      // Handle audio data from broadcaster
      socket.on('audio_data', (data) => {
        // Forward audio data to all listeners in this stream
        socket.to(`stream:${streamId}`).emit('audio_data', data);
      });
      
      // Handle audio level updates
      socket.on('audio_level', (data) => {
        // Forward audio level to all listeners
        socket.to(`stream:${streamId}`).emit('audio_level', data);
      });
      
      // Handle ping/heartbeat
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });
      
      // Handle disconnect
      socket.on('disconnect', () => {
        log(`Broadcaster disconnected from stream ${streamId}`, 'websocket');
        
        // Mark the stream as offline in the database
        storage.updateStream(streamId, { isLive: false }).catch(err => {
          log(`Error updating stream status: ${err}`, 'websocket');
        });
        
        // Notify all clients that the stream has ended
        streamIo.to(`stream:${streamId}`).emit('stream_status', {
          type: 'stream_status',
          streamId,
          isLive: false
        });
      });
    } else {
      // Handle listener connection
      log(`Listener connected to stream ${streamId}`, 'websocket');
      
      // Update viewer count for this stream
      const viewerCount = streamIo.adapter.rooms.get(`stream:${streamId}`)?.size || 1;
      storage.updateStreamViewerCount(streamId, viewerCount);
      
      // Notify all clients about the updated viewer count
      streamIo.to(`stream:${streamId}`).emit('viewer_count', {
        type: 'viewer_count',
        streamId,
        viewerCount
      });
      
      // Handle disconnect
      socket.on('disconnect', () => {
        log(`Listener disconnected from stream ${streamId}`, 'websocket');
        
        // Update viewer count
        const updatedViewerCount = streamIo.adapter.rooms.get(`stream:${streamId}`)?.size || 0;
        storage.updateStreamViewerCount(streamId, updatedViewerCount);
        
        // Notify all clients about the updated viewer count
        streamIo.to(`stream:${streamId}`).emit('viewer_count', {
          type: 'viewer_count',
          streamId,
          viewerCount: updatedViewerCount
        });
      });
    }
  });

  // Map to track audio streaming connections for each stream
  const audioStreamConnections = new Map<number, { broadcaster: WebSocket | null, listeners: Set<WebSocket> }>();

  // Create a WebSocket server for WebRTC signaling
  const webrtcWss = new WebSocketServer({ noServer: true });

  // Store active streams for WebRTC - make this global outside the connection handler
  const webrtcActiveStreams = new Map<string, { 
    hostId: string; 
    viewers: Set<string>;
    userId?: number;
    streamKey?: string;
  }>();
    
  // Set up the WebRTC WebSocket server
  webrtcWss.on('connection', (ws) => {
    console.log('New WebRTC signaling connection established');
    
    // Generate a unique ID for this connection
    const connectionId = uuidv4();
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('WebRTC message received:', data.type);
        
        switch (data.type) {
          case 'host-stream':
            const streamId = data.data.streamId;
            if (!webrtcActiveStreams.has(streamId)) {
              webrtcActiveStreams.set(streamId, { 
                hostId: connectionId, 
                viewers: new Set(),
                userId: undefined, // Will be populated when available
                streamKey: undefined // Will be populated when available
              });
            } else {
              const stream = webrtcActiveStreams.get(streamId)!;
              stream.hostId = connectionId;
            }
            console.log(`Host ${connectionId} started stream ${streamId}`);
            break;
            
          case 'join-stream':
            const joinStreamId = data.data.streamId;
            
            // Check in both maps for the stream
            const streamExistsInWebRTC = webrtcActiveStreams.has(joinStreamId);
            const streamExistsInLegacy = activeStreams.has(joinStreamId);
            
            if (streamExistsInWebRTC || streamExistsInLegacy) {
              // If stream exists in legacy map but not WebRTC map, copy it
              if (!streamExistsInWebRTC && streamExistsInLegacy) {
                console.log(`Copying stream ${joinStreamId} from legacy to WebRTC map`);
                webrtcActiveStreams.set(joinStreamId, { 
                  hostId: activeStreams.get(joinStreamId)!.hostId, 
                  viewers: new Set(),
                  userId: activeStreams.get(joinStreamId)!.userId,
                  streamKey: activeStreams.get(joinStreamId)!.streamKey
                });
              }
              
              // Get the stream from the WebRTC map
              const stream = webrtcActiveStreams.get(joinStreamId)!;
              stream.viewers.add(connectionId);
              
              // Notify host about new viewer
              webrtcWss.clients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({
                    type: 'viewer-joined',
                    data: { viewerId: connectionId }
                  }));
                }
              });
              
              // Update viewer count
              webrtcWss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({
                    type: 'viewer-count',
                    data: { count: stream.viewers.size }
                  }));
                }
              });
              
              console.log(`Viewer ${connectionId} joined stream ${joinStreamId}`);
            } else {
              console.log(`Stream not found: ${joinStreamId}`);
              ws.send(JSON.stringify({ 
                type: 'stream-not-found' 
              }));
            }
            break;
            
          case 'stream-offer':
            // Forward offer to specific viewer
            webrtcWss.clients.forEach(client => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'stream-offer',
                  data: {
                    hostId: connectionId,
                    description: data.data.description
                  }
                }));
              }
            });
            break;
            
          case 'stream-answer':
            // Forward answer to host
            webrtcWss.clients.forEach(client => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'stream-answer',
                  data: {
                    viewerId: connectionId,
                    description: data.data.description
                  }
                }));
              }
            });
            break;
            
          case 'ice-candidate':
            // Forward ICE candidate
            webrtcWss.clients.forEach(client => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'ice-candidate',
                  data: {
                    from: connectionId,
                    candidate: data.data.candidate
                  }
                }));
              }
            });
            break;
            
          case 'chat-message':
            // Broadcast chat message to all clients
            webrtcWss.clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'chat-message',
                  data: {
                    senderId: connectionId,
                    message: data.data.message,
                    timestamp: new Date().toISOString()
                  }
                }));
              }
            });
            break;
            
          case 'end-stream':
            // Host ending stream
            const endStreamId = data.data.streamId;
            if (webrtcActiveStreams.has(endStreamId)) {
              // Notify all viewers that the stream has ended
              webrtcWss.clients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({
                    type: 'stream-ended'
                  }));
                }
              });
              webrtcActiveStreams.delete(endStreamId);
              console.log(`Stream ${endStreamId} ended by host`);
            }
            break;
            
          case 'leave-stream':
            // Viewer leaving stream
            const leaveStreamId = data.data.streamId;
            if (webrtcActiveStreams.has(leaveStreamId)) {
              const stream = webrtcActiveStreams.get(leaveStreamId)!;
              stream.viewers.delete(connectionId);
              
              // Notify host that a viewer has left
              webrtcWss.clients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({
                    type: 'viewer-left',
                    data: { viewerId: connectionId }
                  }));
                }
              });
              
              // Update viewer count
              webrtcWss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({
                    type: 'viewer-count',
                    data: { count: stream.viewers.size }
                  }));
                }
              });
            }
            break;
            
          default:
            console.warn('Unknown message type:', data.type);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });
    
    // Handle disconnect
    ws.on('close', () => {
      console.log('WebRTC signaling connection closed:', connectionId);
      
      // Clean up any streams this connection was hosting
      for (const streamId of Array.from(webrtcActiveStreams.keys())) {
        const stream = webrtcActiveStreams.get(streamId)!;
        if (stream.hostId === connectionId) {
          // Host disconnected, end the stream
          webrtcWss.clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'stream-ended'
              }));
            }
          });
          webrtcActiveStreams.delete(streamId);
          console.log(`Stream ${streamId} ended because host disconnected`);
        } else if (stream.viewers.has(connectionId)) {
          // Viewer disconnected
          stream.viewers.delete(connectionId);
          
          // Notify host that a viewer has left
          webrtcWss.clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'viewer-left',
                data: { viewerId: connectionId }
              }));
            }
          });
          
          // Update viewer count
          webrtcWss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'viewer-count',
                data: { count: stream.viewers.size }
              }));
            }
          });
        }
      }
    });
  });

  // Handle HTTP->WebSocket upgrade for all WebSocket endpoints
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || "", `http://${request.headers.host}`).pathname;

    // Route to appropriate WebSocket server based on path
    if (pathname === '/ws/chat') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/audio') {
      audioStreamingWss.handleUpgrade(request, socket, head, (ws) => {
        audioStreamingWss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws') {
      // Handle the WebRTC signaling WebSocket
      webrtcWss.handleUpgrade(request, socket, head, (ws) => {
        webrtcWss.emit('connection', ws, request);
      });
    } else {
      // Unhandled WebSocket upgrade path
      socket.destroy();
    }
  });
  
  // Store active streams with their IDs for the WebRTC implementation
  const activeStreams = new Map<string, { 
    hostId: string; 
    viewers: Set<string>;
    userId?: number;
    streamKey?: string;
    hlsPlaylistUrl?: string;
  }>();
  
  // Store active HLS streams with their IDs
  const activeHLSStreams = new Map<string, { 
    userId: number;
    streamId: number;
    streamKey: string;
    hlsPlaylistUrl: string;
    viewers: number;
  }>();
  
  // Setup Socket.IO for WebRTC streams
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    
    // Host starting a stream
    socket.on("host-stream", ({ streamId, userId, streamKey }) => {
      if (!activeStreams.has(streamId)) {
        activeStreams.set(streamId, { 
          hostId: socket.id, 
          viewers: new Set(),
          userId: userId, 
          streamKey: streamKey
        });
      } else {
        const stream = activeStreams.get(streamId)!;
        stream.hostId = socket.id;
        if (userId) stream.userId = userId;
        if (streamKey) stream.streamKey = streamKey;
      }
      
      socket.join(streamId);
      console.log(`Host ${socket.id} started stream ${streamId}`);
    });
    
    // Viewer joining a stream
    socket.on("join-stream", ({ streamId }) => {
      if (activeStreams.has(streamId)) {
        socket.join(streamId);
        const stream = activeStreams.get(streamId)!;
        stream.viewers.add(socket.id);
        
        // Notify host about new viewer
        if (stream.hostId) {
          io.to(stream.hostId).emit("viewer-joined", { viewerId: socket.id });
        }
        
        // Update viewer count for everyone in the room
        io.to(streamId).emit("viewer-count", { count: stream.viewers.size });
        
        console.log(`Viewer ${socket.id} joined stream ${streamId}`);
      } else {
        socket.emit("stream-not-found");
      }
    });
    
    // Signaling for WebRTC
    socket.on("signal", ({ to, signal }) => {
      io.to(to).emit("signal", {
        from: socket.id,
        signal
      });
    });
    
    // Host sending stream offer to viewers
    socket.on("stream-offer", ({ streamId, description, viewerId }) => {
      io.to(viewerId).emit("stream-offer", {
        hostId: socket.id,
        description
      });
    });
    
    // Viewer sending answer to host
    socket.on("stream-answer", ({ hostId, description }) => {
      io.to(hostId).emit("stream-answer", {
        viewerId: socket.id,
        description
      });
    });
    
    // ICE candidate exchange
    socket.on("ice-candidate", ({ targetId, candidate }) => {
      io.to(targetId).emit("ice-candidate", {
        from: socket.id,
        candidate
      });
    });
    
    // Chat message
    socket.on("chat-message", ({ streamId, message }) => {
      io.to(streamId).emit("chat-message", {
        senderId: socket.id,
        message,
        timestamp: new Date().toISOString()
      });
    });
    
    // Disconnect handler
    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      
      // Check if the disconnected user was hosting any streams
      for (const streamId of Array.from(activeStreams.keys())) {
        const stream = activeStreams.get(streamId)!;
        if (stream.hostId === socket.id) {
          // Notify all viewers that the stream has ended
          io.to(streamId).emit("stream-ended");
          activeStreams.delete(streamId);
          console.log(`Stream ${streamId} ended because host disconnected`);
        } else if (stream.viewers.has(socket.id)) {
          // Remove viewer from the stream
          stream.viewers.delete(socket.id);
          
          // Notify host that a viewer has left
          if (stream.hostId) {
            io.to(stream.hostId).emit("viewer-left", { viewerId: socket.id });
          }
          
          // Update viewer count
          io.to(streamId).emit("viewer-count", { count: stream.viewers.size });
        }
      }
    });
  });

  // Add some basic API endpoints
  app.get("/api/streams", async (req, res) => {
    try {
      // Use the proper API based on what's available in storage
      // For now, we'll return an empty array if not implemented
      const streams = await Promise.resolve([]);
      res.json(streams);
    } catch (error) {
      console.error("Error fetching streams:", error);
      res.status(500).json({ message: "Failed to fetch streams" });
    }
  });
  
  // WebRTC Stream API endpoint for stream creation
  app.post("/api/streams/webrtc", async (req, res) => {
    try {
      // Require authentication for creating streams
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false, 
          message: "Authentication required to create a stream" 
        });
      }
      
      const userId = req.user?.id || req.body.userId;
      const userName = req.user?.username || req.body.userName || 'Anonymous';
      
      if (!userId) {
        return res.status(400).json({ 
          success: false, 
          message: "User ID is required" 
        });
      }
      
      // Generate a unique stream key for secure broadcasting
      const streamKey = generateStreamKey();
      
      // Generate a unique stream ID (separate from the stream key for security)
      const streamId = uuidv4();
      
      // Add to both stream maps to ensure compatibility
      webrtcActiveStreams.set(streamId, { 
        hostId: "", 
        viewers: new Set(),
        userId: userId,
        streamKey: streamKey
      });
      
      activeStreams.set(streamId, { 
        hostId: "", 
        viewers: new Set(),
        userId: userId,
        streamKey: streamKey
      });
      
      console.log(`Created new WebRTC stream with ID: ${streamId}`);
      
      // Always store the stream in the database for persistence
      try {
        const streamData = await storage.createStream({
          userId,
          title: req.body.title || `${userName}'s Stream`,
          description: req.body.description || `Live stream by ${userName}`,
          streamKey: streamKey,
          isLive: true, // Mark as live immediately
          category: req.body.category || "Music", // Default category
          tags: req.body.tags || ["live", "webrtc"]
        });
        
        console.log(`Saved stream ${streamId} to database with ID ${streamData.id}`);
        
        // Update user's streaming status
        await storage.updateUser(userId, { isStreaming: true });
        
        // Map the database ID to the streamId for later reference
        const streamIdMapping = new Map();
        streamIdMapping.set(streamId, streamData.id);
        
        // Create response with stream data
        const response = {
          success: true,
          streamId,
          dbStreamId: streamData.id,
          streamKey: streamKey, // Only sent to the creator
          shareUrl: `${req.protocol}://${req.get("host")}/stream/${streamId}`
        };
        
        // If createShareableUrl was requested, create a temporary shareable URL
        if (req.body.createShareableUrl) {
          console.log("Creating shareable URL for WebRTC stream", streamId);
          
          // We already have the share URL constructed above
          // You could add additional metadata or tracking here if needed
        }
        
        return res.json(response);
      } catch (dbError) {
        console.error("Failed to save stream to database:", dbError);
        
        // Clean up if database save fails
        webrtcActiveStreams.delete(streamId);
        activeStreams.delete(streamId);
        
        return res.status(500).json({ 
          success: false,
          message: "Failed to create stream in database", 
          error: (dbError as Error).message 
        });
      }
    } catch (error) {
      console.error("Error creating WebRTC stream:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to create stream", 
        error: (error as Error).message 
      });
    }
  });
  
  // WebRTC Stream API endpoint to check if a stream exists
  app.get("/api/streams/webrtc/:streamId", async (req, res) => {
    const { streamId } = req.params;
    
    try {
      // First check in-memory streams for active ones
      const inMemoryExists = activeStreams.has(streamId) || webrtcActiveStreams.has(streamId);
      
      if (inMemoryExists) {
        // Prioritize webrtcActiveStreams since that's used by the WebRTC implementation
        const stream = webrtcActiveStreams.has(streamId) 
          ? webrtcActiveStreams.get(streamId)! 
          : activeStreams.get(streamId)!;
        
        return res.json({
          success: true,
          streamId,
          viewerCount: stream.viewers.size,
          isLive: true
        });
      } 
      
      // If not found in memory, try to find in database by stream key
      // This is a fallback for streams that might have disconnected but are still valid
      const dbStreams = await storage.getFeaturedStreams();
      const dbStreamByKey = dbStreams.find(s => s.streamKey === streamId && s.isLive);
      
      if (dbStreamByKey) {
        console.log(`Stream ${streamId} found in database but not in memory`);
        
        // Recreate in-memory stream from database entry
        webrtcActiveStreams.set(streamId, { 
          hostId: "", 
          viewers: new Set(),
          userId: dbStreamByKey.userId,
          streamKey: dbStreamByKey.streamKey || streamId
        });
        
        return res.json({
          success: true,
          streamId,
          dbStreamId: dbStreamByKey.id,
          viewerCount: 0, // No viewers yet since we just restored it
          isLive: true
        });
      }
      
      // Stream not found in memory or database
      return res.status(404).json({
        success: false,
        message: "Stream not found"
      });
    } catch (error) {
      console.error("Error checking stream:", error);
      return res.status(500).json({
        success: false,
        message: "Error checking stream status"
      });
    }
  });

  // Get featured streams
  app.get("/api/streams/featured", async (req, res) => {
    try {
      const featuredStreams = await storage.getFeaturedStreams();
      res.json(featuredStreams);
    } catch (error) {
      console.error("Error fetching featured streams:", error);
      res.status(500).json({ message: "Failed to fetch featured streams" });
    }
  });
  
  // Get streams by user
  app.get("/api/streams/user/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const userStreams = await storage.getStreamsByUser(userId);
      res.json(userStreams);
    } catch (error) {
      console.error("Error fetching user streams:", error);
      res.status(500).json({ message: "Failed to fetch user streams" });
    }
  });

  app.get("/api/streams/:id", async (req, res) => {
    const streamId = parseInt(req.params.id);
    if (isNaN(streamId)) {
      return res.status(400).json({ success: false, message: "Invalid stream ID" });
    }

    try {
      // First check in-memory streams for active ones
      const inMemoryExists = activeStreams.has(streamId.toString()) || webrtcActiveStreams.has(streamId.toString());
      
      // Get stream from database
      const dbStream = await storage.getStream(streamId);
      
      if (!dbStream && !inMemoryExists) {
        return res.status(404).json({ success: false, message: "Stream not found" });
      }
      
      // If stream exists in memory and/or database, return details
      const streamData = dbStream || {};
      const isActive = inMemoryExists;
      
      // Check for visual element
      let visualElementInfo = {};
      if (dbStream && dbStream.visualElementUrl) {
        visualElementInfo = {
          hasVisualElement: true,
          visualElementUrl: dbStream.visualElementUrl,
          visualElementType: dbStream.visualElementType || 'image'
        };
      }
      
      res.json({ 
        success: true, 
        stream: {
          ...streamData,
          streamType: dbStream?.streamType || 'video',
          isActive,
          ...visualElementInfo,
          protocol: webrtcActiveStreams.has(streamId.toString()) ? 'webrtc' : 
                   activeStreams.has(streamId.toString()) ? 'hls' : 
                   (dbStream as any)?.protocol || 'webrtc'
        }
      });
    } catch (error) {
      console.error("Error fetching stream details:", error);
      res.status(500).json({ success: false, message: "Failed to fetch stream details" });
    }
  });

  app.post("/api/streams", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Validate request body
    const streamSchema = insertStreamSchema.extend({
      title: z.string().min(3).max(100),
      description: z.string().max(2000).optional(),
      streamType: z.enum(["video", "audio"]).default("video"),
      useCamera: z.boolean().default(true),
      useMicrophone: z.boolean().default(true),
      useSystemAudio: z.boolean().default(false),
      hasVisualElement: z.boolean().default(false)
    });

    try {
      const validatedData = streamSchema.parse(req.body);
      
      // Generate a secure stream key
      const streamKey = generateStreamKey();
      
      // Create stream with the current user
      const newStream = await storage.createStream({
        ...validatedData,
        userId: req.user.id,
        streamKey
        // Other properties like isLive and viewerCount are handled by the storage implementation
      });
      
      // Return the stream with the key (only shown once)
      res.status(201).json({
        ...newStream,
        streamKey
      });
    } catch (error) {
      console.error("Error creating stream:", error);
      res.status(400).json({ message: "Invalid stream data", error });
    }
  });

  // Get all tracks
  app.get("/api/tracks", async (req, res) => {
    try {
      // Use the getRecentTracks method which returns all tracks sorted by most recent
      const tracks = await storage.getRecentTracks();
      res.json(tracks);
    } catch (error) {
      console.error("Error fetching tracks:", error);
      res.status(500).json({ message: "Failed to fetch tracks" });
    }
  });

  // Get recent tracks
  app.get("/api/tracks/recent", async (req, res) => {
    try {
      const recentTracks = await storage.getRecentTracks();
      res.json(recentTracks);
    } catch (error) {
      console.error("Error fetching recent tracks:", error);
      res.status(500).json({ message: "Failed to fetch recent tracks" });
    }
  });

  // Get tracks by user
  app.get("/api/tracks/user/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const userTracks = await storage.getTracksByUser(userId);
      res.json(userTracks);
    } catch (error) {
      console.error("Error fetching user tracks:", error);
      res.status(500).json({ message: "Failed to fetch user tracks" });
    }
  });

  // Get a specific track
  app.get("/api/tracks/:id", async (req, res) => {
    try {
      const trackId = parseInt(req.params.id);
      if (isNaN(trackId)) {
        return res.status(400).json({ message: "Invalid track ID" });
      }
      
      const track = await storage.getTrack(trackId);
      if (!track) {
        return res.status(404).json({ message: "Track not found" });
      }
      
      res.json(track);
    } catch (error) {
      console.error("Error fetching track:", error);
      res.status(500).json({ message: "Failed to fetch track" });
    }
  });

  // Get recommended creators
  app.get("/api/creators/recommended", async (req, res) => {
    try {
      const recommendedCreators = await storage.getRecommendedCreators();
      res.json(recommendedCreators);
    } catch (error) {
      console.error("Error fetching recommended creators:", error);
      res.status(500).json({ message: "Failed to fetch recommended creators" });
    }
  });

  // Get user by ID
  app.get("/api/users/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Don't send back sensitive information like password
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
  
  // Get user by username
  app.get("/api/users/by-username/:username", async (req, res) => {
    try {
      const username = req.params.username;
      if (!username) {
        return res.status(400).json({ message: "Username is required" });
      }
      
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Don't send back sensitive information like password
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Error fetching user by username:", error);
      res.status(500).json({ message: "Failed to fetch user by username" });
    }
  });

  // Get user settings
  app.get("/api/user-settings/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const settings = await storage.getUserSettings(userId);
      if (!settings) {
        // Create default settings if none exist
        const defaultSettings = await storage.createUserSettings({
          userId,
          uiColor: "#8B5CF6",
          enableAutoplay: true,
          defaultSortType: "recent",
          highContrastMode: false
        });
        return res.json(defaultSettings);
      }
      
      res.json(settings);
    } catch (error) {
      console.error("Error fetching user settings:", error);
      res.status(500).json({ message: "Failed to fetch user settings" });
    }
  });
  
  // Update user settings
  app.patch("/api/user-settings/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      // Get the settings from the request body
      const { uiColor, enableAutoplay, defaultSortType, highContrastMode } = req.body;
      
      // Update the settings in the database
      const updatedSettings = await storage.updateUserSettings(userId, {
        uiColor,
        enableAutoplay,
        defaultSortType,
        highContrastMode
      });
      
      console.log("Updated user settings:", updatedSettings);
      res.json(updatedSettings);
    } catch (error) {
      console.error("Error updating user settings:", error);
      res.status(500).json({ message: "Failed to update user settings" });
    }
  });

  // Get all posts
  app.get("/api/posts", async (req, res) => {
    try {
      // Use the getRecentPosts method which returns all posts sorted by most recent
      const posts = await storage.getRecentPosts();
      res.json(posts);
    } catch (error) {
      console.error("Error fetching posts:", error);
      res.status(500).json({ message: "Failed to fetch posts" });
    }
  });

  // Get posts by user
  app.get("/api/posts/user/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const userPosts = await storage.getPostsByUser(userId);
      res.json(userPosts);
    } catch (error) {
      console.error("Error fetching user posts:", error);
      res.status(500).json({ message: "Failed to fetch user posts" });
    }
  });

  // Check if user has liked content
  app.get("/api/likes/check", async (req, res) => {
    try {
      const userId = parseInt(req.query.userId as string);
      const contentId = parseInt(req.query.contentId as string);
      const contentType = req.query.contentType as string;
      
      if (isNaN(userId) || isNaN(contentId) || !contentType) {
        return res.status(400).json({ message: "Invalid parameters" });
      }
      
      const isLiked = await storage.isLiked(userId, contentId, contentType);
      res.json({ isLiked });
    } catch (error) {
      console.error("Error checking like status:", error);
      res.status(500).json({ message: "Failed to check like status" });
    }
  });
  
  // Get like count for content
  app.get("/api/likes/count/:contentType/:contentId", async (req, res) => {
    try {
      const contentId = parseInt(req.params.contentId);
      const contentType = req.params.contentType;
      
      if (isNaN(contentId) || !contentType) {
        return res.status(400).json({ message: "Invalid parameters" });
      }
      
      const likeCount = await storage.getLikeCount(contentId, contentType);
      res.json({ likeCount });
    } catch (error) {
      console.error("Error fetching like count:", error);
      res.status(500).json({ message: "Failed to fetch like count" });
    }
  });
  
  // Create like
  app.post("/api/likes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    try {
      const likeData = {
        userId: req.user.id,
        contentId: req.body.contentId,
        contentType: req.body.contentType
      };
      
      const like = await storage.createLike(likeData);
      res.status(201).json(like);
    } catch (error) {
      console.error("Error creating like:", error);
      res.status(500).json({ message: "Failed to create like" });
    }
  });
  
  // Remove like
  app.delete("/api/likes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    try {
      const userId = req.user.id;
      const contentId = parseInt(req.query.contentId as string);
      const contentType = req.query.contentType as string;
      
      if (isNaN(contentId) || !contentType) {
        return res.status(400).json({ message: "Invalid parameters" });
      }
      
      await storage.removeLike(userId, contentId, contentType);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing like:", error);
      res.status(500).json({ message: "Failed to remove like" });
    }
  });
  
  // End a stream
  app.post("/api/streams/:id/end", async (req, res) => {
    try {
      const streamId = parseInt(req.params.id);
      if (isNaN(streamId)) {
        return res.status(400).json({ message: "Invalid stream ID" });
      }
      
      // Get the stream
      const stream = await storage.getStream(streamId);
      if (!stream) {
        return res.status(404).json({ message: "Stream not found" });
      }
      
      // Check authorization (only stream owner can end it)
      if (req.isAuthenticated() && req.user.id !== stream.userId) {
        return res.status(403).json({ message: "Not authorized to end this stream" });
      }
      
      // Mark the stream as not live and set the end time
      const updatedStream = await storage.updateStream(streamId, { 
        isLive: false,
        endedAt: new Date()
      });
      
      res.json(updatedStream);
    } catch (error) {
      console.error("Error ending stream:", error);
      res.status(500).json({ message: "Failed to end stream" });
    }
  });
  
  // Delete a stream
  app.delete("/api/streams/:id", async (req, res) => {
    try {
      const streamId = parseInt(req.params.id);
      if (isNaN(streamId)) {
        return res.status(400).json({ message: "Invalid stream ID" });
      }
      
      // Get the stream
      const stream = await storage.getStream(streamId);
      if (!stream) {
        return res.status(404).json({ message: "Stream not found" });
      }
      
      // Check authorization (only stream owner can delete it)
      if (req.isAuthenticated() && req.user.id !== stream.userId) {
        return res.status(403).json({ message: "Not authorized to delete this stream" });
      }
      
      // Delete the stream
      await storage.deleteStream(streamId);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting stream:", error);
      res.status(500).json({ message: "Failed to delete stream" });
    }
  });
  
  // Delete track endpoint
  app.delete("/api/tracks/:id", async (req, res) => {
    try {
      const trackId = parseInt(req.params.id);
      if (isNaN(trackId)) {
        return res.status(400).json({ message: "Invalid track ID" });
      }
      
      // Get the track
      const track = await storage.getTrack(trackId);
      if (!track) {
        return res.status(404).json({ message: "Track not found" });
      }
      
      // Check authorization (only track owner can delete it)
      if (req.isAuthenticated() && req.user.id !== track.userId) {
        return res.status(403).json({ message: "Not authorized to delete this track" });
      }
      
      // Delete the track
      const success = await storage.deleteTrack(trackId);
      
      if (success) {
        res.json({ success: true });
      } else {
        res.status(500).json({ message: "Failed to delete track" });
      }
    } catch (error) {
      console.error("Error deleting track:", error);
      res.status(500).json({ message: "Failed to delete track" });
    }
  });
  
  // Delete post endpoint
  app.delete("/api/posts/:id", async (req, res) => {
    try {
      const postId = parseInt(req.params.id);
      if (isNaN(postId)) {
        return res.status(400).json({ message: "Invalid post ID" });
      }
      
      // Get the post
      const post = await storage.getPost(postId);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      
      // Check authorization (only post owner can delete it)
      if (req.isAuthenticated() && req.user.id !== post.userId) {
        return res.status(403).json({ message: "Not authorized to delete this post" });
      }
      
      // Delete the post
      const success = await storage.deletePost(postId);
      
      if (success) {
        res.json({ success: true });
      } else {
        res.status(500).json({ message: "Failed to delete post" });
      }
    } catch (error) {
      console.error("Error deleting post:", error);
      res.status(500).json({ message: "Failed to delete post" });
    }
  });

  // HLS Streaming Routes
  
  // Route to serve the master playlist (index.m3u8)
  app.get("/hls/:streamId/master.m3u8", handleMasterPlaylist);
  
  // Route to serve the media playlist (playlist.m3u8)
  app.get("/hls/:streamId/playlist.m3u8", handleMediaPlaylist);
  
  // Route to serve individual segments
  app.get("/hls/:streamId/:segment", handleSegment);
  
  // Route to upload HLS segments (for direct uploads from broadcaster)
  app.post("/api/streams/:streamId/segment", memoryUpload.single('segment'), uploadSegment);
  
  // Handle visual element upload for audio streams
  const visualStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadsDir = path.join(process.cwd(), 'uploads/visual-elements');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, `visual-${uniqueSuffix}${ext}`);
    }
  });
  
  const visualUpload = multer({ 
    storage: visualStorage,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
      // Accept only images and videos
      if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
        cb(null, true);
      } else {
        cb(new Error('Only images and videos are allowed'));
      }
    }
  });
  
  app.post("/api/streams/:id/visual-element", visualUpload.single('visualElement'), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const streamId = parseInt(req.params.id);
    
    try {
      // Check if stream exists and belongs to the user
      const stream = await storage.getStream(streamId);
      
      if (!stream) {
        return res.status(404).json({ message: "Stream not found" });
      }
      
      if (stream.userId !== req.user.id) {
        return res.status(403).json({ message: "You don't have permission to modify this stream" });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      // Get file info
      const file = req.file;
      const visualElementType = file.mimetype.startsWith('image/') ? 'image' : 'video';
      
      // Create URL path for the file
      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
      const visualElementUrl = `${baseUrl}/uploads/visual-elements/${file.filename}`;
      
      // Update stream with visual element information
      const updatedStream = await storage.updateStream(streamId, {
        hasVisualElement: true,
        visualElementType,
        visualElementUrl
      });
      
      res.status(200).json({
        message: "Visual element uploaded successfully",
        stream: updatedStream
      });
    } catch (error) {
      console.error("Error uploading visual element:", error);
      res.status(500).json({ message: "Failed to upload visual element" });
    }
  });
  
  // Route to initialize HLS stream
  app.post("/api/streams/:streamId/hls", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    try {
      const streamId = parseInt(req.params.streamId);
      if (isNaN(streamId)) {
        return res.status(400).json({ message: "Invalid stream ID" });
      }
      
      // Get the stream
      const stream = await storage.getStream(streamId);
      if (!stream) {
        return res.status(404).json({ message: "Stream not found" });
      }
      
      // Check authorization (only stream owner can initialize HLS)
      if (req.user.id !== stream.userId) {
        return res.status(403).json({ message: "Not authorized to initialize this stream" });
      }
      
      // Initialize HLS playlist without segment
      const playlistUrl = await createOrUpdateHLSPlaylist(streamId, req.user.id);
      
      // Define segment URLs and paths
      const segmentUrl = `/api/streams/${streamId}/segment`;
      const hlsFolderPath = path.join(process.cwd(), 'uploads', 'hls', streamId.toString());
      
      // Update stream with HLS URL and other HLS info
      await storage.updateStream(streamId, {
        isLive: true,
        hlsPlaylistUrl: playlistUrl,
        hlsSegmentUrl: segmentUrl,
        hlsFolderPath: hlsFolderPath
      });
      
      res.json({
        success: true,
        streamId,
        hlsPlaylistUrl: playlistUrl,
        hlsSegmentUrl: segmentUrl
      });
    } catch (error) {
      console.error("Error initializing HLS stream:", error);
      res.status(500).json({ message: "Failed to initialize HLS stream" });
    }
  });
  
  // Route to end HLS stream and finalize recording
  app.post("/api/streams/:streamId/hls/end", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    try {
      const streamId = parseInt(req.params.streamId);
      if (isNaN(streamId)) {
        return res.status(400).json({ message: "Invalid stream ID" });
      }
      
      // End the HLS stream with our enhanced functionality
      const endResult = await endHLSStream(streamId, req.user.id);
      
      // Update stream in database
      await storage.updateStream(streamId, {
        isLive: false,
        endedAt: new Date()
      });
      
      // Return result with potential save prompt
      res.json(endResult);
    } catch (error) {
      console.error("Error ending HLS stream:", error);
      res.status(500).json({ message: "Failed to end HLS stream" });
    }
  });
  
  // Route to finalize a stream recording (save or delete)
  app.post("/api/streams/:streamId/recording/finalize", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    try {
      const streamId = parseInt(req.params.streamId);
      if (isNaN(streamId)) {
        return res.status(400).json({ message: "Invalid stream ID" });
      }
      
      const { savePermanently } = req.body;
      
      if (typeof savePermanently !== 'boolean') {
        return res.status(400).json({ message: "Missing or invalid 'savePermanently' parameter" });
      }
      
      // Finalize the recording (save or delete)
      const result = await finalizeStreamRecording(streamId, req.user.id, savePermanently);
      
      res.json(result);
    } catch (error) {
      console.error("Error finalizing stream recording:", error);
      res.status(500).json({ message: "Failed to finalize recording" });
    }
  });
  
  // HLS version of the webrtc stream creation endpoint
  app.post("/api/streams/hls", async (req, res) => {
    try {
      // Require authentication for creating streams
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false, 
          message: "Authentication required to create a stream" 
        });
      }
      
      const userId = req.user.id;
      const userName = req.user.username || 'Anonymous';
      
      // Generate a unique stream key for secure broadcasting
      const streamKey = generateStreamKey();
      
      // Create stream with the current user
      const streamData = await storage.createStream({
        userId,
        title: req.body.title || `${userName}'s Stream`,
        description: req.body.description || `Live stream by ${userName}`,
        streamKey,
        isLive: true, // Mark as live immediately
        category: req.body.category || "Music", // Default category
        tags: req.body.tags || ["live", "hls"]
      });
      
      // Initialize HLS playlist
      const playlistUrl = await createOrUpdateHLSPlaylist(streamData.id, userId);
      
      // Define segment URLs and paths
      const segmentUrl = `/api/streams/${streamData.id}/segment`;
      const hlsFolderPath = path.join(process.cwd(), 'uploads', 'hls', streamData.id.toString());
      
      // Update stream with HLS URL and other HLS info
      await storage.updateStream(streamData.id, {
        hlsPlaylistUrl: playlistUrl,
        hlsSegmentUrl: segmentUrl,
        hlsFolderPath: hlsFolderPath
      });
      
      // Update user's streaming status
      await storage.updateUser(userId, { isStreaming: true });
      
      // Create a response with the stream data
      const response = {
        success: true,
        streamId: streamData.id,
        streamKey, // Only sent to the creator
        hlsPlaylistUrl: playlistUrl,
        hlsSegmentUrl: segmentUrl,
        shareUrl: `${req.protocol}://${req.get("host")}/stream/${streamData.id}`
      };
      
      // If createShareableUrl was requested, create a temporary shareable URL
      if (req.body.createShareableUrl) {
        console.log("Creating shareable URL for stream", streamData.id);
        
        // We already have the share URL constructed above
        // You could add additional metadata or tracking here if needed
      }
      
      return res.status(201).json(response);
    } catch (error) {
      console.error("Error creating HLS stream:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to create stream", 
        error: (error as Error).message 
      });
    }
  });

  return server;
}