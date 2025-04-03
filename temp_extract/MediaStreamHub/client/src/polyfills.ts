// Comprehensive polyfills for SimplePeer and WebRTC
import { Buffer } from 'buffer';

// Global object polyfills
if (typeof window !== "undefined") {
  // Global object
  (window as any).global = window;
  
  // Process object
  (window as any).process = (window as any).process || {};
  (window as any).process.env = (window as any).process.env || {};
  (window as any).process.nextTick = (window as any).process.nextTick || setTimeout;
  
  // Buffer 
  (window as any).Buffer = Buffer;
}

// Console fallbacks for environments where console might be undefined
if (typeof console === 'undefined') {
  (window as any).console = {
    log: () => {},
    error: () => {},
    warn: () => {},
    info: () => {},
    debug: () => {},
  };
}