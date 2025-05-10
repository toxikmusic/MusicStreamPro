/**
 * Audio Streaming Service
 * Handles audio capture, processing, and streaming for the BeatStream platform
 */

export interface AudioStreamSettings {
  sampleRate?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  channelCount?: number;
}

export interface StreamStatus {
  isLive: boolean;
  streamId?: number;
  viewerCount: number;
  startTime?: Date;
  peakViewerCount: number;
  audioLevel?: number; // Current audio level in dB
}

// Default audio settings for good quality music streaming
const defaultSettings: AudioStreamSettings = {
  sampleRate: 48000,
  echoCancellation: false, // Turn off for music streaming
  noiseSuppression: false, // Turn off for music streaming
  autoGainControl: false,  // Turn off for music streaming
  channelCount: 2 // Stereo
};

export class AudioStreamingService {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private socket: WebSocket | null = null;
  private streamKey: string = "";
  private streamStatus: StreamStatus = {
    isLive: false,
    viewerCount: 0,
    peakViewerCount: 0,
    audioLevel: -60 // Initial level (silent)
  };
  private audioProcessorNode: AudioWorkletNode | null = null;
  private frequencyData: Uint8Array | null = null;
  private connectionCheckInterval: NodeJS.Timeout | null = null;
  private onStatusChangeCallbacks: ((status: StreamStatus) => void)[] = [];
  private onVisualizeCallbacks: ((data: Uint8Array) => void)[] = [];

  constructor() {
    // Create Audio Context when needed (due to browser autoplay policies)
  }

  /**
   * Initialize audio devices and prepare for streaming
   */
  async initialize(settings: AudioStreamSettings = {}): Promise<boolean> {
    try {
      // Merge default and custom settings
      const streamSettings = { ...defaultSettings, ...settings };
      
      // Request microphone/audio input access
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: streamSettings
      });
      
      // Create audio context with desired sample rate
      this.audioContext = new AudioContext({
        sampleRate: streamSettings.sampleRate
      });
      
      // Create source node from the input stream
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
      
      // Create analyzer for visualizations
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.frequencyData = new Uint8Array(this.analyserNode.frequencyBinCount);
      
      // Create gain node for volume control
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1.0;
      
      // Connect the audio graph
      this.sourceNode.connect(this.analyserNode);
      this.analyserNode.connect(this.gainNode);
      
      // Start visualization loop
      this.startVisualization();
      
      return true;
    } catch (error) {
      console.error("Error initializing audio streaming:", error);
      return false;
    }
  }

  /**
   * Start streaming to the server
   */
  async startStreaming(streamId: number, streamKey: string): Promise<boolean> {
    if (!this.stream || !this.audioContext) {
      console.error("Audio stream not initialized. Call initialize() first.");
      return false;
    }
    
    try {
      // Close any existing connection
      if (this.socket) {
        this.socket.close();
        this.socket = null;
      }
      
      this.streamKey = streamKey;
      
      // Setup WebSocket connection for audio streaming
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // Connect to our dedicated audio WebSocket with proper format
      const wsUrl = `${protocol}//${window.location.host}/audio/${streamId}?role=broadcaster&streamKey=${streamKey}`;
      
      console.log(`Connecting to audio streaming WebSocket: ${wsUrl}`);
      this.socket = new WebSocket(wsUrl);
      
      // Set a connection timeout
      const connectionTimeout = setTimeout(() => {
        if (this.socket && this.socket.readyState !== WebSocket.OPEN) {
          console.error("WebSocket connection timeout");
          this.socket.close();
          this.notifyStatusChange();
        }
      }, 10000); // 10 seconds timeout
      
      return new Promise<boolean>((resolve) => {
        if (!this.socket) {
          resolve(false);
          return;
        }
        
        this.socket.onopen = () => {
          console.log("Audio WebSocket connection established");
          clearTimeout(connectionTimeout);
          
          // Start audio processing and sending to websocket when connected
          this.startAudioProcessing();
          
          // Update stream status
          const currentLevel = this.streamStatus.audioLevel || -60;
          this.streamStatus = {
            ...this.streamStatus,
            isLive: true,
            streamId,
            startTime: new Date(),
            viewerCount: 0,
            peakViewerCount: 0,
            audioLevel: currentLevel
          };
          
          this.notifyStatusChange();
          
          // Setup connection checking
          this.connectionCheckInterval = setInterval(() => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
              this.socket.send(JSON.stringify({ type: 'ping' }));
            } else {
              // Try to reconnect if connection is lost
              console.log("Connection check failed, attempting to reconnect");
              this.startStreaming(streamId, streamKey);
            }
          }, 30000); // Check every 30 seconds
          
          resolve(true);
        };
        
        this.socket.onclose = (event) => {
          console.log(`WebSocket closed: code=${event.code}, reason=${event.reason}`);
          clearTimeout(connectionTimeout);
          this.stopStreaming();
          
          if (this.streamStatus.isLive) {
            // Connection was lost after successful start
            console.log("Connection lost, stream was active");
            this.streamStatus.isLive = false;
            this.notifyStatusChange();
          }
          
          resolve(false);
        };
        
        this.socket.onerror = (error) => {
          console.error("WebSocket error:", error);
          clearTimeout(connectionTimeout);
          this.stopStreaming();
          resolve(false);
        };
        
        this.socket.onmessage = (event) => {
          try {
            // Check if it's a text message (control message)
            if (typeof event.data === 'string') {
              const data = JSON.parse(event.data);
              
              switch (data.type) {
                case 'viewer_count':
                  const newCount = data.viewerCount || 0;
                  this.streamStatus.viewerCount = newCount;
                  this.streamStatus.peakViewerCount = Math.max(
                    this.streamStatus.peakViewerCount,
                    newCount
                  );
                  this.notifyStatusChange();
                  break;
                  
                case 'stream_status':
                  if (data.isLive !== undefined) {
                    this.streamStatus.isLive = data.isLive;
                  }
                  if (data.viewerCount !== undefined) {
                    this.streamStatus.viewerCount = data.viewerCount;
                  }
                  this.notifyStatusChange();
                  break;
                  
                case 'error':
                  console.error("Stream error:", data.message);
                  break;
                  
                case 'pong':
                  // Server responded to our ping
                  break;
              }
            }
          } catch (error) {
            console.error("Error parsing WebSocket message:", error);
          }
        };
      });
    } catch (error) {
      console.error("Error starting streaming:", error);
      return false;
    }
  }

  /**
   * Stop the active stream
   */
  stopStreaming(): void {
    // Clean up audio processing
    if (this.audioProcessorNode) {
      this.audioProcessorNode.disconnect();
      this.audioProcessorNode = null;
    }
    
    // Close WebSocket connection
    if (this.socket) {
      if (this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ 
          type: 'end_stream',
          streamId: this.streamStatus.streamId
        }));
      }
      this.socket.close();
      this.socket = null;
    }
    
    // Clear checking interval
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
    
    // Update status
    this.streamStatus.isLive = false;
    this.notifyStatusChange();
  }

  /**
   * Set the output volume
   */
  setVolume(volume: number): void {
    if (this.gainNode) {
      // Ensure volume is between 0 and 1
      const safeVolume = Math.max(0, Math.min(1, volume));
      this.gainNode.gain.value = safeVolume;
    }
  }

  /**
   * Get current stream status
   */
  getStreamStatus(): StreamStatus {
    return { ...this.streamStatus };
  }

  /**
   * Register a callback for stream status changes
   */
  onStatusChange(callback: (status: StreamStatus) => void): void {
    this.onStatusChangeCallbacks.push(callback);
  }

  /**
   * Register a callback for visualization data
   */
  onVisualize(callback: (data: Uint8Array) => void): void {
    this.onVisualizeCallbacks.push(callback);
  }

  /**
   * Clean up and release resources
   */
  dispose(): void {
    this.stopStreaming();
    
    // Stop all tracks in the media stream
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    // Disconnect and close audio context
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    
    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }
    
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    // Clear callbacks
    this.onStatusChangeCallbacks = [];
    this.onVisualizeCallbacks = [];
  }

  /**
   * Private: Start audio processing and streaming
   */
  private async startAudioProcessing(): Promise<void> {
    if (!this.audioContext || !this.gainNode || !this.socket) return;
    
    try {
      // Load audio worklet for efficient audio processing
      await this.audioContext.audioWorklet.addModule('/audio-processor.js');
      
      // Create audio processor node
      this.audioProcessorNode = new AudioWorkletNode(
        this.audioContext, 
        'audio-processor'
      );
      
      // Connect gain node to processor
      this.gainNode.connect(this.audioProcessorNode);
      
      // Handle processed audio data and level messages
      this.audioProcessorNode.port.onmessage = (event) => {
        if (!event.data) return;
        
        // Check if it's a level message
        if (typeof event.data === 'object' && event.data.type === 'level') {
          // Update audio level in stream status
          this.streamStatus.audioLevel = event.data.level;
          this.notifyStatusChange();
          return;
        }
        
        // Otherwise it's audio data to send
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          try {
            this.socket.send(event.data);
          } catch (error) {
            console.error("Error sending audio data:", error);
          }
        }
      };
      
      // Connect processor to destination (not actually outputting audio)
      this.audioProcessorNode.connect(this.audioContext.destination);
      
    } catch (error) {
      console.error("Error starting audio processing:", error);
      
      // Fallback to ScriptProcessorNode if AudioWorklet not supported
      this.setupLegacyAudioProcessing();
    }
  }

  /**
   * Private: Setup legacy audio processing for browsers that don't support AudioWorklet
   */
  private setupLegacyAudioProcessing(): void {
    if (!this.audioContext || !this.gainNode || !this.socket) return;
    
    const bufferSize = 4096;
    const processorNode = this.audioContext.createScriptProcessor(
      bufferSize,
      2, // stereo input
      2  // stereo output
    );
    
    processorNode.onaudioprocess = (e) => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        // Get audio data
        const left = e.inputBuffer.getChannelData(0);
        const right = e.inputBuffer.getChannelData(1);
        
        // Prepare data for transmission (simplified, would need proper encoding in production)
        const interleaved = new Float32Array(left.length * 2);
        for (let i = 0; i < left.length; i++) {
          interleaved[i * 2] = left[i];
          interleaved[i * 2 + 1] = right[i];
        }
        
        // Send audio data to server
        this.socket.send(interleaved.buffer);
      }
    };
    
    // Connect the processor
    this.gainNode.connect(processorNode);
    processorNode.connect(this.audioContext.destination);
  }

  /**
   * Private: Start visualization loop
   */
  private startVisualization(): void {
    if (!this.analyserNode || !this.frequencyData) return;
    
    const updateVisualization = () => {
      if (!this.analyserNode || !this.frequencyData) return;
      
      // Get frequency data
      this.analyserNode.getByteFrequencyData(this.frequencyData);
      
      // Notify visualize callbacks
      this.onVisualizeCallbacks.forEach(callback => {
        callback(this.frequencyData!);
      });
      
      // Continue loop
      requestAnimationFrame(updateVisualization);
    };
    
    // Start the loop
    updateVisualization();
  }

  /**
   * Private: Notify all status change callbacks
   */
  private notifyStatusChange(): void {
    const status = this.getStreamStatus();
    this.onStatusChangeCallbacks.forEach(callback => {
      callback(status);
    });
    
    // Send audio level update to the server if we're streaming as broadcaster
    if (this.socket && this.socket.readyState === WebSocket.OPEN && 
        this.streamStatus.isLive && this.streamStatus.streamId && 
        this.streamStatus.audioLevel !== undefined) {
      try {
        // Send as a control message (string) instead of binary audio data
        this.socket.send(JSON.stringify({
          type: 'audio_level',
          level: this.streamStatus.audioLevel,
          streamId: this.streamStatus.streamId
        }));
      } catch (error) {
        console.error('Error sending audio level to server:', error);
      }
    }
  }
}

// Singleton instance for application-wide use
export const audioStreamingService = new AudioStreamingService();