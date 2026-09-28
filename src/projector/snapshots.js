/* Snapshots that do not come from a game: what the projector shows while nobody is playing. */
import { state } from '../state.js';

// The welcome screen: who is playing (active people), and everyone in list order, so the
// projector colours each avatar exactly as the game window does.
export function idleSnapshot() {
  return {
    kind: 'idle',
    participants: state.participants.slice(),
    people: state.players.map((p) => p.name),
  };
}
