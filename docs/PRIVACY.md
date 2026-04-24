# Privacy

VoxFlow runs entirely on your Mac. There is no cloud component, no account, no API key. No audio you dictate is ever transmitted anywhere. Full stop.

## TL;DR

- Audio is captured by the OS, processed on-device by `whisper.cpp`, and written to your clipboard. Nothing leaves the machine.
- Transcription history, personal dictionary, and settings live in a local SQLite database (`~/Library/Application Support/VoxFlow/voxflow.sqlite`). Delete that file to wipe everything.
- The only outbound network request the app makes is a one-time download of the Whisper model file (~1.5 GB) from Hugging Face on first launch.
- No telemetry. No analytics. No crash reports sent anywhere. The diagnostic log at `/tmp/voxflow-diag.log` stays on your machine.

## Data flow inventory

| Component | Where it runs | Network? |
|---|---|---|
| Microphone capture | Your Mac, via `node-mic` + Homebrew `sox` | ❌ |
| Speech-to-text | Your Mac, in-process via `whisper.cpp` (`smart-whisper` bindings) with Metal/Neural Engine acceleration | ❌ |
| Hotkey detection | Your Mac, in-process `CGEventTap` (`uiohook-napi`) | ❌ |
| Auto-paste (`⌘V`) | Your Mac, in-process `CGEventPost` (`robotjs`) | ❌ |
| Transcription history | Local SQLite file | ❌ |
| Personal dictionary | Local SQLite file | ❌ |
| Settings | Local SQLite file | ❌ |
| Repetition scrubbing | Local JS (`collapseRepeats`) | ❌ |
| Diagnostic log | Local file at `/tmp/voxflow-diag.log` | ❌ |

## The one network call

On first launch (and only on first launch), VoxFlow downloads `ggml-large-v3-turbo.bin` from `huggingface.co/ggerganov/whisper.cpp`. This is a single HTTPS GET for a static file — no account, no telemetry, no session. The model is cached at `~/Library/Application Support/VoxFlow/models/` and reused forever.

If you want to stop even that call from happening, you can pre-stage the file yourself:

```bash
mkdir -p ~/Library/Application\ Support/VoxFlow/models
curl -L -o ~/Library/Application\ Support/VoxFlow/models/ggml-large-v3-turbo.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin
```

Then launch the app — it sees the file already exists and skips the download. From that point forward, the app never makes a network call.

## Verifying "no network" yourself

While VoxFlow is running and you're dictating:

```bash
# macOS built-in — every outbound socket used by VoxFlow
sudo lsof -i -n -P -c VoxFlow
```

You should see zero outbound connections during dictation. Cached model = no HTTP at all.

For a stricter test, block VoxFlow at the firewall and confirm dictation still works end-to-end:

- [Little Snitch](https://www.obdev.at/products/littlesnitch/): block VoxFlow's outbound rules
- [Radio Silence](https://radiosilenceapp.com/): add VoxFlow to the blocklist
- Or disconnect from the internet entirely — dictation will work exactly the same

## What's in the SQLite database

`~/Library/Application Support/VoxFlow/voxflow.sqlite` contains:

- **`corrections`** — every transcription you've done, with the app name you were focused on and a timestamp.
- **`dictionary`** — your personal pattern → replacement rules (e.g. `Kaden` → `Kayden`).
- **`settings`** — hotkey override, language preference.

Everything is plain text. Open it with any SQLite client (`sqlite3`, DB Browser for SQLite, etc.) and inspect. Delete the file to wipe all dictation history.

## The diagnostic log

`/tmp/voxflow-diag.log` records pipeline state transitions (recording → transcribing → idle), any errors, and basic timing. It does **not** contain audio, transcribed text, or any personally-identifying data beyond your local process ID and timestamps. Safe to share when reporting bugs.

## Reporting a privacy issue

If you find any code path that sends data off the machine, please open an issue with the specific code location. That's a bug, not a feature.
