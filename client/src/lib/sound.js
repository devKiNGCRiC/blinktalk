// A short two-note "blink" made with the Web Audio API - no audio file needed.
let audioContext = null;

export function playPing() {
    try {
        audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
        const now = audioContext.currentTime;

        [880, 1320].forEach((frequency, index) => {
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            const start = now + index * 0.09;

            oscillator.type = 'sine';
            oscillator.frequency.value = frequency;
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.12, start + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);

            oscillator.connect(gain).connect(audioContext.destination);
            oscillator.start(start);
            oscillator.stop(start + 0.18);
        });
    } catch {
        // Audio not available (or blocked until the user interacts) - stay silent
    }
}
