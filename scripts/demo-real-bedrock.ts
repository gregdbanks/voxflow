/**
 * Sends four representative raw transcriptions through the real Bedrock
 * cleanup service and prints before/after + token counts.
 *
 * Run: `eval $(aws configure export-credentials --format env); npx tsx scripts/demo-real-bedrock.ts`
 */
import { TextCleanupService } from '../src/services/llm/TextCleanupService.js';

const samples: Array<{ app: string; text: string }> = [
  {
    app: 'Slack',
    text: 'um so I was thinking like we should probably ship the feature tomorrow you know',
  },
  {
    app: 'Mail',
    text: 'hey team just wanted to follow up on the uh migration plan we discussed last week I think we are good to go on Thursday',
  },
  {
    app: 'Visual Studio Code',
    text: 'add a new async function called fetch user profile that takes a user ID and returns a promise of user profile',
  },
  {
    app: 'Pages',
    text: 'in conclusion our quarterly results exceeded expectations across all three regions and we expect similar growth next quarter',
  },
];

async function main(): Promise<void> {
  const service = new TextCleanupService({
    region: process.env.AWS_REGION ?? 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    modelId: process.env.VOXFLOW_CLEANUP_MODEL,
  });
  console.log(`Using model: ${process.env.VOXFLOW_CLEANUP_MODEL ?? '(default: Haiku 4.5)'}`);

  let totalIn = 0;
  let totalOut = 0;
  for (const sample of samples) {
    const result = await service.cleanDetailed({ text: sample.text, activeApp: sample.app });
    totalIn += result.inputTokens;
    totalOut += result.outputTokens;
    console.log(`\n=== ${sample.app}  [context: ${result.context}] ===`);
    console.log(`BEFORE: ${sample.text}`);
    console.log(`AFTER : ${result.text}`);
    console.log(`tokens: in=${result.inputTokens}  out=${result.outputTokens}  fallback=${result.usedFallback}`);
  }

  // Haiku 4.5 pricing (us-east-1, 2026-04): ~$0.001 / 1K input, ~$0.005 / 1K output.
  const costUsd = (totalIn * 0.001) / 1000 + (totalOut * 0.005) / 1000;
  console.log(`\nTotal: ${totalIn} input tokens + ${totalOut} output tokens  ≈  \$${costUsd.toFixed(5)} for ${samples.length} cleanups`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
