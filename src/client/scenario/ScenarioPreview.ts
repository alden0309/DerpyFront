import { GameMapType } from "@openfront/engine-api/game/GameTypes";
import {
  ScenarioData,
  scenarioData,
} from "@openfront/engine-lib/scenario/ScenarioData";
import { scenarioTerritory } from "@openfront/engine-lib/scenario/ScenarioTerritory";
import { html, LitElement, PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { terrainMapFileLoader } from "../TerrainMapFileLoader";

/**
 * SCEN (r25): a Scenario's picture: its map with the starting borders, each
 * nation in its side's colour (neutrals in a sand colour), drawn from the
 * scenario's own data on the map's smallest layer (map16x). A click on a
 * nation picks it ("nation-picked", detail: the nation's key).
 */

const WATER: RGB = [22, 36, 54];
const IMPASSABLE: RGB = [92, 92, 92];
const NEUTRAL: RGB = [176, 160, 128];
const HIGHLIGHT: RGB = [255, 222, 89];

type RGB = [number, number, number];

interface Picture {
  width: number;
  height: number;
  /** 0: water or impassable; else 1 + the nation's index. */
  labels: Uint16Array;
  /** Per tile: 0 water, 1 land, 2 impassable. */
  kinds: Uint8Array;
}

// One picture per scenario for the page's life: the data never changes.
const pictures = new Map<string, Promise<Picture>>();

function hexRGB(hex: string): RGB {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

async function loadPicture(data: ScenarioData): Promise<Picture> {
  const files = terrainMapFileLoader.getMapData(data.map as GameMapType);
  const [manifest, bin] = await Promise.all([
    files.manifest(),
    files.map16xBin(),
  ]);
  const { width, height } = manifest.map16x;
  const kinds = new Uint8Array(width * height);
  for (let i = 0; i < kinds.length; i++) {
    const b = bin[i];
    const land = (b & 0x80) !== 0;
    kinds[i] = !land ? 0 : (b & 0x1f) === 31 ? 2 : 1;
  }
  const labels = scenarioTerritory(
    data,
    {
      width: () => width,
      height: () => height,
      isLand: (ref) => kinds[ref] !== 0,
      isImpassable: (ref) => kinds[ref] === 2,
    },
    4,
  );
  return { width, height, labels, kinds };
}

function picture(data: ScenarioData): Promise<Picture> {
  let p = pictures.get(data.id);
  if (p === undefined) {
    p = loadPicture(data);
    pictures.set(data.id, p);
    // A failed load is tried again next time.
    p.catch(() => pictures.delete(data.id));
  }
  return p;
}

@customElement("scenario-preview")
export class ScenarioPreview extends LitElement {
  @property({ type: String }) scenarioId = "";
  /** A nation drawn brighter, with a yellow edge (the one picked). */
  @property({ type: String }) highlight: string | null = null;
  /** Whether a click picks the nation under it. */
  @property({ type: Boolean }) pickable = false;
  /** The tallest the picture may be drawn, as a CSS length. */
  @property({ type: String }) maxHeight = "none";
  @state() private failed = false;
  @state() private aspect = "2 / 1";
  @query("canvas") private canvas?: HTMLCanvasElement;
  private pic: Picture | null = null;

  createRenderRoot() {
    return this;
  }

  protected updated(changed: PropertyValues<this>): void {
    if (changed.has("scenarioId")) {
      this.pic = null;
      void this.load();
    } else if (changed.has("highlight")) {
      this.draw();
    }
  }

  private async load() {
    const data = scenarioData(this.scenarioId);
    if (data === null) return;
    const id = this.scenarioId;
    try {
      const pic = await picture(data);
      if (id !== this.scenarioId) return;
      this.failed = false;
      this.pic = pic;
      this.aspect = `${pic.width} / ${pic.height}`;
      await this.updateComplete;
      this.draw();
    } catch (err) {
      console.warn("scenario picture failed", err);
      this.failed = true;
    }
  }

  private draw() {
    const pic = this.pic;
    const canvas = this.canvas;
    const data = scenarioData(this.scenarioId);
    if (pic === null || canvas === undefined || data === null) return;
    canvas.width = pic.width;
    canvas.height = pic.height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    const sideColor = new Map(data.sides.map((s) => [s.id, hexRGB(s.color)]));
    const colors: RGB[] = data.nations.map((n, i) => {
      const base =
        n.side === null ? NEUTRAL : (sideColor.get(n.side) ?? NEUTRAL);
      // A small shade per nation, so neighbours on a side stay apart.
      const shade = ((i * 37) % 5) * 6 - 12;
      const c = base.map((v) => Math.max(0, Math.min(255, v + shade))) as RGB;
      return n.key === this.highlight
        ? (c.map((v) => Math.min(255, v + 60)) as RGB)
        : c;
    });
    const hi =
      this.highlight === null
        ? 0
        : data.nations.findIndex((n) => n.key === this.highlight) + 1;
    const img = ctx.createImageData(pic.width, pic.height);
    const { width, height, labels, kinds } = pic;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const label = labels[i];
        let c: RGB;
        if (kinds[i] === 0) c = WATER;
        else if (label === 0) c = IMPASSABLE;
        else {
          c = colors[label - 1];
          const right = x + 1 < width ? labels[i + 1] : label;
          const down = y + 1 < height ? labels[i + width] : label;
          const edge =
            (right !== label && right !== 0) || (down !== label && down !== 0);
          if (hi !== 0 && label === hi) {
            const outside =
              right !== hi ||
              down !== hi ||
              (x > 0 && labels[i - 1] !== hi) ||
              (y > 0 && labels[i - width] !== hi);
            if (outside) c = HIGHLIGHT;
          } else if (edge) {
            c = c.map((v) => v * 0.6) as RGB;
          }
        }
        const o = i * 4;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  private onClick = (e: MouseEvent) => {
    if (!this.pickable || this.pic === null || this.canvas === undefined) {
      return;
    }
    const data = scenarioData(this.scenarioId);
    if (data === null) return;
    // The picture is fitted inside the canvas box (object-fit: contain).
    const rect = this.canvas.getBoundingClientRect();
    const fit = Math.min(
      rect.width / this.pic.width,
      rect.height / this.pic.height,
    );
    const left = rect.left + (rect.width - this.pic.width * fit) / 2;
    const top = rect.top + (rect.height - this.pic.height * fit) / 2;
    const x = Math.floor((e.clientX - left) / fit);
    const y = Math.floor((e.clientY - top) / fit);
    if (x < 0 || y < 0 || x >= this.pic.width || y >= this.pic.height) return;
    const label = this.pic.labels[y * this.pic.width + x];
    if (label === 0) return;
    this.dispatchEvent(
      new CustomEvent("nation-picked", {
        detail: data.nations[label - 1].key,
        bubbles: true,
        composed: true,
      }),
    );
  };

  render() {
    return html`<div
      class="relative w-full overflow-hidden rounded-lg border border-white/10 bg-[#162436]"
    >
      <canvas
        class="block w-full ${this.pickable ? "cursor-pointer" : ""}"
        style="aspect-ratio: ${this.aspect}; max-height: ${this
          .maxHeight}; object-fit: contain"
        @click=${this.onClick}
      ></canvas>
      ${this.failed
        ? html`<div
            class="absolute inset-0 flex items-center justify-center text-xs text-white/50"
          >
            …
          </div>`
        : null}
    </div>`;
  }
}
