neon-jp.woff2: Noto Sans JP, weight 900 (Black), by Google / Adobe, licensed under the
SIL Open Font License 1.1 (https://openfontlicense.org). A subset: kana, ASCII and some
kanji, for the neon signs (src/render/ink/neon-text.ts). To add characters, fetch a new
subset from Google Fonts (css2?family=Noto+Sans+JP:wght@900&text=...) and replace the file.

sedgwick-ave-display.woff2: Sedgwick Ave Display, by Kevin Burke and Mirko Velimirovic,
licensed under the SIL Open Font License 1.1 (https://openfontlicense.org). Google Fonts'
latin subset, for the titles of the loading screen and the ESC menu (style.css).

archivo.woff2: Archivo, by Omnibus-Type, licensed under the SIL Open Font License 1.1.
Google Fonts' latin subset, variable weight (400 to 600 used), for the loading screen's
status line and the ESC menu's text (style.css). Fetch it again with
css2?family=Archivo:wght@400;500;600 (the latin block's file).

montserrat.woff2: Montserrat, by Julieta Ulanovsky and others, licensed under the SIL Open
Font License 1.1. Google Fonts' latin subset, variable weight (500 to 700 used), for the
in-game hints and toasts. Fetch it again with css2?family=Montserrat:wght@500..700 (the
latin block's file).

Hint fonts, for build mode's hints painted on walls (src/build/hint-fonts.ts), loaded only
in build mode. Each is a Google Fonts subset (css2?family=...&text=...): ASCII and a few
quotes and dashes.
- permanent-marker.woff2: Permanent Marker, by Font Diner (Apache License 2.0,
  https://www.apache.org/licenses/LICENSE-2.0)
- bangers.woff2: Bangers, by Vernon Adams (SIL Open Font License 1.1)
- inter-bold.woff2: Inter, weight 700 (Bold), by Rasmus Andersson (SIL Open Font License
  1.1); with arrows (←↑→↓) too, for signs
