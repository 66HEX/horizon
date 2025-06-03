import { create } from 'zustand';

/**
 * Interface for audio player instance
 */
interface AudioPlayer {
  id: string;
  pause: () => void;
}

/**
 * Interface for audio state and operations
 */
interface AudioState {
  /**
   * State properties
   */
  activePlayerId: string | null;
  registeredPlayers: Map<string, AudioPlayer>;
  
  /**
   * Audio action methods
   */
  setActivePlayer: (id: string | null) => void;
  registerPlayer: (id: string, pause: () => void) => void;
  unregisterPlayer: (id: string) => void;
  pauseAllExcept: (id: string) => void;
}

/**
 * Create the audio player store
 * @returns Combined store with all audio player functionality
 */
export const useAudioStore = create<AudioState>((set, get) => ({
  /**
   * State properties
   */
  activePlayerId: null,
  registeredPlayers: new Map(),

  /**
   * Set the active audio player
   * @param id - ID of the player to set as active or null
   */
  setActivePlayer: (id) => {
    const { registeredPlayers } = get();
    if (id === null || registeredPlayers.has(id)) {
      set({ activePlayerId: id });
    }
  },

  /**
   * Register a new audio player
   * @param id - Unique ID for the player
   * @param pause - Function to pause the player
   */
  registerPlayer: (id, pause) => {
    set((state) => {
      const newPlayers = new Map(state.registeredPlayers);
      newPlayers.set(id, { id, pause });
      return { registeredPlayers: newPlayers };
    });
  },

  /**
   * Unregister an audio player
   * @param id - ID of the player to unregister
   */
  unregisterPlayer: (id) => {
    set((state) => {
      const newPlayers = new Map(state.registeredPlayers);
      newPlayers.delete(id);
      return {
        registeredPlayers: newPlayers,
        activePlayerId: state.activePlayerId === id ? null : state.activePlayerId
      };
    });
  },

  /**
   * Pause all players except the specified one
   * @param id - ID of the player to keep playing
   */
  pauseAllExcept: (id) => {
    const { registeredPlayers } = get();
    registeredPlayers.forEach((player) => {
      if (player.id !== id) {
        player.pause();
      }
    });
  }
}));