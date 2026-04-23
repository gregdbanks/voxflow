import { describe, it, expect } from 'vitest';
import { AudioRecorder } from '../../src/services/audio/AudioRecorder.js';
import { MacMicrophone } from '../../src/platform/MacMicrophone.js';
import { parseWav } from '../../src/services/audio/WavEncoder.js';

const enabled = process.env.VOXFLOW_INTEGRATION === '1';

// This test is gated because it needs:
//   - macOS default input device
//   - sox installed (brew install sox)
//   - microphone permission granted to the terminal
describe.skipIf(!enabled)('MacMicrophone integration', () => {
  it('records one second of real audio and produces a valid WAV', async () => {
    const mic = new MacMicrophone();
    const recorder = new AudioRecorder(mic);

    await recorder.start();
    await new Promise((r) => setTimeout(r, 1000));
    const result = await recorder.stop();

    const header = parseWav(result.wav);
    expect(header.sampleRate).toBe(16000);
    expect(header.channels).toBe(1);
    expect(result.pcm.length).toBeGreaterThan(0);
    expect(header.durationMs).toBeGreaterThan(700);
  }, 10_000);
});
