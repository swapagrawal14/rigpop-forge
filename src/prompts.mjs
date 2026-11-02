// Sheet-prompt generation. The image model paints the parts; Forge rigs them.
// Every prompt repeats the same style bible and passes the model sheet as the
// reference — the conventions rigpop-motion's autorig was built around:
//   - one pose = one generation (sheets of touching figures cannot be cut)
//   - chroma-green ground, no text, no shadows baked in
//   - the head sheet keeps a BLANK face; eyes/mouths arrive as a separate kit
//   - reading-order manifests describe what was drawn, e.g. "eyes.open*2"
export function sheetPrompts(m) {
  const bible = (m.style?.bible || 'bold black outlines, flat colours, big round eyes, hand-drawn doodle charm').trim();
  const palette = m.style?.palette?.length ? ` Palette: ${m.style.palette.join(', ')}.` : '';
  const who = `${m.name}${m.style?.outfit ? `, wearing ${m.style.outfit}` : ''}`;
  const base = `Style bible (repeat exactly in every generation): ${bible}.${palette}\nCharacter: ${who}.\nGround: solid chroma green (#00FF00) background, no text, no watermark, no drop shadow, nothing touching the edges.`;

  return {
    '00-model-sheet.md': `# Model sheet — ${m.name}\n\n${base}\n\nDraw ONE full-body front view of the character, standing straight, arms slightly away from the body, on the chroma-green ground. This single drawing is the reference every other sheet must match. Generate it first and pass it as the reference image to all sheets below.\n`,
    '01-head-sheet.md': `# Head sheet — ${m.name}\n\n${base}\nReference: the model sheet.\n\nDraw, as separate items in reading order (left to right, top to bottom):\n1. front head, BLANK face (skin only — no eyes, no mouth, no brows)\n2. three-quarter head, BLANK face\n3. any signature accessory (glasses, shades, hat) as its own item\n\nReading-order manifest (for the auto-cutter):\n\`["head.front", "head.34", "accessory"]\`\n`,
    '02-body-sheet.md': `# Body sheet — ${m.name}\n\n${base}\nReference: the model sheet.\n\nDraw each part SEPARATELY, limbs vertical, nothing overlapping, in reading order:\ntorso (with sleeves painted in, shoulders closed), upper arm, forearm, hand open, hand fist, hand pointing, thigh, shin, foot (side view).\n\nReading-order manifest:\n\`["torso", "arm.upper", "arm.fore", "hand.open", "hand.fist", "hand.point", "leg.thigh", "leg.shin", "foot"]\`\n`,
    '03-face-kit.md': `# Face kit — ${m.name}\n\n${base}\nReference: the head sheet (match its skin tone and head width).\n\nDraw only face parts, each on its own, in reading order:\neyes open (pair), eyes half, eyes closed, eyes happy; mouths: A (open talk), E (wide), O (round), M (closed line), smile, laugh, frown, smirk.\n\nReading-order manifest:\n\`["eyes.open*2", "eyes.half*2", "eyes.closed*2", "eyes.happy*2", "mouth.A", "mouth.E", "mouth.O", "mouth.M", "mouth.smile", "mouth.laugh", "mouth.frown", "mouth.smirk"]\`\n\nThese become the blink + lip-sync patches. A pack that ships without them animates and never speaks — Forge QA fails it.\n`,
    '04-talk-pack.md': `# Talk pack — ${m.name}\n\n${base}\nReference: the model sheet. Canvas ${m.talk.canvas.w}x${m.talk.canvas.h}, character centred on one floor line, same scale in every image. ONE generation per image:\n\n1. base — neutral standing pose, mouth closed (this is the canvas all patches sit on)\n2. pose wave — waving hello\n3. pose point — pointing at the viewer / at an idea\n4. pose open — both palms open, "why / what" shrug energy\n5. pose thumbs — thumbs up\n\nThen mark the mouth rect (A/O/E) and the blink rect on the base in rigpop-talk, or measure them from the face kit, and fill them into character.rigpop.json. \`rigpop-forge qa\` checks every patch image against its rect.\n`,
    '05-pose-pack.md': `# Pose packs — ${m.name}\n\n${base}\nReference: the model sheet.\n\nFor any action a puppet cannot sell (walk, jump, laugh, cook, dance): paint 4-8 FULL-BODY key poses of the action, ONE pose per generation, same scale, feet on one floor line. Name the pack after the action (\`poses/<action>/key0.png\`, \`key1.png\`, ...).\n\nLocomotion = flip-book, conversation = cut-out. That rule is the whole engine.\n`,
  };
}
