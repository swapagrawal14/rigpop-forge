# Face kit — Kiko the Cloud Shepherd

Style bible (repeat exactly in every generation): flat gouache poster style, cloud-white puffy afro, coral jacket, sky shorts.
Character: Kiko the Cloud Shepherd.
Ground: solid chroma green (#00FF00) background, no text, no watermark, no drop shadow, nothing touching the edges.
Reference: the head sheet (match its skin tone and head width).

Draw only face parts, each on its own, in reading order:
eyes open (pair), eyes half, eyes closed, eyes happy; mouths: A (open talk), E (wide), O (round), M (closed line), smile, laugh, frown, smirk.

Reading-order manifest:
`["eyes.open*2", "eyes.half*2", "eyes.closed*2", "eyes.happy*2", "mouth.A", "mouth.E", "mouth.O", "mouth.M", "mouth.smile", "mouth.laugh", "mouth.frown", "mouth.smirk"]`

These become the blink + lip-sync patches. A pack that ships without them animates and never speaks — Forge QA fails it.
