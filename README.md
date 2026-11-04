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

Open `index.html`. Pick a diver and you land in the backyard. Tap to dig beside the pool
until you hit water, then choose:

- **Dig the tunnels**: dig down through the ground to Bubble Town. Collect pearls, gems,
  shells and fossils, BONK the mud bugs into bubbles, and watch out for loose rocks.
  On Easy there is nothing to lose; on Advanced you have three hearts.
  A glowing crack in the right-hand wall leads sideways into the **Glow Maze**, a secret cave:
  collect every glow speck while pufferfish chase you, and grab a big pearl to turn the tables.
- **Dive right in**: straight down the shaft into the sea.

In Bubble Town, each dome opens behind a Russian word door. **Coral Run** (the crab dome) is a
whole side-scrolling world: run, double jump, bump clam blocks for pearls, bounce on
sponges, ride driftwood rafts, stomp or BONK crabs and jellies, and reach the Bubble Gate.

The **Snow Palace** dome holds **Crystal Drop**, a falling-blocks puzzle under sunken onion
domes, played to Russian music (the Sugar Plum Fairy from *The Nutcracker*, and the folk song
Korobeiniki). Each cleared row is counted in Russian. On Easy, a full well gets half washed away
instead of ending the game.

Swim up the ladder at the top of the sea (or tap **⬆ Backyard**) to climb
back out and dig again.

Divers are called "Diver One" and "Diver Two" until you name them. Tap the pencil next to a
name to change it. Names and all save data live in `localStorage` on that device and are
never sent anywhere.

## On an iPad

Open the page in Safari, tap Share, then **Add to Home Screen**. It launches full screen
with no browser chrome.
