import { describe, it, expect } from 'vitest';
import { AudioRecorder } from '../../../../src/services/audio/AudioRecorder.js';
import { StubMicrophone } from '../../../helpers/platform-stubs.js';
import { parseWav } from '../../../../src/services/audio/WavEncoder.js';

function silencePcm(durationMs: number): Buffer {
  const samples = Math.round((16000 * durationMs) / 1000);
  return Buffer.alloc(samples * 2);
}

describe('AudioRecorder', () => {
  it('starts and stops the microphone and returns wav + pcm + duration', async () => {
    const pcm = silencePcm(1000);
    const mic = new StubMicrophone({ fixture: pcm });
    const rec = new AudioRecorder(mic);

    expect(rec.isRecording()).toBe(false);
    await rec.start();
    expect(rec.isRecording()).toBe(true);

    const result = await rec.stop();
    expect(rec.isRecording()).toBe(false);

    expect(result.pcm).toEqual(pcm);
    expect(result.durationMs).toBe(1000);
    const header = parseWav(result.wav);
    expect(header.sampleRate).toBe(16000);
    expect(header.durationMs).toBe(1000);
    expect(mic.startCalls).toBe(1);
    expect(mic.stopCalls).toBe(1);
  });

  it('rejects start when already recording', async () => {
    const mic = new StubMicrophone({ fixture: silencePcm(100) });
    const rec = new AudioRecorder(mic);
    await rec.start();
    await expect(rec.start()).rejects.toThrow(/already recording/);
    await rec.stop();
  });

  it('rejects stop when not recording', async () => {
    const mic = new StubMicrophone({ fixture: silencePcm(100) });
    const rec = new AudioRecorder(mic);
    await expect(rec.stop()).rejects.toThrow(/not recording/);
  });

  it('falls back to wall-clock duration when the mic returns empty pcm', async () => {
    let t = 1_000_000;
    const mic = new StubMicrophone({ fixture: Buffer.alloc(0) });
    const rec = new AudioRecorder(mic, { now: () => t });
    await rec.start();
    t += 250;
    const result = await rec.stop();
    expect(result.pcm.length).toBe(0);
    expect(result.durationMs).toBe(250);
  });
});
