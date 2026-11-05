# Cover Studio

Turn your own songs (for example, ones made with Suno) into piano music, all inside the browser.

**Open it:** `studio/` on this site, for example `https://<your-pages-site>/studio/`.

1. Drop in the song. For best results also add stems: the **vocals** stem gives the melody,
   and the **bass** plus **instrumental/other** stems give the chords. Drums are ignored.
2. It finds the notes (Spotify's Basic Pitch model, running locally), the tempo, the key and the
   chords, then writes a piano cover: melody in the right hand, chords in the left.
3. Read it as **sheet music**, follow a **scrolling sheet**, or watch **falling notes** with a keyboard.
4. Change the **arrangement** (Easy / Medium / Full / every note), the **key** (transpose), the
   tempo and where beat 1 starts, and **fix any chord** by tapping it in the chord strip.
5. Turn on chord names and **Roman numerals** (I, IV, V…), then export a **PDF**, print it,
   or save **MIDI** or **MusicXML** (opens in MuseScore for detailed editing).
6. **Wait for me** listens through the microphone (or a MIDI keyboard where the browser supports it)
   and pauses until you play the next right-hand note on your piano.

Nothing is uploaded; songs you finish are saved in this browser so you can reopen them.

Third-party code in `vendor/`: Basic Pitch (Apache-2.0, see `LICENSE-basic-pitch.txt`) bundled with
TensorFlow.js (Apache-2.0), VexFlow 4 (MIT), jsPDF (MIT) and svg2pdf.js (MIT).
