# New Connections Onboarding — demo

A working demo of the **new energy connections** onboarding journey, styled after
the [Octopus Energy quote page](https://octopus.energy/quote/). One question per
screen, moving through sections, driven by the logic in the onboarding flowchart.

It's a front-end demo only — nothing is submitted or stored anywhere.

## How to run it

**No installation needed.** Just open `index.html` in any web browser
(double-click it, or drag it into a browser window). That's it.

## The files (what each part does)

| File | What it does |
|------|--------------|
| `index.html` | The page itself. Open this one. |
| `styles.css` | The Octopus-branded look (colours, cards, buttons). |
| `js/flow.js` | **The flowchart, in code.** Every screen and every "if yes go here / if no go there" decision lives here. This is the file to edit if you want to change the questions or the branching. |
| `js/simulate.js` | Fakes the systems that aren't built yet (the Kraken lookups and the meter-photo vision model). |
| `js/engine.js` | The behind-the-scenes machinery that shows each screen, handles the Back button, and remembers your answers. You shouldn't need to touch this. |

## The Demo Controls panel

Bottom-right corner: a **🎛️ Demo controls** button. Because the real Kraken
lookups and the photo vision model don't exist yet, these switches stand in for
them so you can steer the demo down any path.

Set them **before** you reach the relevant step. There's a set for electricity
and a set for gas (so "dual fuel" works fully):

- **MPxN found on Kraken?** — Found → carry on. Not found → hits the "contact your
  DNO/GDN" stop screen.
- **new_connection = TRUE?** — True → carry on. False → flags it for manual check
  but continues.
- **Address on record matches?** — Matches → carry on. Doesn't match → hits the
  "address mismatch" stop screen.
- **Vision model confidence** — High → carry on. Low → shows the "try a different
  photo or override" screen.

## Walking the paths

- **Happy path:** Domestic → Electricity → type any MPAN → (defaults are all set to
  carry on) → "Yes, installed" → add any photo → deadline → An individual → fill in
  details → occupied → PSR → accept terms → **success screen** with the payload that
  would be sent to Kraken.
- **Stops & flags:** flip the demo switches to reach each one. Also try the
  "I don't know my number" link, "No, not yet" on the supply-point question,
  "A business" billing, "unoccupied", "Non-domestic", and "I don't accept".
- **Dual fuel:** choose "Dual fuel" and it runs the whole supply/meter section for
  electricity first, then gas, before billing.

## One design decision worth knowing

If someone picks **"I don't know my number"** on the MPAN/MPRN screen, the demo
flags it for a manual check and skips straight to *"Is the supply point installed?"*
(with no number, there's nothing to look up or address-match). If you'd rather it
went somewhere else, that's a one-line change in `js/flow.js` (the `FLAG_UNSURE`
screen).
