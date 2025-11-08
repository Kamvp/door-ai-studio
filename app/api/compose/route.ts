// app/api/compose/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SIZE = 1024;

/** Convert File (Web API) to Buffer */
async function fileToBuffer(f: File | null): Promise<Buffer | null> {
  if (!f) return null;
  const ab = await f.arrayBuffer();
  return Buffer.from(ab);
}

/** Normalize any image buffer to 1024×1024 PNG */
async function normalizeToPng1024(buf: Buffer): Promise<Buffer> {
  return sharp(buf).resize(SIZE, SIZE, { fit: "cover" }).png().toBuffer();
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const prompt = (form.get("prompt") as string) ?? "";
    const size = ((form.get("size") as string) || "1024x1024").toLowerCase();

    // files from the <input type="file">
    const imageFile = form.get("image") as unknown as File | null;
    const maskFile = form.get("mask") as unknown as File | null;

    if (!imageFile) {
      return NextResponse.json(
        { error: "Missing image file (field name: image)" },
        { status: 400 }
      );
    }

    const imageBuf = await fileToBuffer(imageFile);
    if (!imageBuf) {
      return NextResponse.json({ error: "Invalid image buffer" }, { status: 400 });
    }
    const maskBuf = maskFile ? await fileToBuffer(maskFile) : null;

    // ⬇️ Always deliver PNG 1024×1024 to OpenAI
    const imagePng = await normalizeToPng1024(imageBuf);
    const maskPng  = maskBuf ? await normalizeToPng1024(maskBuf) : null;

    // ⬇️ Force proper MIME so OpenAI never sees application/octet-stream
    const imageForApi = await toFile(imagePng, "image.png", { type: "image/png" });
    const opts: any = {
      model: "gpt-image-1",
      image: imageForApi,
      prompt,
      n: 1,
      size, // "1024x1024"
      // don't set response_format -> default is URL
    };
    if (maskPng) {
      const maskForApi = await toFile(maskPng, "mask.png", { type: "image/png" });
      opts.mask = maskForApi;
    }

    const result = await openai.images.edit(opts);

    const item = result?.data?.[0];
    const url = item?.url;
    const b64 = (item as any)?.b64_json;

    if (url) return NextResponse.json({ image: url, size });
    if (b64) return NextResponse.json({ image: `data:image/png;base64,${b64}`, size });

    return NextResponse.json(
      { error: "No image returned from OpenAI (empty response)" },
      { status: 502 }
    );
  } catch (err: any) {
    // Bubble up the exact reason to the UI
    const detail =
      err?.response?.data?.error?.message ??
      err?.message ??
      JSON.stringify(err);
    console.error("Compose error:", detail);
    return NextResponse.json({ error: String(detail) }, { status: err?.status ?? 400 });
  }
}
