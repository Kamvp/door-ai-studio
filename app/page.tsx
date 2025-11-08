"use client";
import React, { useMemo, useRef, useState } from "react";

type Decoded = { img: HTMLImageElement; w: number; h: number };

export default function Home() {
  const [srcDataURL, setSrcDataURL] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [prompt, setPrompt] = useState(
    "Regenerate the room background to look realistic and premium, but keep the door (leaf, frame, casing, glass, hardware) untouched."
  );
  const [boxW, setBoxW] = useState(45); // % of width for protected box
  const [boxH, setBoxH] = useState(80); // % of height for protected box
  const [outURL, setOutURL] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => setSrcDataURL(String(fr.result));
    fr.readAsDataURL(f);
  }

  async function loadFromURL() {
    if (!urlInput) return;
    try {
      const resp = await fetch(urlInput);
      const blob = await resp.blob();
      const fr = new FileReader();
      fr.onload = () => setSrcDataURL(String(fr.result));
      fr.readAsDataURL(blob);
    } catch {
      alert("CORS/Network error. بهتر است تصویر را دانلود و Upload کنید.");
    }
  }

  async function compose() {
    if (!srcDataURL) return;
    setBusy(true);
    setOutURL(null);

    const original = await decodeImage(srcDataURL);
    const targetSize = 1024;
    const { imagePng } = renderSquare(original, targetSize);
    // white = editable, transparent = protected (door)
    const maskPng = renderMask(targetSize, targetSize, boxW / 100, boxH / 100);

    const fd = new FormData();
    fd.append("image", dataURLtoFile(imagePng, "image.png"));
    fd.append("mask", dataURLtoFile(maskPng, "mask.png"));
    fd.append("prompt", prompt);

    const resp = await fetch("/api/compose", { method: "POST", body: fd });
    if (!resp.ok) {
      setBusy(false);
      alert("Compose failed");
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    setOutURL(url);
    setBusy(false);
  }

  function downloadOutput() {
    if (!outURL) return;
    const a = document.createElement("a");
    a.href = outURL;
    a.download = "door-ai-studio.png";
    a.click();
  }

  return (
    <main className="min-h-screen p-6 flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Door-AI-Studio</h1>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Controls */}
        <div className="col-span-1 space-y-3 p-4 rounded-2xl border">
          <div className="space-y-2">
            <label className="font-medium">Upload from PC</label>
            <input type="file" accept="image/*" onChange={onPickFile} className="block w-full" />
          </div>

          <div className="space-y-2">
            <label className="font-medium">Or from URL</label>
            <div className="flex gap-2">
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/door.jpg"
                className="flex-1 border rounded px-2 py-1"
              />
              <button onClick={loadFromURL} className="px-3 py-1 rounded bg-black text-white">
                Load
              </button>
            </div>
            <p className="text-xs text-gray-500">(اگر CORS خطا داد، تصویر را دانلود و Upload کن)</p>
          </div>

          <div className="space-y-2">
            <label className="font-medium">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="w-full border rounded px-2 py-1"
            />
          </div>

          <div className="space-y-1">
            <label className="font-medium">Protected Box Width: {boxW}%</label>
            <input
              type="range"
              min={20}
              max={80}
              value={boxW}
              onChange={(e) => setBoxW(parseInt(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="space-y-1">
            <label className="font-medium">Protected Box Height: {boxH}%</label>
            <input
              type="range"
              min={50}
              max={95}
              value={boxH}
              onChange={(e) => setBoxH(parseInt(e.target.value))}
              className="w-full"
            />
          </div>

          <button
            onClick={compose}
            disabled={!srcDataURL || busy}
            className="w-full py-2 rounded-2xl bg-black text-white disabled:opacity-50"
          >
            {busy ? "Composing…" : "Compose"}
          </button>
        </div>

        {/* Original */}
        <div className="col-span-1 p-4 rounded-2xl border">
          <h3 className="font-semibold mb-2">Original (scaled to 1024x1024)</h3>
          <PreviewWithBox src={srcDataURL} boxW={boxW} boxH={boxH} />
        </div>

        {/* Output */}
        <div className="col-span-1 p-4 rounded-2xl border">
          <h3 className="font-semibold mb-2">Output</h3>
          {outURL ? (
            <div className="space-y-3">
              <img src={outURL} alt="Output" className="w-full rounded" />
              <button onClick={downloadOutput} className="w-full py-2 rounded-2xl bg-black text-white">
                Download PNG
              </button>
            </div>
          ) : (
            <div className="text-sm text-gray-500">No output yet.</div>
          )}
        </div>
      </div>
    </main>
  );
}

/** Helpers **/
function dataURLtoFile(dataurl: string, filename: string): File {
  const arr = dataurl.split(",");
  const mime = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new File([u8arr], filename, { type: mime });
}

async function decodeImage(dataURL: string) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = dataURL;
  await new Promise((res, rej) => {
    img.onload = () => res(null);
    img.onerror = rej;
  });
  return { img, w: img.naturalWidth, h: img.naturalHeight };
}

// draw original inside square 1024x1024 (letterbox) → return PNG dataURL
function renderSquare(original: { img: HTMLImageElement; w: number; h: number }, size: number) {
  const cnv = document.createElement("canvas");
  cnv.width = size;
  cnv.height = size;
  const ctx = cnv.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, size, size);

  const { w, h } = original;
  const s = Math.min(size / w, size / h);
  const dw = Math.round(w * s);
  const dh = Math.round(h * s);
  const dx = Math.round((size - dw) / 2);
  const dy = Math.round((size - dh) / 2);
  ctx.drawImage(original.img, dx, dy, dw, dh);

  return { imagePng: cnv.toDataURL("image/png") };
}

// Build alpha mask PNG: transparent (protected) center box, white elsewhere
function renderMask(W: number, H: number, boxW: number, boxH: number) {
  const cnv = document.createElement("canvas");
  cnv.width = W;
  cnv.height = H;
  const ctx = cnv.getContext("2d")!;
  ctx.fillStyle = "rgba(255,255,255,1)"; // editable area
  ctx.fillRect(0, 0, W, H);

  const w = Math.round(W * boxW);
  const h = Math.round(H * boxH);
  const x = Math.round((W - w) / 2);
  const y = Math.round((H - h) / 2);
  ctx.clearRect(x, y, w, h); // protected (door) → transparent

  return cnv.toDataURL("image/png");
}

function PreviewWithBox({ src, boxW, boxH }: { src: string | null; boxW: number; boxH: number }) {
  if (!src) return <div className="text-sm text-gray-500">No image.</div>;
  return (
    <div className="relative w-full">
      <img src={src} alt="original" className="w-full rounded" />
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div
          className="absolute border-2"
          style={{
            left: `${(100 - boxW) / 2}%`,
            top: `${(100 - boxH) / 2}%`,
            width: `${boxW}%`,
            height: `${boxH}%`,
          }}
        />
      </div>
    </div>
  );
}
