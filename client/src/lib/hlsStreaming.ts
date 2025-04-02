import { createHLSStream, initializeHLSStream, endHLSStream, uploadHLSSegment } from './api';
import type { User } from "@shared/schema";

interface HLSStreamingOptions {
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  createShareableUrl?: boolean;  // Whether to create a shareable URL
  onStreamCreated?: (streamData: any) => void;
  onSegmentUploaded?: (response: any) => void;
  onStreamEnded?: (response: any) => void;
  onError?: (error: Error) => void;
}

interface HLSStream {
  streamId: number;
  streamKey: string;
  hlsPlaylistUrl: string;
  hlsSegmentUrl: string;
  shareUrl: string;
}

export class HLSStreamingSession {
  private streamData: HLSStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private streamActive = false;
  private segmentInterval: number | null = null;
  private options: HLSStreamingOptions;
  private recordedChunks: Blob[] = [];
  private segmentDuration = 3000; // Default segment duration in ms
  
  constructor(options: HLSStreamingOptions = {}) {
    this.options = options;
  }
  
  /**
   * Start a new HLS streaming session
   * @param mediaStream The MediaStream object from getUserMedia
   */
  async startStream(mediaStream: MediaStream): Promise<HLSStream> {
    try {
      console.log("HLS: Starting stream with options:", this.options);
      
      // Create stream in the backend
      const streamResponse = await createHLSStream({
        title: this.options.title,
        description: this.options.description,
        category: this.options.category || "Music",
        tags: this.options.tags || ["live", "hls"],
        createShareableUrl: this.options.createShareableUrl
      });
      
      console.log("HLS: Stream created:", streamResponse);
      
      this.streamData = {
        streamId: streamResponse.streamId,
        streamKey: streamResponse.streamKey,
        hlsPlaylistUrl: streamResponse.hlsPlaylistUrl,
        hlsSegmentUrl: streamResponse.hlsSegmentUrl,
        shareUrl: streamResponse.shareUrl
      };
      
      // Start recording the stream
      this.startRecording(mediaStream);
      
      // Call the callback if provided
      if (this.options.onStreamCreated) {
        this.options.onStreamCreated(this.streamData);
      }
      
      return this.streamData;
    } catch (error) {
      console.error("HLS: Failed to start stream:", error);
      if (this.options.onError) {
        this.options.onError(error as Error);
      }
      throw error;
    }
  }
  
  /**
   * Initialize HLS streaming on an existing stream
   * @param streamId The ID of the existing stream
   */
  async initializeExistingStream(streamId: number): Promise<HLSStream> {
    try {
      console.log(`HLS: Initializing existing stream ${streamId}`);
      
      const streamResponse = await initializeHLSStream(streamId);
      
      console.log("HLS: Stream initialized:", streamResponse);
      
      this.streamData = {
        streamId: streamResponse.streamId,
        streamKey: "", // Not returned for existing streams
        hlsPlaylistUrl: streamResponse.hlsPlaylistUrl,
        hlsSegmentUrl: streamResponse.hlsSegmentUrl,
        shareUrl: `${window.location.origin}/stream/${streamResponse.streamId}`
      };
      
      return this.streamData;
    } catch (error) {
      console.error("HLS: Failed to initialize existing stream:", error);
      if (this.options.onError) {
        this.options.onError(error as Error);
      }
      throw error;
    }
  }
  
  /**
   * Start recording the media stream and uploading segments
   */
  private startRecording(mediaStream: MediaStream) {
    if (!this.streamData) {
      throw new Error("Stream data not available. Create a stream first.");
    }
    
    console.log("HLS: Starting media recorder");
    
    // Set up media recorder with appropriate MIME type
    const mimeType = 'video/webm;codecs=vp8,opus';
    const options = { mimeType };
    
    try {
      this.mediaRecorder = new MediaRecorder(mediaStream, options);
      
      this.mediaRecorder.ondataavailable = async (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
          
          // Process and upload the segment
          await this.processAndUploadSegment();
        }
      };
      
      this.mediaRecorder.onstart = () => {
        console.log("HLS: MediaRecorder started");
        this.streamActive = true;
      };
      
      this.mediaRecorder.onstop = () => {
        console.log("HLS: MediaRecorder stopped");
        this.streamActive = false;
      };
      
      this.mediaRecorder.onerror = (event: Event) => {
        console.error("HLS: MediaRecorder error:", event);
        this.streamActive = false;
        if (this.options.onError) {
          this.options.onError(new Error("Media recording error"));
        }
      };
      
      // Start recording with a reasonable segment duration
      this.mediaRecorder.start(this.segmentDuration);
      
      // Set up an interval to request data from MediaRecorder
      this.segmentInterval = window.setInterval(() => {
        if (this.mediaRecorder && this.streamActive) {
          // Stop the current recording and start a new one
          if (this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.requestData();
          }
        }
      }, this.segmentDuration);
      
    } catch (error) {
      console.error("HLS: Media recorder setup failed:", error);
      if (this.options.onError) {
        this.options.onError(error as Error);
      }
      throw error;
    }
  }
  
  /**
   * Process recorded chunks and upload as a segment
   */
  private async processAndUploadSegment() {
    if (!this.streamData || this.recordedChunks.length === 0) {
      return;
    }
    
    try {
      // Create a single blob from all chunks
      const segmentBlob = new Blob(this.recordedChunks, { type: 'video/webm' });
      this.recordedChunks = []; // Clear the chunks
      
      console.log(`HLS: Uploading segment, size: ${segmentBlob.size} bytes`);
      
      // Upload the segment
      const response = await uploadHLSSegment(this.streamData.streamId, segmentBlob);
      
      console.log("HLS: Segment uploaded:", response);
      
      if (this.options.onSegmentUploaded) {
        this.options.onSegmentUploaded(response);
      }
    } catch (error) {
      console.error("HLS: Segment upload failed:", error);
      if (this.options.onError) {
        this.options.onError(error as Error);
      }
    }
  }
  
  /**
   * Stop the streaming session
   * @returns Information about the ended stream, including recording options
   */
  async stopStream(): Promise<{
    success: boolean;
    showSavePrompt?: boolean;
    temporaryUrl?: string;
    message?: string;
  }> {
    if (!this.streamData) {
      return { success: false, message: "No active stream" };
    }
    
    console.log(`HLS: Stopping stream ${this.streamData.streamId}`);
    
    // Clear the segment interval
    if (this.segmentInterval) {
      clearInterval(this.segmentInterval);
      this.segmentInterval = null;
    }
    
    // Stop the media recorder
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    
    // Process any remaining chunks
    if (this.recordedChunks.length > 0) {
      await this.processAndUploadSegment();
    }
    
    try {
      // End the stream on the server
      const response = await endHLSStream(this.streamData.streamId);
      
      console.log("HLS: Stream ended:", response);
      
      if (this.options.onStreamEnded) {
        this.options.onStreamEnded(response);
      }
      
      this.streamActive = false;
      
      return {
        success: true,
        showSavePrompt: response.showSavePrompt || false,
        temporaryUrl: response.temporaryUrl,
        message: response.message
      };
    } catch (error) {
      console.error("HLS: Failed to end stream:", error);
      if (this.options.onError) {
        this.options.onError(error as Error);
      }
      return { 
        success: false, 
        message: (error as Error).message || "Failed to end stream"
      };
    }
  }
  
  /**
   * Get the current stream data
   */
  getStreamData(): HLSStream | null {
    return this.streamData;
  }
  
  /**
   * Check if the stream is active
   */
  isStreamActive(): boolean {
    return this.streamActive;
  }
  
  /**
   * Set the segment duration
   * @param duration Duration in milliseconds
   */
  setSegmentDuration(duration: number): void {
    this.segmentDuration = duration;
  }
}

/**
 * Create a new HLS streaming session
 */
export function createHLSStreamingSession(options?: HLSStreamingOptions): HLSStreamingSession {
  return new HLSStreamingSession(options);
}