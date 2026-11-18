/*
  The top of a laptop's base: a keyboard and a trackpad in its colour. Our own plain
  design, drawn here, so no one's artwork is copied. The top of the picture is the
  hinge; the bottom is the front edge.
*/

const PIXELS_ACROSS = 1024;

const channels = (hex: string) => {
  const n = Number.parseInt(hex.replace("#", "").slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [154, 154, 158];
};

/** A colour moved towards black (negative) or white (positive) by `amount`, 0 to 1. */
const shade = (hex: string, amount: number) => {
  const target = amount < 0 ? 0 : 255;
  const [r, g, b] = channels(hex).map((c) => Math.round(c + (target - c) * Math.abs(amount)));
  return `rgb(${r}, ${g}, ${b})`;
};

const roundRect = (g: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
  g.beginPath();
  g.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2));
  g.fill();
};

/** Key widths for each row, in units of an ordinary key. Each row adds up to 15. */
const ROWS = [
  [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
  [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
  [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25],
  [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75],
  [1, 1, 1, 1.25, 5.5, 1.25, 1, 1, 1, 1],
];

const cache = new Map<string, HTMLCanvasElement>();

/** The deck's picture, `ratio` deep for each unit across. Kept: it never changes. */
export const deckPicture = (color: string, ratio: number) => {
  const key = `${color} ${ratio.toFixed(3)}`;
  const known = cache.get(key);
  if (known) return known;

  const canvas = document.createElement("canvas");
  const width = PIXELS_ACROSS;
  const height = Math.max(64, Math.round(PIXELS_ACROSS * ratio));
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d");
  if (!g) return canvas;

  // The metal, a touch lighter towards the front where it catches more light.
  const metal = g.createLinearGradient(0, 0, 0, height);
  metal.addColorStop(0, shade(color, -0.06));
  metal.addColorStop(1, shade(color, 0.06));
  g.fillStyle = metal;
  g.fillRect(0, 0, width, height);

  // The keyboard sits in a shallow well, back towards the hinge.
  const well = { x: width * 0.085, y: height * 0.07, width: width * 0.83, height: height * 0.44 };
  g.fillStyle = shade(color, -0.22);
  roundRect(g, well.x, well.y, well.width, well.height, width * 0.012);

  const gap = well.width * 0.006;
  const rowHeight = (well.height - gap * (ROWS.length + 1)) / ROWS.length;
  const unit = (well.width - gap) / 15;
  g.fillStyle = "#1C1C1E";
  ROWS.forEach((row, index) => {
    let x = well.x + gap;
    const y = well.y + gap + index * (rowHeight + gap);
    for (const size of row) {
      const keyWidth = size * unit - gap;
      roundRect(g, x, y, keyWidth, rowHeight, rowHeight * 0.12);
      x += size * unit;
    }
  });

  // The trackpad, centred, towards the front.
  const pad = { width: width * 0.4, height: height * 0.36 };
  const padX = (width - pad.width) / 2;
  const padY = height * 0.57;
  g.fillStyle = shade(color, -0.12);
  roundRect(g, padX - 2, padY - 2, pad.width + 4, pad.height + 4, width * 0.014);
  g.fillStyle = shade(color, -0.03);
  roundRect(g, padX, padY, pad.width, pad.height, width * 0.012);

  cache.set(key, canvas);
  return canvas;
};
