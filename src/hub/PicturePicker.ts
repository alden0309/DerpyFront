// PROFILE (r26): choosing your picture, on your own page. Presets (some
// unlocked by badges), monogram colours, your own upload again, or a new
// upload. A new one is read by your browser (PNG, JPEG or WebP; never SVG),
// framed in a square crop box you can drag and zoom, drawn at 256 pixels
// and sent as a PNG; the server reads it again and keeps its own JPEG of it.

import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { avatar } from "../derpland/Avatar";
import { closeIcon, tickIcon } from "../derpland/Icons";
import {
  MONOGRAM_COLORS,
  monogramColor,
  PICTURE_ERROR_TEXT,
  PICTURE_GROUPS,
  type PictureError,
  PRESETS,
  presetUnlocked,
  unlockText,
  UPLOADS_PER_DAY,
} from "../derpland/Pictures";
import {
  choosePicture,
  myBadges,
  pictureStatus,
  uploadPicture,
} from "../derpland/ProfileApi";
import "./looks.css";

/** The picture sent: this many pixels square. */
export const OUT_SIZE = 256;
/** The largest file the browser will read (it's shrunk before it's sent). */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
/** What shows through a see-through picture (as the server lays it). */
const BACKDROP = "#2a2a30";

/** What a file is, by its first bytes: the kinds a picture may be. */
export function fileKind(head: Uint8Array): "png" | "jpeg" | "webp" | null {
  const a = (i: number, n: number) =>
    String.fromCharCode(...head.subarray(i, i + n));
  if (head[0] === 0x89 && a(1, 3) === "PNG") return "png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  if (a(0, 4) === "RIFF" && a(8, 4) === "WEBP") return "webp";
  return null;
}

/** Where the picture sits in the crop box: its top left and its scale. */
export interface Frame {
  x: number;
  y: number;
  scale: number;
}

/**
 * Keeps a picture covering the whole box: it can't be dragged or zoomed so
 * far that an edge shows.
 */
export function clampFrame(
  f: Frame,
  img: { w: number; h: number },
  box: number,
): Frame {
  const cover = Math.max(box / img.w, box / img.h);
  const scale = Math.max(cover, f.scale);
  const w = img.w * scale;
  const h = img.h * scale;
  return {
    scale,
    x: Math.min(0, Math.max(box - w, f.x)),
    y: Math.min(0, Math.max(box - h, f.y)),
  };
}

/** Zooms about a point of the box (the middle, the wheel, the pinch). */
export function zoomFrame(
  f: Frame,
  img: { w: number; h: number },
  box: number,
  scale: number,
  at: { x: number; y: number } = { x: box / 2, y: box / 2 },
): Frame {
  const k = scale / f.scale;
  return clampFrame(
    { scale, x: at.x - (at.x - f.x) * k, y: at.y - (at.y - f.y) * k },
    img,
    box,
  );
}

type Tab = "presets" | "upload";

@customElement("dl-picture-picker")
export class DerpPicturePicker extends LitElement {
  @property({ type: String }) username = "";
  @property({ attribute: false }) picture: string | null = null;

  @state() private tab: Tab = "presets";
  @state() private earned = new Set<string>();
  @state() private status: {
    blocked: boolean;
    left: number;
    upload: string | null;
  } | null = null;
  @state() private busy = false;
  @state() private error: string | null = null;
  @state() private lockedNote: string | null = null;
  /** The picture being framed. */
  @state() private img: ImageBitmap | HTMLImageElement | null = null;
  @state() private frame: Frame = { x: 0, y: 0, scale: 1 };

  @query("dialog") private dialog!: HTMLDialogElement;
  @query("canvas.dl-crop-canvas") private canvas?: HTMLCanvasElement;
  @query("input[type=file]") private fileInput?: HTMLInputElement;

  /** The crop box's side, in CSS pixels. */
  private box = 280;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchFrom: { d: number; scale: number } | null = null;

  createRenderRoot() {
    return this;
  }

  async open(tab: Tab = "presets"): Promise<void> {
    this.tab = tab;
    this.error = null;
    this.lockedNote = null;
    await this.updateComplete;
    if (!this.dialog.open) this.dialog.showModal();
    try {
      const [b, st] = await Promise.all([myBadges(), pictureStatus()]);
      this.earned = new Set(b.earned.map((e) => e.key));
      this.status = st;
    } catch {
      this.status ??= { blocked: false, left: UPLOADS_PER_DAY, upload: null };
    }
  }

  private close(): void {
    this.dialog.close();
    this.dropImage();
  }

  private dropImage(): void {
    if (this.img && "close" in this.img) this.img.close();
    this.img = null;
    this.pointers.clear();
    this.pinchFrom = null;
  }

  private fail(e: PictureError): void {
    this.error = PICTURE_ERROR_TEXT[e];
  }

  private async choose(ref: string | null): Promise<void> {
    this.busy = true;
    this.error = null;
    const r = await choosePicture(ref);
    this.busy = false;
    if ("error" in r) {
      this.fail(r.error);
      return;
    }
    this.picture = r.picture;
    this.close();
  }

  // ---------------------------------------------------------------- uploading

  private async pick(file: File | undefined): Promise<void> {
    this.error = null;
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return this.fail("too_large");
    const kind = fileKind(
      new Uint8Array(await file.slice(0, 16).arrayBuffer()),
    );
    if (kind === null) return this.fail("bad_type");
    let img: ImageBitmap | HTMLImageElement;
    try {
      // Turned the way the camera meant (its EXIF says), then forgotten.
      img = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      try {
        img = await loadImage(file);
      } catch {
        return this.fail("bad_image");
      }
    }
    const w = img.width;
    const h = img.height;
    if (Math.min(w, h) < 64) {
      if ("close" in img) img.close();
      return this.fail("too_small");
    }
    this.dropImage();
    this.img = img;
    this.frame = clampFrame({ x: 0, y: 0, scale: 0 }, { w, h }, this.box);
    // Start in the middle.
    const f = this.frame;
    this.frame = clampFrame(
      {
        ...f,
        x: (this.box - w * f.scale) / 2,
        y: (this.box - h * f.scale) / 2,
      },
      { w, h },
      this.box,
    );
  }

  private size() {
    return { w: this.img!.width, h: this.img!.height };
  }

  private minScale(): number {
    const { w, h } = this.size();
    return Math.max(this.box / w, this.box / h);
  }

  protected updated(): void {
    this.draw();
  }

  private draw(): void {
    const c = this.canvas;
    if (!c || !this.img) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const px = Math.round(this.box * dpr);
    if (c.width !== px) {
      c.width = px;
      c.height = px;
    }
    const g = c.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = BACKDROP;
    g.fillRect(0, 0, this.box, this.box);
    g.imageSmoothingQuality = "high";
    const { w, h } = this.size();
    const f = this.frame;
    g.drawImage(this.img, f.x, f.y, w * f.scale, h * f.scale);
  }

  /** The framed square, drawn at OUT_SIZE. */
  private async render256(): Promise<Blob | null> {
    if (!this.img) return null;
    const out = document.createElement("canvas");
    out.width = OUT_SIZE;
    out.height = OUT_SIZE;
    const g = out.getContext("2d");
    if (!g) return null;
    const k = OUT_SIZE / this.box;
    g.fillStyle = BACKDROP;
    g.fillRect(0, 0, OUT_SIZE, OUT_SIZE);
    g.imageSmoothingQuality = "high";
    const { w, h } = this.size();
    const f = this.frame;
    g.drawImage(this.img, f.x * k, f.y * k, w * f.scale * k, h * f.scale * k);
    return new Promise((resolve) => out.toBlob((b) => resolve(b), "image/png"));
  }

  private async send(): Promise<void> {
    this.busy = true;
    this.error = null;
    const png = await this.render256();
    if (!png) {
      this.busy = false;
      return this.fail("bad_image");
    }
    const r = await uploadPicture(png);
    this.busy = false;
    if ("error" in r) return this.fail(r.error);
    this.picture = r.picture;
    this.close();
  }

  private setZoom(scale: number, at?: { x: number; y: number }): void {
    if (!this.img) return;
    this.frame = zoomFrame(this.frame, this.size(), this.box, scale, at);
  }

  private local(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * this.box,
      y: ((e.clientY - r.top) / r.height) * this.box,
    };
  }

  private onDown = (e: PointerEvent) => {
    if (!this.img) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, this.local(e));
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchFrom = {
        d: Math.hypot(a.x - b.x, a.y - b.y),
        scale: this.frame.scale,
      };
    }
  };

  private onMove = (e: PointerEvent) => {
    const was = this.pointers.get(e.pointerId);
    if (!was || !this.img) return;
    const now = this.local(e);
    this.pointers.set(e.pointerId, now);
    if (this.pointers.size === 2 && this.pinchFrom) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.setZoom((this.pinchFrom.scale * d) / Math.max(1, this.pinchFrom.d), {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
      });
      return;
    }
    this.frame = clampFrame(
      {
        ...this.frame,
        x: this.frame.x + now.x - was.x,
        y: this.frame.y + now.y - was.y,
      },
      this.size(),
      this.box,
    );
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchFrom = null;
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.img) return;
    e.preventDefault();
    this.setZoom(
      this.frame.scale * Math.exp(-e.deltaY * 0.0015),
      this.local(e),
    );
  };

  private onKey = (e: KeyboardEvent) => {
    if (!this.img) return;
    const step = e.shiftKey ? 24 : 8;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      this.frame = clampFrame(
        { ...this.frame, x: this.frame.x + m[0], y: this.frame.y + m[1] },
        this.size(),
        this.box,
      );
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      this.setZoom(this.frame.scale * 1.15);
    } else if (e.key === "-") {
      e.preventDefault();
      this.setZoom(this.frame.scale / 1.15);
    }
  };

  // ---------------------------------------------------------------- render

  render(): TemplateResult {
    return html`<dialog
      class="dl-dialog dl-picker"
      aria-labelledby="dl-picker-h"
      @close=${() => this.dropImage()}
    >
      <header class="dl-dialog-head">
        <h2 class="dl-dialog-title" id="dl-picker-h">Your picture</h2>
        <button
          class="dl-dialog-x"
          aria-label="Close"
          @click=${() => this.close()}
        >
          ${closeIcon()}
        </button>
      </header>
      <div class="dl-seg small dl-picker-tabs" role="tablist">
        ${(
          [
            ["presets", "Pictures"],
            ["upload", "Upload your own"],
          ] as [Tab, string][]
        ).map(
          ([t, label]) =>
            html`<button
              role="tab"
              aria-selected=${this.tab === t}
              @click=${() => {
                this.tab = t;
                this.error = null;
              }}
            >
              ${label}
            </button>`,
        )}
      </div>
      ${this.error
        ? html`<p class="dl-picker-err" role="alert">${this.error}</p>`
        : nothing}
      <div class="dl-picker-body">
        ${this.tab === "presets" ? this.renderPresets() : this.renderUpload()}
      </div>
    </dialog>`;
  }

  private tile(
    ref: string | null,
    label: string,
    opts: { locked?: string } = {},
  ): TemplateResult {
    const on = ref === this.picture;
    return html`<li>
      <button
        class="dl-pick ${on ? "on" : ""} ${opts.locked ? "locked" : ""}"
        aria-pressed=${on}
        aria-label=${opts.locked ? `${label} (locked)` : label}
        title=${opts.locked ? `${label}: ${opts.locked}` : label}
        ?disabled=${this.busy}
        @click=${() => {
          if (opts.locked) this.lockedNote = `${label}. ${opts.locked}`;
          else void this.choose(ref);
        }}
      >
        ${avatar(this.username, ref, "dl-pick-tok")}
        ${on
          ? html`<span class="dl-pick-on" aria-hidden="true"
              >${tickIcon()}</span
            >`
          : nothing}
        ${opts.locked
          ? html`<span class="dl-pick-lock" aria-hidden="true"
              >${lockGlyph()}</span
            >`
          : nothing}
      </button>
    </li>`;
  }

  private renderPresets(): TemplateResult {
    const upload = this.status?.upload ?? null;
    const own = monogramColor(null, this.username);
    return html`
      ${this.lockedNote
        ? html`<p class="dl-picker-note" role="status">${this.lockedNote}</p>`
        : nothing}
      ${upload
        ? html`<h3 class="dl-pick-h">Your upload</h3>
            <ul class="dl-pick-grid">
              ${this.tile(upload, "Your own picture")}
            </ul>`
        : nothing}
      ${PICTURE_GROUPS.map(
        (g) =>
          html`<h3 class="dl-pick-h">${g.name}</h3>
            <ul class="dl-pick-grid">
              ${PRESETS.filter((p) => p.group === g.id).map((p) =>
                this.tile(`p:${p.id}`, p.name, {
                  locked: presetUnlocked(p, this.earned)
                    ? undefined
                    : unlockText(p),
                }),
              )}
            </ul>`,
      )}
      <h3 class="dl-pick-h">Your initial</h3>
      <ul class="dl-pick-grid">
        ${this.tile(null, "Your initial, in your own colour")}
        ${MONOGRAM_COLORS.map((c, i) =>
          // The colour your name picks is the tile before (unless worn).
          c === own && this.picture !== `m:${i}`
            ? nothing
            : this.tile(`m:${i}`, `Your initial on colour ${i + 1}`),
        )}
      </ul>
    `;
  }

  private renderUpload(): TemplateResult {
    const st = this.status;
    if (st?.blocked)
      return html`<p class="dl-picker-note">
        ${PICTURE_ERROR_TEXT.uploads_blocked}
      </p>`;
    const input = html`<input
      type="file"
      accept="image/png,image/jpeg,image/webp"
      hidden
      @change=${(e: Event) => {
        const el = e.target as HTMLInputElement;
        void this.pick(el.files?.[0]);
        el.value = "";
      }}
    />`;
    if (!this.img)
      return html`${input}
        <button
          class="dl-drop"
          @click=${() => this.fileInput?.click()}
          @dragover=${(e: DragEvent) => e.preventDefault()}
          @drop=${(e: DragEvent) => {
            e.preventDefault();
            void this.pick(e.dataTransfer?.files?.[0]);
          }}
        >
          <span class="dl-drop-big">Choose a picture</span>
          <span>or drop one here. PNG, JPEG or WebP.</span>
        </button>
        <p class="dl-picker-fine">
          You'll frame it next. It's kept small (256 pixels), and anything else
          in the file, like where a photo was taken, is left out. Keep it
          friendly: anyone can report a picture to the site's owner.
          ${st
            ? html`<b>${st.left} of ${UPLOADS_PER_DAY} uploads left today.</b>`
            : nothing}
        </p>`;
    const min = this.minScale();
    const max = min * 4;
    return html`${input}
      <div class="dl-crop">
        <div
          class="dl-crop-box"
          tabindex="0"
          role="application"
          aria-label="Your picture's frame: drag to move it, use the slider or the plus and minus keys to zoom"
          @pointerdown=${this.onDown}
          @pointermove=${this.onMove}
          @pointerup=${this.onUp}
          @pointercancel=${this.onUp}
          @wheel=${this.onWheel}
          @keydown=${this.onKey}
        >
          <canvas class="dl-crop-canvas"></canvas>
          <span class="dl-crop-ring" aria-hidden="true"></span>
        </div>
        <label class="dl-crop-zoom">
          <span>Zoom</span>
          <input
            type="range"
            min=${min}
            max=${max}
            step=${(max - min) / 200}
            .value=${String(this.frame.scale)}
            @input=${(e: Event) =>
              this.setZoom(Number((e.target as HTMLInputElement).value))}
          />
        </label>
        <p class="dl-picker-fine">
          Drag to move it. The circle is what shows beside your name.
        </p>
        <div class="dl-row dl-crop-acts">
          <button
            class="dl-btn"
            ?disabled=${this.busy}
            @click=${() => void this.send()}
          >
            ${this.busy ? "Saving…" : "Use this picture"}
          </button>
          <button
            class="dl-btn ghost"
            ?disabled=${this.busy}
            @click=${() => this.fileInput?.click()}
          >
            Choose another
          </button>
        </div>
      </div>`;
  }
}

function lockGlyph(): TemplateResult {
  return html`<svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="5" y="10.5" width="14" height="10" rx="2" fill="currentColor" />
    <path
      d="M8 10.5V8a4 4 0 0 1 8 0v2.5"
      fill="none"
      stroke="currentColor"
      stroke-width="2.4"
    />
  </svg>`;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable"));
    };
    img.src = url;
  });
}

declare global {
  interface HTMLElementTagNameMap {
    "dl-picture-picker": DerpPicturePicker;
  }
}
