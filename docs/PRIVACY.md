# Privacy — what does and doesn't leave your machine

VoxFlow is designed to be a **local-first** dictation app. By default, nothing you say leaves your computer. This document is a plain-English inventory of every component that could touch the network so you can verify that yourself.

## TL;DR

With the default settings, **zero bytes of audio or transcription data leave your Mac**. VoxFlow runs a copy of OpenAI's Whisper model locally via `whisper.cpp`, and all history, settings, and dictionary entries live in a SQLite database under `~/Library/Application Support/VoxFlow/`.

The only network call the app ever makes under default settings is a one-time download of the Whisper model file (~1.5 GB from Hugging Face's CDN) the first time you launch. After that: **no outbound network**.

## Default: fully local

| What | Where it happens | Network? |
|---|---|---|
| Microphone capture | Your Mac, via `node-mic` + `sox` | ❌ no |
| Audio → text transcription | Your Mac, in-process via `whisper.cpp` (`smart-whisper` bindings) | ❌ no |
| Hotkey detection | Your Mac, in-process via `uiohook-napi` (`CGEventTap`) | ❌ no |
| Paste (`⌘V`) | Your Mac, in-process via `robotjs` (`CGEventPost`) | ❌ no |
| Transcription history | `~/Library/Application Support/VoxFlow/voxflow.sqlite` | ❌ no |
| Personal dictionary | Same SQLite database | ❌ no |
| Repetition scrubbing (`collapseRepeats`) | Local JS | ❌ no |

### The one-time model download

On first launch, VoxFlow downloads `ggml-large-v3-turbo.bin` (~1.5 GB) from `huggingface.co/ggerganov/whisper.cpp`. This is a one-way HTTP GET for a static file. No telemetry, no account required, no API key. The model file is then cached at `~/Library/Application Support/VoxFlow/models/` and reused forever.

After the download, VoxFlow makes **no network calls** when transcribing.

## Opt-in: cloud providers

Two features are deliberately *off* by default but can be enabled if you want them. When either is active, VoxFlow surfaces a visible indicator in the popover (an orange "Cloud" badge) so you always know when data is leaving your machine.

### Groq Whisper API (opt-in cloud transcription)

- **How to enable**: set `GROQ_API_KEY` and `VOXFLOW_TRANSCRIPTION_PROVIDER=groq` in `.env`.
- **What leaves your machine**: the raw WAV audio of each dictation, uploaded to `api.groq.com`.
- **Groq's stated retention**: [per their docs](https://console.groq.com/docs/your-data) they do not train on submitted audio and discard inputs/outputs when the request completes. They support Zero Data Retention on request for customers who want the reliability/abuse-monitoring caches disabled too.
- **Why you might want this**: faster first-run experience (no 1.5 GB download), or if `whisper.cpp` can't run well on your hardware.

### AWS Bedrock Haiku cleanup (opt-in LLM text refinement)

- **How to enable**: set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in `.env`.
- **What leaves your machine**: the *transcribed text* (not audio) of each dictation, sent to AWS Bedrock for punctuation/grammar cleanup.
- **AWS's stated retention**: subject to your AWS account's data agreement.
- **Why you might want this**: nicer punctuation and capitalization on long-form dictations. Raw Whisper output is already quite clean, so most users don't need this.

## Verifying the "no network" claim yourself

Run the app while watching outbound traffic:

```bash
# macOS built-in — shows every network call VoxFlow makes
sudo lsof -i -n -P -c VoxFlow
```

or use [Little Snitch](https://www.obdev.at/products/littlesnitch/) / [Radio Silence](https://radiosilenceapp.com/) to block VoxFlow at the firewall level and confirm dictation still works.

## What's in the SQLite database

`~/Library/Application Support/VoxFlow/voxflow.sqlite` contains:

- **`corrections`** table: every transcription you've ever done (original + corrected text + app name + timestamp).
- **`dictionary`** table: your personal pattern→replacement rules.
- **`settings`** table: cleanup-enabled toggle, hotkey override, language preference.

Delete that file to wipe your VoxFlow history. The app will recreate an empty schema on next launch.

## What's in `/tmp/voxflow-diag.log`

A state trace of the pipeline (which states fired, when, any errors). Useful for debugging. Does **not** contain audio, transcribed text, or any personally-identifying data beyond the local process ID and timestamps. Safe to share when reporting bugs.

## Reporting a privacy issue

If you find any code path that sends data off the machine without a clearly-labeled cloud toggle, please open an issue with the specific code location. That's a bug, not a feature.
