# Round Timer

A boxing round timer built for a phone propped up across the gym: huge numbers, one-tap start, a real-sounding bell and a 10 second wooden clapper. It works offline and installs to your home screen.

Live: https://boxing-timer-two.vercel.app

## Features
- **Boxing sessions:** Amateur 3 × 3, Pro 12 × 3, Women's pro 10 × 2, Kids, Sparring, Heavy bag, Shadowboxing, Skipping and HIIT, plus your own saved sessions.
- **A sound for each moment:** round start bell, double bell for the last round, a wooden clapper 10 s before the bell, ding ding ding at round end, a "seconds out" buzzer before rest ends, and an electric bell at the finish. Every sound is synthesised in code (there are no audio files) and mastered to full volume. Pick each one on the Sounds screen.
- **Lock-screen mode:** the whole session is rendered into one audio track, so bells keep ringing with the screen locked or the app in the background.
- **Session options:** warm-up, cool-down, an extra warning marker and a custom rest label.
- **Offline and installable:** a service worker caches the app on first visit.
- **History and streak:** stored on the device only.
- **Themes:** dark, light or auto.

## Develop
No build step and no dependencies. Serve the folder over HTTP:

```
python3 -m http.server 5173
```

Run the tests with `node --test tests/*.test.js`. Regenerate the icons with `python3 tools/make-icons.py`, which needs Pillow.

When you change any app file, bump `VERSION` in `sw.js` so installed copies update.
