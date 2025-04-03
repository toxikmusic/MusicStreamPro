import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { Server as SocketIOServer } from "socket.io";
import { v4 as uuidv4 } from "uuid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store active streams with their IDs
const activeStreams = new Map<string, { hostId: string; viewers: Set<string> }>();

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint for deployment
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });
  
  // Serve static files from a samples directory (if available)
  const samplesDir = path.join(__dirname, "..", "samples");
  if (fs.existsSync(samplesDir)) {
    app.use("/samples", express.static(samplesDir));
  }

  // API route to check if a media URL is reachable
  app.get("/api/check-media", async (req, res) => {
    const url = req.query.url as string;
    
    if (!url) {
      return res.status(400).json({ success: false, message: "URL is required" });
    }
    
    try {
      const response = await fetch(url, { method: "HEAD" });
      
      if (response.ok) {
        const contentType = response.headers.get("content-type") || "";
        const isAudio = contentType.includes("audio");
        const isVideo = contentType.includes("video");
        
        return res.json({
          success: true,
          contentType,
          isAudio,
          isVideo,
        });
      } else {
        return res.status(404).json({
          success: false,
          message: "Media not found or not accessible",
        });
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to check media URL",
        error: (error as Error).message,
      });
    }
  });

  // API route to create a new stream
  app.post("/api/streams", (req, res) => {
    const streamId = uuidv4();
    activeStreams.set(streamId, { hostId: "", viewers: new Set() });
    
    return res.json({
      success: true,
      streamId,
      shareUrl: `${req.protocol}://${req.get("host")}/stream/${streamId}`
    });
  });

  // API route to check if a stream exists
  app.get("/api/streams/:streamId", (req, res) => {
    const { streamId } = req.params;
    const streamExists = activeStreams.has(streamId);
    
    if (streamExists) {
      const stream = activeStreams.get(streamId)!;
      return res.json({
        success: true,
        streamId,
        viewerCount: stream.viewers.size
      });
    } else {
      return res.status(404).json({
        success: false,
        message: "Stream not found"
      });
    }
  });

  const httpServer = createServer(app);
  
  // Set up Socket.IO server
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // WebSocket handling for real-time streaming
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    
    // Host starting a stream
    socket.on("host-stream", ({ streamId }) => {
      if (!activeStreams.has(streamId)) {
        activeStreams.set(streamId, { hostId: socket.id, viewers: new Set() });
      } else {
        const stream = activeStreams.get(streamId)!;
        stream.hostId = socket.id;
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
    socket.on("stream-offer", ({ streamId, description }) => {
      socket.to(streamId).emit("stream-offer", {
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
      for (const [streamId, stream] of activeStreams.entries()) {
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

  return httpServer;
}
