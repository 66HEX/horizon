import { useState, useRef, useEffect, useId } from 'react';
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  IconPlayerPlay, 
  IconPlayerPause, 
  IconVolume, 
  IconVolumeOff,
  IconPlayerTrackNext,
  IconPlayerTrackPrev,
  IconRepeat,
  IconRepeatOff
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useAudioStore } from '@/lib/stores/audio-store';

export interface AudioPlayerProps {
  src: string;
  fileName: string;
  className?: string;
}

export function AudioPlayer({ src, fileName, className }: AudioPlayerProps) {
  const playerId = useId();
  const { activePlayerId, registerPlayer, unregisterPlayer, setActivePlayer, pauseAllExcept } = useAudioStore();
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLooping, setIsLooping] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const wasPlayingRef = useRef(false);

  useEffect(() => {
    if (audioRef.current && audioRef.current.src !== src) {
      setCurrentTime(0);
      setIsPlaying(false);
      audioRef.current.currentTime = 0;
      audioRef.current.pause();
    }
  }, [src]);

  useEffect(() => {
    const pause = () => {
      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    };

    registerPlayer(playerId, pause);
    return () => unregisterPlayer(playerId);
  }, [playerId, registerPlayer, unregisterPlayer]);

  useEffect(() => {
    if (activePlayerId && activePlayerId !== playerId && isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, [activePlayerId, playerId, isPlaying]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setActivePlayer(null);
      } else {
        pauseAllExcept(playerId);
        setActivePlayer(playerId);
        audioRef.current.play().catch(() => {
          setIsPlaying(false);
          setActivePlayer(null);
        });
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
      setVolume(newVolume);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeekStart = () => {
    wasPlayingRef.current = isPlaying;
    if (audioRef.current && isPlaying) {
      audioRef.current.pause();
    }
  };

  const handleSeekChange = (value: number[]) => {
    setCurrentTime(value[0]);
  };

  const handleSeekComplete = (value: number[]) => {
    if (audioRef.current) {
      const newTime = value[0];
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      
      if (wasPlayingRef.current) {
        audioRef.current.play()
          .then(() => setIsPlaying(true))
          .catch(() => setIsPlaying(false));
      }
    }
  };

  const toggleLoop = () => {
    if (audioRef.current) {
      audioRef.current.loop = !isLooping;
      setIsLooping(!isLooping);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn("relative w-full h-full bg-background", className)}>
      <ScrollArea className="h-full relative">
        <div className="absolute inset-0 flex items-center justify-center h-full">
          <div className="w-full max-w-xl p-6 space-y-6">
            <div className="text-center">
              <h2 className="text-lg font-medium text-foreground">
                {fileName}
              </h2>
            </div>

            <div className="bg-sidebar/80 backdrop-blur-sm border border-sidebar-border/20 rounded-lg p-4 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground min-w-[3ch]">
                    {formatTime(currentTime)}
                  </span>
                  <Slider
                    value={[currentTime]}
                    min={0}
                    max={duration || 100}
                    step={0.1}
                    onValueChange={handleSeekChange}
                    onValueCommit={handleSeekComplete}
                    onPointerDown={handleSeekStart}
                    className="flex-1"
                  />
                  <span className="text-sm text-muted-foreground min-w-[3ch]">
                    {formatTime(duration)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-center space-x-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-sidebar-accent/20"
                  disabled
                >
                  <IconPlayerTrackPrev className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={togglePlay}
                  className="h-12 w-12 hover:bg-sidebar-accent/20"
                >
                  {isPlaying ? (
                    <IconPlayerPause className="h-6 w-6" />
                  ) : (
                    <IconPlayerPlay className="h-6 w-6" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-sidebar-accent/20"
                  disabled
                >
                  <IconPlayerTrackNext className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleLoop}
                  className="h-8 w-8 hover:bg-sidebar-accent/20"
                >
                  {isLooping ? (
                    <IconRepeat className="h-4 w-4" />
                  ) : (
                    <IconRepeatOff className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleMute}
                  className="h-8 w-8 hover:bg-sidebar-accent/20"
                >
                  {isMuted ? (
                    <IconVolumeOff className="h-4 w-4" />
                  ) : (
                    <IconVolume className="h-4 w-4" />
                  )}
                </Button>
                <Slider
                  value={[isMuted ? 0 : volume]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={handleVolumeChange}
                  className="w-24"
                />
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>

      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        className="hidden"
      />
    </div>
  );
} 