import { useRef, useEffect } from "react";

interface AudioVisualizerProps {
  audioUrl: string;
  isPlaying: boolean;
}

const AudioVisualizer = ({ audioUrl, isPlaying }: AudioVisualizerProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    // Create audio element
    const audioElement = new Audio();
    audioElement.crossOrigin = "anonymous";
    audioElement.src = audioUrl;
    audioElementRef.current = audioElement;

    // Create audio context and analyzer
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    // Connect source to analyzer
    const source = audioContext.createMediaElementSource(audioElement);
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    sourceRef.current = source;

    // Setup canvas
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasCtx = canvas.getContext("2d");
    if (!canvasCtx) return;

    // Set initial playback state
    if (isPlaying) {
      audioElement.play();
    }

    // Draw function
    const draw = () => {
      if (!analyserRef.current || !canvas || !canvasCtx) return;

      // Request next frame
      animationRef.current = requestAnimationFrame(draw);

      // Get frequency data
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyserRef.current.getByteFrequencyData(dataArray);

      // Clear canvas
      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Set visual style
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      // Draw bars
      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;
        
        // Create gradient for bars
        const gradient = canvasCtx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, "rgba(255, 255, 255, 0.8)");
        gradient.addColorStop(1, "rgba(255, 255, 255, 0.3)");
        
        canvasCtx.fillStyle = gradient;
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        
        x += barWidth + 1;
      }
    };

    // Start animation
    draw();

    // Cleanup function
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [audioUrl]);

  // Handle play/pause
  useEffect(() => {
    if (!audioElementRef.current) return;
    
    if (isPlaying) {
      audioElementRef.current.play();
      
      // Resume audio context if it was suspended
      if (audioContextRef.current?.state === "suspended") {
        audioContextRef.current.resume();
      }
    } else {
      audioElementRef.current.pause();
    }
  }, [isPlaying]);

  return (
    <div className="audio-visualizer w-full h-32 px-6">
      <canvas
        ref={canvasRef}
        width={800}
        height={150}
        className="w-full h-full"
      />
    </div>
  );
};

export default AudioVisualizer;
