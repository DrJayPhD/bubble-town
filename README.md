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

**The boat** floats at the top of the sea: swim up under its hull and climb the ladder onto an open
sea you can sail anywhere, seen from above (tap where to go) or in first person at the wheel. Dock at
five islands (Home Dock, Treasure Isle, Fisher's Port with a boat shop, Lighthouse Rock, Turtle Beach),
fish at bubbling spots for a fish book in English and Russian, photograph dolphins, the whale, turtles,
seals and gulls, race the buoys, and light the lighthouse to sail at sunset.

**At night** the boat shows tonight's real sky; tap 🔭 to drag around the stars and learn ten
constellations in English and Russian. The boat also has a radio (Bubble FM), a GPS with directions,
and a fish finder.

**Home and town:** there is a house beside the pool. Tap it to get in the car, or sail the boat to the
harbor on the coast and drive from there. The car drives itself along the roads to anywhere you tap
(📍 Places lists them all), or steer it yourself. Market Street has a **school** (counting, sums and
Russian numbers), a **church** (a Psalm verse each day, a candle to light, and bells to ring back in
order), a **grocery store** (shopping lists in Russian and English), a **dentist** (scrub away the
sugar bugs), an **ice-cream shop**, a **park** and **Gus's Gas** for when the tank runs low. Friendly
neighbors on Maple Lane each have a favor to ask (find Mrs. Rosa's cat, bring Grandpa Ivan bread, find
the twins' ball), Mo the mail carrier brings a Russian postcard every day, and every neighbor helped
counts on the treasure chart. Neighbors' lines are read aloud for younger players.

**Playing together:** in the Home dome, make a family code on one iPad and type it on the others.
Each iPad picks a different player: Diver One, Diver Two, **Papa**, **Mama** (grown-ups have their own
look and saves), or **A friend** (a visiting friend's iPad asks for the code on the title screen; several
friends can join, each iPad is its own friend). Everyone sees each other in Bubble Town and on the sea,
has a radar of where the others are (or what they are doing), can send waves and hearts, hop aboard
someone's boat, and talk through the iPads like walkie-talkies: hold 🎙️, or just talk when together in
the game. The iPads find each other through PeerJS's free public broker (a small introduction only);
game data and voice then go directly between them with WebRTC, so it works across the internet too.
On very strict networks a relay (TURN) may be needed: put a JSON list of ICE servers in
`localStorage['bubbletown.ice']`. Nothing is recorded. `vendor/peerjs.safari12.js` is PeerJS (MIT)
rebuilt for Safari 12.

**The treasure chart** (⭐ Chart) counts everything ever found: pearls, jewels, fossils and shells,
fish, photos, constellations, Russian letters, songs and adventures, with bronze, silver and gold
medals. Medals unlock prizes to wear (flower clip, sunglasses, tiara, captain's hat, crown).
Below it is a **good-habits chart** for real life (brushing teeth morning and bedtime, playing outside,
reading, helping): the child taps "I did it!" and a grown-up confirms, either with a grown-up PIN on
that iPad (set the first time behind a sum) or by tapping Yes on Papa's or Mama's own iPad. Stickers
give pearls, five in a day is a Super Day, and a week in a row earns a jewel.

**Keeping progress safe:** saves live on each iPad. Play from the Home Screen icon (Safari may clear
sites not opened for a week; Home Screen apps are kept). Connected family iPads each keep a copy of
the others' progress and give it back if one iPad loses it, and the Home dome has a backup code to copy
and paste back. After a long break the game says welcome back (with a gift after a week away).

**The shark**, once tamed, is a friend to ride, do tricks with, race through hoops (levels, more
pearls, and new outfits for her), and dress up in the Home dome.

**The Music Dome** has Follow the lights (colour keys for little ones), Read the note (staff-reading
levels), Learn a song (a scrolling staff that waits for each note; it can listen to a real piano)
and Free play.

**Cover Studio** (`studio/`) is a separate tool for grown-ups: it turns your own recordings into
piano sheet music. See `studio/README.md`.

Swim up the ladder at the top of the sea (or tap **⬆ Backyard**) to climb
back out and dig again.

Divers are called "Diver One" and "Diver Two" until you name them. Tap the pencil next to a
name to change it. Names and all save data live in `localStorage` on that device and are
never sent anywhere.

## On an iPad

Open the page in Safari, tap Share, then **Add to Home Screen**. It launches full screen
with no browser chrome.
