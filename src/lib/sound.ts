let currentAudio: HTMLAudioElement | null = null;

export function playNotificationSound() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }
  currentAudio = new Audio('https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg');
  currentAudio.volume = 1.0;
  currentAudio.loop = false; // We will handle looping manually
  let playCount = 1;
  currentAudio.onended = () => {
    if (playCount < 2) {
      playCount++;
      currentAudio?.play().catch(e => console.error("Audio play loop failed:", e.message));
    } else {
      stopNotificationSound();
    }
  };
  currentAudio.play().catch(e => console.error("Audio play failed:", e.message));
}

export function stopNotificationSound() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
}
