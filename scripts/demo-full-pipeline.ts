/**
 * End-to-end pipeline driver: speech → Whisper → cleanup → dictionary.
 *
 * Uses macOS `say` to synthesize a deterministic test utterance (no mic needed),
 * then walks it through the exact same service chain the app uses at runtime.
 * Prints what each stage produced so we have real, verifiable output instead
 * of posed screenshots.
 *
 * Run:
 *   set -a; source .env; set +a
 *   eval "$(aws configure export-credentials --format env)"
 *   npx tsx scripts/demo-full-pipeline.ts
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GroqTranscriptionService } from '../src/services/transcription/TranscriptionService.js';
import { TextCleanupService } from '../src/services/llm/TextCleanupService.js';
import { Database } from '../src/services/storage/Database.js';
import { DictionaryRepository } from '../src/services/storage/DictionaryRepository.js';

const SPOKEN = [
  {
    app: 'Slack',
    utterance:
      'um so I was thinking like we should probably ship the Vox Flow feature tomorrow, you know.',
    dictionary: [['vox flow', 'VoxFlow']] as Array<[string, string]>,
  },
  {
    app: 'Visual Studio Code',
    utterance:
      'add a new async function called fetch user profile that takes a user ID and returns a promise of user profile.',
    dictionary: [] as Array<[string, string]>,
  },
];

async function synthesizeWav(text: string, outPath: string): Promise<void> {
  const aiff = outPath.replace(/\.wav$/, '.aiff');
  execFileSync('say', ['-o', aiff, text]);
  execFileSync('sox', [aiff, '-r', '16000', '-c', '1', '-b', '16', outPath]);
  fs.unlinkSync(aiff);
}

async function main(): Promise<void> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    console.error('GROQ_API_KEY is required.');
    process.exit(1);
  }

  const transcription = new GroqTranscriptionService({ apiKey: groqKey });
  const cleanup = new TextCleanupService({
    region: process.env.AWS_REGION ?? 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'voxflow-demo-'));

  for (const sample of SPOKEN) {
    console.log(`\n============================================================`);
    console.log(`APP: ${sample.app}`);
    console.log(`SPEAKING: "${sample.utterance}"`);
    console.log(`============================================================`);

    // 1. Synthesize speech → WAV.
    const wavPath = path.join(tmp, `utterance-${sample.app.replace(/\s+/g, '-')}.wav`);
    await synthesizeWav(sample.utterance, wavPath);
    const audio = fs.readFileSync(wavPath);
    console.log(`[stage 1] synthesized WAV: ${audio.length} bytes`);

    // 2. Groq Whisper.
    const transcribed = await transcription.transcribe({ audio });
    console.log(`[stage 2] Groq returned (${transcribed.durationMs}ms):`);
    console.log(`          "${transcribed.text}"`);

    // 3. Bedrock cleanup.
    const cleaned = await cleanup.cleanDetailed({
      text: transcribed.text,
      activeApp: sample.app,
    });
    console.log(
      `[stage 3] Bedrock cleanup (${cleaned.context}, in=${cleaned.inputTokens} out=${cleaned.outputTokens}, fallback=${cleaned.usedFallback}):`,
    );
    console.log(`          "${cleaned.text}"`);

    // 4. Personal dictionary.
    const db = new Database({ filename: ':memory:' });
    db.migrate();
    const dict = new DictionaryRepository(db);
    for (const [pattern, replacement] of sample.dictionary) {
      dict.add(pattern, replacement, false);
    }
    const final = dict.applyTo(cleaned.text);
    console.log(`[stage 4] after dictionary:`);
    console.log(`          "${final}"`);
    db.close();
  }

  fs.rmSync(tmp, { recursive: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
