// Sends Cmd+V via CGEventPost. Replaces the osascript→System Events path,
// which requires the Automation TCC grant; CGEventPost only needs
// Accessibility (granted to the parent .app bundle) and won't trigger the
// -1743 "Not authorized to send Apple events" denial.
#include <ApplicationServices/ApplicationServices.h>
#include <stdio.h>
#include <stdlib.h>

// Exit 10 signals "Accessibility not granted to this helper binary".
// MacKeystroke.ts maps this to AccessibilityPermissionError so TextInjector
// gracefully falls back to leaving text on the clipboard for ⌘V.
static int kExitNotTrusted = 10;

int main(void) {
    const CGKeyCode kVK_ANSI_V = 9;

    // CGEventPost silently no-ops when Accessibility is denied. Detect it
    // explicitly via AXIsProcessTrusted so the caller gets a real signal
    // instead of a phantom successful paste. Pass the prompt option so the
    // first call also shows the system dialog.
    const void *keys[]   = { kAXTrustedCheckOptionPrompt };
    const void *values[] = { kCFBooleanTrue };
    CFDictionaryRef opts = CFDictionaryCreate(
        NULL, keys, values, 1,
        &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    bool trusted = AXIsProcessTrustedWithOptions(opts);
    CFRelease(opts);
    if (!trusted) {
        fprintf(stderr, "paste-helper: Accessibility not granted to %s\n",
                getprogname());
        return kExitNotTrusted;
    }

    CGEventSourceRef source = CGEventSourceCreate(kCGEventSourceStateHIDSystemState);
    if (!source) {
        fprintf(stderr, "paste-helper: CGEventSourceCreate failed\n");
        return 2;
    }

    CGEventRef down = CGEventCreateKeyboardEvent(source, kVK_ANSI_V, true);
    CGEventRef up   = CGEventCreateKeyboardEvent(source, kVK_ANSI_V, false);
    if (!down || !up) {
        fprintf(stderr, "paste-helper: CGEventCreateKeyboardEvent failed\n");
        if (down) CFRelease(down);
        if (up) CFRelease(up);
        CFRelease(source);
        return 3;
    }

    CGEventSetFlags(down, kCGEventFlagMaskCommand);
    CGEventSetFlags(up,   kCGEventFlagMaskCommand);

    CGEventPost(kCGHIDEventTap, down);
    CGEventPost(kCGHIDEventTap, up);

    CFRelease(down);
    CFRelease(up);
    CFRelease(source);
    return 0;
}
