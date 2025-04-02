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
  audioLevel?: number;
}

export class AudioVisualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private analyser: AnalyserNode;
  private dataArray: Uint8Array;
  private lastDrawTime: number = 0;

  constructor(canvas: HTMLCanvasElement, analyser: AnalyserNode) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!; // Optimize for mobile GPU
    this.analyser = analyser;
    this.dataArray = new Uint8Array(analyser.frequencyBinCount);
    this.lastDrawTime = 0;

    // Better touch handling for mobile
    canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

    // Add touch event handling
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault(); // Prevent scrolling
    }, { passive: false });
  }

  draw() {
    // Throttle drawing on mobile for better performance
    const now = performance.now();
    if (now - this.lastDrawTime < 1000 / 30) { // 30fps on mobile
      requestAnimationFrame(() => this.draw());
      return;
    }
    this.lastDrawTime = now;

    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);
    this.analyser.getByteFrequencyData(this.dataArray);

    const barWidth = width / this.dataArray.length;
    let x = 0;

    this.ctx.fillStyle = '#4CAF50';
    for (let i = 0; i < this.dataArray.length; i++) {
      const barHeight = (this.dataArray[i] / 255) * height;
      this.ctx.fillRect(x, height - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }
    requestAnimationFrame(() => this.draw());
  }
}

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
    audioLevel: -60 
  };
  private audioProcessorNode: AudioWorkletNode | null = null;
  private frequencyData: Uint8Array | null = null;
  private connectionCheckInterval: NodeJS.Timeout | null = null;
  private onStatusChangeCallbacks: ((status: StreamStatus) => void)[] = [];
  private onVisualizeCallbacks: ((data: Uint8Array) => void)[] = [];
  private visualizer: AudioVisualizer | null = null;


  constructor() {
    // Create Audio Context when needed (due to browser autoplay policies)
  }

  /**
   * Initialize audio devices and prepare for streaming
   */
  async initialize(settings: AudioStreamSettings = {}): Promise<boolean> {
    try {
      // Merge default and custom settings
      const streamSettings = { 
        sampleRate: 48000, 
        echoCancellation: false, 
        noiseSuppression: false, 
        autoGainControl: false, 
        channelCount: 2, 
        ...settings 
      };

      console.log("Requesting media permissions...");
      
      // Request both audio and video access for streaming
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: streamSettings,
        video: true // Request video access as well for streaming
      });
      
      console.log("Media permissions granted:", this.stream.getTracks().map(t => t.kind));

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

      // Start visualization process
      this.setupVisualizationLoop();

      return true;
    } catch (error) {
      console.error("Error initializing audio streaming:", error);
      return false;
    }
  }
  
  /**
   * Start capturing audio/video for preview
   */
  startCapture(): boolean {
    try {
      if (!this.stream) {
        console.error("No media stream available");
        return false;
      }
      
      // Enable all tracks in the stream
      this.stream.getTracks().forEach(track => {
        track.enabled = true;
      });
      
      console.log("Media capture started with tracks:", 
        this.stream.getTracks().map(t => `${t.kind}:${t.label}:${t.enabled}`));
      
      return true;
    } catch (error) {
      console.error("Error starting media capture:", error);
      return false;
    }
  }
  
  /**
   * Initialize visualization with a canvas element
   */
  startVisualization(canvas?: HTMLCanvasElement): void {
    if (canvas && this.analyserNode) {
      this.visualizer = new AudioVisualizer(canvas, this.analyserNode);
      this.visualizer.draw();
    } else if (this.analyserNode && this.frequencyData) {
      // Start the internal visualization loop if no canvas provided
      this.setupInternalVisualization();
    }
  }
  
  /**
   * Private: Setup internal visualization without a canvas element
   * Used for audio level monitoring when no visual display is needed
   */
  private setupInternalVisualization(): void {
    if (!this.analyserNode || !this.frequencyData) return;
    
    const updateInternalVisualization = () => {
      if (!this.analyserNode || !this.frequencyData) return;
      
      // Get frequency data
      this.analyserNode.getByteFrequencyData(this.frequencyData);
      
      // Calculate audio level from frequency data
      let sum = 0;
      for (let i = 0; i < this.frequencyData.length; i++) {
        sum += this.frequencyData[i];
      }
      const average = sum / this.frequencyData.length;
      
      // Convert to dB scale (rough approximation)
      // -60dB (quiet) to 0dB (loud)
      const dbLevel = average === 0 ? -60 : Math.max(-60, Math.min(0, (average / 255) * 60 - 60));
      
      // Update stream status with audio level
      this.streamStatus.audioLevel = dbLevel;
      
      // Notify status change to update UI
      this.notifyStatusChange();
      
      // Continue monitoring
      requestAnimationFrame(updateInternalVisualization);
    };
    
    // Start the loop
    updateInternalVisualization();
  }

  
  /**
   * Set up the visualization loop without calling startVisualization
   */
  private setupVisualizationLoop(): void {
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
   * Start streaming to the server
   */
  async startStreaming(streamId: number, streamKey: string): Promise<boolean> {
    try {
      // Store the stream key for use in error handling and logging
      this.streamKey = streamKey;
      
      if (!this.stream || !this.audioContext) {
        const initialized = await this.initialize({
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        });
        if (!initialized) {
          console.error("Failed to initialize audio stream");
          return false;
        }
      }

      // Ensure audio context is running
      if (this.audioContext) {
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
        }
      } else {
        console.warn("Audio context is not initialized");
      }

      // Close any existing connection
      if (this.socket) {
        this.socket.close();
        this.socket = null;
      }

      // Setup WebSocket connection for audio streaming
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      
      // Detect if we're in a Replit environment
      const isReplit = window.location.hostname.endsWith('.replit.app') || 
                        window.location.hostname.includes('replit') || 
                        window.location.hostname === 'localhost';
      
      // Correctly format the host for WebSocket connection
      let host = window.location.host;
      
      // Handle Replit environment specifically
      if (isReplit) {
        // Use full host (including port) for localhost development
        // But for .replit.app domains, use just the hostname
        if (window.location.hostname !== 'localhost' && host.includes(':')) {
          host = window.location.hostname; // Use only hostname without port
        }
      }
      
      const wsUrl = `${protocol}//${host}/ws/audio?streamId=${streamId}&role=broadcaster&streamKey=${streamKey}`;

      // Mask stream key in logs
      const maskedUrl = wsUrl.replace(/streamKey=([^&]+)/, 'streamKey=****');
      console.log(`Connecting to audio streaming WebSocket: ${maskedUrl}`);
      console.log("Environment info:", {
        isReplit,
        hostname: window.location.hostname,
        protocol,
        host,
        port: window.location.port,
        hasStreamKey: !!streamKey
      });
      
      // Use a connection retry mechanism for reliability
      try {
        this.socket = new WebSocket(wsUrl);
      } catch (error) {
        console.error("WebSocket connection error:", error);
        return false;
      }

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
          
          // Log detailed information about the connection failure
          if (event.code !== 1000) {
            console.error(`WebSocket closed abnormally. Code: ${event.code}, Reason: ${event.reason || 'No reason provided'}`);
            console.log("Connection details:", {
              url: wsUrl.replace(/streamKey=([^&]+)/, 'streamKey=****'),
              streamId,
              wasEverConnected: event.wasClean,
              hasStreamKey: !!this.streamKey
            });
          }
        };

        this.socket.onerror = (error) => {
          console.error("WebSocket error:", error);
          console.log("WebSocket connection details:", {
            url: wsUrl.replace(/streamKey=([^&]+)/, 'streamKey=****'),
            readyState: this.socket ? this.socket.readyState : 'socket_not_initialized',
            browserSupport: 'WebSocket' in window ? 'supported' : 'not_supported',
            streamId,
            hasStreamKey: !!this.streamKey
          });
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
    
    // Clear the stream key after stopping for security
    this.streamKey = "";
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
  
  /**
   * Public: Initialize visualization with canvas element
   */
  public initializeVisualization(canvas: HTMLCanvasElement): void {
    if (this.analyserNode) {
      this.visualizer = new AudioVisualizer(canvas, this.analyserNode);
      this.visualizer.draw();
    }
  }

  /**
   * Initialize audio stream
   */
  public async initializeStream(): Promise<boolean> {
    return this.initialize();
  }

  /**
   * Test audio functionality
   */
  public async testAudio(): Promise<void> {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Media devices not supported");
      }
      await this.initializeStream();
      console.log("Audio test successful");
    } catch (error) {
      console.error("Error testing audio:", error instanceof Error ? error.message : "Unknown error");
      throw error;
    }
  }
}

// Singleton instance for application-wide use
export const audioStreamingService = new AudioStreamingService();