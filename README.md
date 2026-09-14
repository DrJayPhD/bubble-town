# Bubble Town

An underwater colony game that runs entirely in the browser. One HTML file, no build step,
no dependencies, no tracking, nothing stored anywhere but the player's own device.

Built to run on **iPadOS 12** as well as current browsers, which means:

- a shim that translates touch events into Pointer Events, since Safari had no Pointer
  Events before iOS 13 and every control in the game depends on them
- fixed-pixel CSS fallbacks behind an `@supports` guard, for Safari versions without
  `clamp()`, `inset` or flexbox `gap`
- reduced particle counts and a pixel ratio capped at 1 on those devices, so a 2013 A7
  is not asked to fill a retina canvas

## Playing it

Open `index.html`. Pick a diver, dig beside the pool, and swim.

Divers are called "Diver One" and "Diver Two" until you name them. Tap the pencil next to a
name to change it. Names and all save data live in `localStorage` on that device and are
never sent anywhere.

## On an iPad

Open the page in Safari, tap Share, then **Add to Home Screen**. It launches full screen
with no browser chrome.
