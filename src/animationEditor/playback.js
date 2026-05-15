export const createPlaybackActions = ({ state, ui, setFrameIndex }) => {
  const stopPlayback = () => {
    state.isPlaying = false;
    if (state.playbackTimerId !== null) {
      window.clearInterval(state.playbackTimerId);
      state.playbackTimerId = null;
    }
    ui.play.disabled = false;
    ui.stop.disabled = true;
  };

  const startPlayback = () => {
    const spec = state.spec;
    if (spec === null) {
      return;
    }

    stopPlayback();

    const rawSpeed = Number(spec.speed ?? 1);
    const speed = Number.isFinite(rawSpeed) && rawSpeed > 0 ? rawSpeed : 1;
    const intervalMs = Math.max(spec.frameDurationMs / speed, 1);
    const lastIndex = Math.max(spec.frames.length - 1, 0);

    state.isPlaying = true;
    ui.play.disabled = true;
    ui.stop.disabled = false;

    state.playbackTimerId = window.setInterval(() => {
      const nextCandidate = state.currentFrameIndex + 1;
      const nextIndex = nextCandidate > lastIndex ? 0 : nextCandidate;
      setFrameIndex(nextIndex);
    }, intervalMs);
  };

  const togglePlayback = () => {
    if (state.isPlaying) {
      stopPlayback();
      return;
    }
    startPlayback();
  };

  const bindPlaybackHandlers = () => {
    ui.play.addEventListener("click", () => {
      startPlayback();
    });
    ui.stop.addEventListener("click", () => {
      stopPlayback();
    });
  };

  return {
    bindPlaybackHandlers,
    startPlayback,
    stopPlayback,
    togglePlayback,
  };
};
