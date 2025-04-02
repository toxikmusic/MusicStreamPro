/**
 * Object Storage Service for Stream Content
 * 
 * Handles temporary and permanent storage of stream content in cloud object storage
 */

import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { Stream } from '@shared/schema';

// Default expiration time for temporary streams (24 hours)
const TEMP_EXPIRATION_HOURS = 24;

// Interface for stream recordings
interface StreamRecording {
  streamId: number;
  userId: number;
  segments: string[];
  playlistUrl: string;
  thumbnailUrl?: string;
  createdAt: Date;
  expiresAt?: Date; // For temporary recordings
  size: number; // Total size in bytes
  duration: number; // Duration in seconds
  isTemporary: boolean;
}

/**
 * Service to handle object storage operations for stream content
 * This class provides a unified interface for different storage backends
 */
class ObjectStorageService {
  private recordings: Map<number, StreamRecording>;
  private localStorageDir: string;
  private bucketName: string;
  private isConfigured: boolean;

  constructor() {
    this.recordings = new Map<number, StreamRecording>();
    this.localStorageDir = path.join(process.cwd(), 'uploads', 'stream-recordings');
    this.bucketName = process.env.OBJECT_STORAGE_BUCKET || '';
    this.isConfigured = !!process.env.OBJECT_STORAGE_BUCKET;
    
    // Create local storage directory if it doesn't exist
    if (!fs.existsSync(this.localStorageDir)) {
      fs.mkdirSync(this.localStorageDir, { recursive: true });
    }
    
    console.log(`Object Storage Service initialized. Using ${this.isConfigured ? 'cloud object storage' : 'local storage'}.`);
    if (this.isConfigured) {
      console.log(`Bucket: ${this.bucketName}`);
    } else {
      console.log(`Local storage directory: ${this.localStorageDir}`);
    }
  }

  /**
   * Store a stream segment (temporarily)
   * @param streamId The stream ID
   * @param userId The user ID
   * @param segmentData The segment data (buffer)
   * @param segmentIndex The segment index or name
   * @returns The URL to access the segment
   */
  async storeSegment(
    streamId: number,
    userId: number, 
    segmentData: Buffer, 
    segmentIndex: number | string
  ): Promise<string> {
    const segmentFilename = `segment-${segmentIndex}.ts`;
    const streamDir = path.join(this.localStorageDir, `stream-${streamId}`);
    
    // Create stream directory if it doesn't exist
    if (!fs.existsSync(streamDir)) {
      fs.mkdirSync(streamDir, { recursive: true });
    }
    
    // Store the segment locally first (we always do this for immediate access)
    const segmentPath = path.join(streamDir, segmentFilename);
    fs.writeFileSync(segmentPath, segmentData);
    
    // Get or create recording entry
    let recording = this.recordings.get(streamId);
    if (!recording) {
      recording = {
        streamId,
        userId,
        segments: [],
        playlistUrl: `/stream-recordings/stream-${streamId}/playlist.m3u8`,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + TEMP_EXPIRATION_HOURS * 60 * 60 * 1000),
        size: 0,
        duration: 0,
        isTemporary: true
      };
      this.recordings.set(streamId, recording);
    }
    
    // Add segment to recording
    recording.segments.push(segmentFilename);
    recording.size += segmentData.length;
    recording.duration = Math.max(recording.duration, (segmentIndex as number) * 6); // Assuming 6s segments
    
    // If configured for cloud storage, upload to object storage bucket
    if (this.isConfigured) {
      try {
        // This would use an SDK for your cloud provider
        // For example, AWS S3, Google Cloud Storage, etc.
        // await this.uploadToBucket(segmentPath, `stream-${streamId}/${segmentFilename}`);
        console.log(`[ObjectStorage] Would upload ${segmentFilename} to cloud storage`);
      } catch (error) {
        console.error('Error uploading to object storage:', error);
        // Fall back to local storage if upload fails
      }
    }
    
    // Return the URL to access the segment (this would be a cloud URL if available)
    return `/stream-recordings/stream-${streamId}/${segmentFilename}`;
  }

  /**
   * Create or update a playlist file for a stream
   * @param streamId The stream ID
   * @param segments List of segment filenames
   * @returns The URL to access the playlist
   */
  async updatePlaylist(streamId: number, segments: string[]): Promise<string> {
    const streamDir = path.join(this.localStorageDir, `stream-${streamId}`);
    const playlistPath = path.join(streamDir, 'playlist.m3u8');
    
    // Create basic M3U8 playlist
    let playlistContent = '#EXTM3U\n';
    playlistContent += '#EXT-X-VERSION:3\n';
    playlistContent += '#EXT-X-TARGETDURATION:6\n'; // Assuming 6-second segments
    playlistContent += `#EXT-X-MEDIA-SEQUENCE:${segments.length > 10 ? segments.length - 10 : 0}\n`;
    
    // Add segments (last 10 for live streaming)
    const recentSegments = segments.slice(-10);
    for (const segment of recentSegments) {
      playlistContent += '#EXTINF:6.0,\n'; // Duration
      playlistContent += segment + '\n';
    }
    
    // Write playlist to file
    fs.writeFileSync(playlistPath, playlistContent);
    
    // If configured for cloud storage, upload playlist to bucket
    if (this.isConfigured) {
      try {
        // await this.uploadToBucket(playlistPath, `stream-${streamId}/playlist.m3u8`);
        console.log(`[ObjectStorage] Would upload playlist.m3u8 to cloud storage`);
      } catch (error) {
        console.error('Error uploading playlist to object storage:', error);
      }
    }
    
    // Return the URL to access the playlist
    return `/stream-recordings/stream-${streamId}/playlist.m3u8`;
  }

  /**
   * Ask the user if they want to save or delete a stream recording
   * @param streamId The stream ID to finalize
   * @param permanent Whether to make the recording permanent (true) or delete it (false)
   */
  async finalizeRecording(streamId: number, permanent: boolean): Promise<boolean> {
    const recording = this.recordings.get(streamId);
    if (!recording) {
      return false;
    }

    if (permanent) {
      // Make the recording permanent
      recording.isTemporary = false;
      recording.expiresAt = undefined;
      
      // Update the recording in the map
      this.recordings.set(streamId, recording);
      
      console.log(`[ObjectStorage] Stream ${streamId} saved permanently`);
      
      // Store the recording metadata in a database or storage
      // In a real implementation, you would persist this data
      
      return true;
    } else {
      // Delete the temporary recording
      const streamDir = path.join(this.localStorageDir, `stream-${streamId}`);
      
      // Remove from cloud storage if configured
      if (this.isConfigured) {
        try {
          // Implement deletion from cloud storage
          console.log(`[ObjectStorage] Would delete stream ${streamId} from cloud storage`);
        } catch (error) {
          console.error('Error deleting from object storage:', error);
        }
      }
      
      // Delete local files
      try {
        if (fs.existsSync(streamDir)) {
          // Delete recursively
          fs.rmSync(streamDir, { recursive: true, force: true });
        }
      } catch (error) {
        console.error('Error deleting local recording:', error);
      }
      
      // Remove from our recordings map
      this.recordings.delete(streamId);
      
      console.log(`[ObjectStorage] Stream ${streamId} deleted`);
      return true;
    }
  }

  /**
   * Get details about a stream recording
   * @param streamId The stream ID
   */
  getRecordingDetails(streamId: number): StreamRecording | null {
    return this.recordings.get(streamId) || null;
  }

  /**
   * Serve static content from the object storage
   * This is a middleware function to serve stream recordings
   */
  serveContent(req: Request, res: Response, next: () => void) {
    const urlPath = req.path;
    
    // Check if the request is for a stream recording
    if (urlPath.startsWith('/stream-recordings/')) {
      // Extract stream ID and file name from path
      const match = urlPath.match(/\/stream-recordings\/stream-(\d+)\/(.+)/);
      if (!match) {
        return res.status(404).send('Not found');
      }
      
      const streamId = parseInt(match[1]);
      const fileName = match[2];
      
      // Check if we have this recording
      const recording = this.recordings.get(streamId);
      if (!recording) {
        return res.status(404).send('Stream recording not found');
      }
      
      // If file is expired and temporary, reject
      if (recording.isTemporary && recording.expiresAt && recording.expiresAt < new Date()) {
        return res.status(410).send('Stream recording has expired');
      }
      
      // Determine file path
      const filePath = path.join(this.localStorageDir, `stream-${streamId}`, fileName);
      
      // Check if file exists locally
      if (fs.existsSync(filePath)) {
        // Set appropriate content type
        if (fileName.endsWith('.m3u8')) {
          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        } else if (fileName.endsWith('.ts')) {
          res.setHeader('Content-Type', 'video/mp2t');
        }
        
        // Stream the file
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
      } else if (this.isConfigured) {
        // If not found locally but we have cloud storage, redirect to cloud URL
        // In a real implementation, generate a signed URL or proxy the content
        
        // For now, just return a 404
        return res.status(404).send('File not found');
      } else {
        return res.status(404).send('File not found');
      }
    } else {
      // Not a stream recording request, continue to next middleware
      next();
    }
  }

  /**
   * Clean up expired temporary recordings
   * Call this periodically to free up storage space
   */
  cleanupExpiredRecordings(): number {
    const now = new Date();
    let cleanedCount = 0;
    
    // Find expired recordings
    for (const [streamId, recording] of this.recordings.entries()) {
      if (recording.isTemporary && recording.expiresAt && recording.expiresAt < now) {
        // Delete the recording
        this.finalizeRecording(streamId, false);
        cleanedCount++;
      }
    }
    
    return cleanedCount;
  }
}

// Create singleton instance
export const objectStorage = new ObjectStorageService();