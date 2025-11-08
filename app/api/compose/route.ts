// app/api/compose/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SIZE = 1024;

// تبدیل File مرورگر به Buffer
async function fileToBuffer(f: File | null): Promise<Buffer | null> {
  if (!f) return null;
  const ab = await f.arrayBuffer();
  return Buffer.from(ab);
}

// نرمال‌سازی تصویر به PNG و ۱۰۲۴×۱۰۲۴ پیکسل
async function normalizeToPng1024(buf: Buffer): Promise<Buffer> {
  return sharp(buf).resize(SIZE, SIZE, { fit: "cover" }).png().toBuffer();
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const prompt = (form.get("prompt") as string) ?? "";
    const size = ((form.get("size") as string) || "1024x1024").toLowerCase();
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
      return NextResponse.json(
        { error: "Invalid image buffer" },
        { status: 400 }
      );
    }
    const maskBuf = maskFile ? await fileToBuffer(maskFile) : null;

    // تبدیل و نرمال‌سازی به PNG ۱۰۲۴×۱۰۲۴
    const imagePng = await normalizeToPng1024(imageBuf);
    const maskPng = maskBuf ? await normalizeToPng1024(maskBuf) : null;

    // ساخت فایل‌های قابل ارسال به OpenAI
    const imageForApi = await toFile(imagePng, "image.png");
    const opts: any = {
      image: imageForApi,
      prompt: prompt,
      n: 1,
      size: size,
      model: "dall-e-2",   // مدل مناسب برای inpainting
    };
    if (maskPng) {
      const maskForApi = await toFile(maskPng, "mask.png");
      opts.mask = maskForApi;
    }

    // فراخوانی API ویرایش تصویر
    const result = await openai.images.edit(opts);

    // پاسخ پیش‌فرض یک URL است؛ آن را برمی‌گردانیم
    const url = result?.data?.[0]?.url;
    if (!url) {
      return NextResponse.json(
        { error: "No image returned from OpenAI" },
        { status: 502 }
      );
    }
    return NextResponse.json({ image: url, size });
  } catch (err: any) {
    console.error("Compose error:", err?.response?.data ?? err?.message ?? err);
    return NextResponse.json(
      {
        error:
          err?.response?.data?.error?.message ??
          err?.message ??
          "Compose failed",
      },
      { status: 400 }
    );
  }
}
