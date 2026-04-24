// CGEventTap subprocess. Electron's globalShortcut.register fires only on
// key-down, which forces a toggle UX. Wispr-style press-and-hold needs both
// edges, so we install a session-level event tap here and print "down\n"
// when ⌘⇧Space presses and "up\n" when any of that combo releases.
//
// Parent (VoxFlow main process) spawns this binary, reads stdout, and drives
// pipeline.begin() / pipeline.finish() on each edge. Requires Accessibility
// — inherits the parent's TCC grant because this binary is ad-hoc signed
// with a stable identifier and lives inside the signed VoxFlow.app bundle.
#include <ApplicationServices/ApplicationServices.h>
#include <signal.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

static const CGKeyCode kVK_Space = 49;
static bool sHeld = false;

static bool comboActive(CGEventFlags flags, CGKeyCode keyCode) {
    bool cmd   = (flags & kCGEventFlagMaskCommand) != 0;
    bool shift = (flags & kCGEventFlagMaskShift)   != 0;
    return cmd && shift && keyCode == kVK_Space;
}

static void emit(const char *edge) {
    // Ignore SIGPIPE so a broken stdout kills us via EPIPE instead of crash.
    fputs(edge, stdout);
    fputc('\n', stdout);
    fflush(stdout);
}

static CGEventRef callback(CGEventTapProxy proxy, CGEventType type,
                           CGEventRef event, void *info) {
    (void)proxy; (void)info;

    CGEventFlags flags = CGEventGetFlags(event);
    CGKeyCode keyCode =
        (CGKeyCode)CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode);

    if (type == kCGEventKeyDown) {
        if (comboActive(flags, keyCode)) {
            // Emit "down" only on the first press, but swallow ALL subsequent
            // keyDown repeats for this combo — otherwise macOS auto-repeat
            // leaks space characters through to the focused app while you're
            // holding the hotkey to dictate.
            if (!sHeld) {
                sHeld = true;
                emit("down");
            }
            return NULL;
        }
    } else if (type == kCGEventKeyUp) {
        if (sHeld && keyCode == kVK_Space) {
            sHeld = false;
            emit("up");
            return NULL;
        }
    } else if (type == kCGEventFlagsChanged) {
        // Modifier released while user was holding space — treat as release.
        if (sHeld) {
            bool cmd   = (flags & kCGEventFlagMaskCommand) != 0;
            bool shift = (flags & kCGEventFlagMaskShift)   != 0;
            if (!cmd || !shift) {
                sHeld = false;
                emit("up");
            }
        }
    } else if (type == kCGEventTapDisabledByTimeout ||
               type == kCGEventTapDisabledByUserInput) {
        // Re-enable if the system timed us out (happens under load).
        fprintf(stderr, "key-listener: tap disabled, re-enabling\n");
        return event;
    }

    return event;
}

int main(void) {
    signal(SIGPIPE, SIG_DFL);

    // Fail fast if Accessibility isn't granted so the parent can surface it.
    const void *keys[]   = { kAXTrustedCheckOptionPrompt };
    const void *values[] = { kCFBooleanTrue };
    CFDictionaryRef opts = CFDictionaryCreate(
        NULL, keys, values, 1,
        &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    bool trusted = AXIsProcessTrustedWithOptions(opts);
    CFRelease(opts);
    if (!trusted) {
        fprintf(stderr, "key-listener: Accessibility not granted\n");
        return 10;
    }

    CGEventMask mask = CGEventMaskBit(kCGEventKeyDown)
                     | CGEventMaskBit(kCGEventKeyUp)
                     | CGEventMaskBit(kCGEventFlagsChanged);

    CFMachPortRef tap = CGEventTapCreate(
        kCGSessionEventTap,
        kCGHeadInsertEventTap,
        kCGEventTapOptionDefault,
        mask, callback, NULL);
    if (!tap) {
        fprintf(stderr, "key-listener: CGEventTapCreate failed\n");
        return 2;
    }

    CFRunLoopSourceRef src =
        CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0);
    CFRunLoopAddSource(CFRunLoopGetCurrent(), src, kCFRunLoopCommonModes);
    CGEventTapEnable(tap, true);

    // Tell the parent we're ready so it can stop the globalShortcut fallback.
    emit("ready");

    CFRunLoopRun();
    return 0;
}
