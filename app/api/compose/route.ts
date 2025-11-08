// app/api/compose/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import sharp from "sharp";

export const runtime = "nodejs";          // برای استفاده از SDK نودی
export const dynamic = "force-dynamic";   // جلوگیری از کش ناخواسته روی Vercel

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SIZE = 1024;

// تبدیل File (Web API) به Buffer
async function fileToBuffer(f: File | null): Promise<Buffer | null> {
  if (!f) return null;
  const ab = await f.arrayBuffer();
  return Buffer.from(ab);
}

// نرمال‌سازی: تبدیل به PNG و تغییر اندازه به 1024×1024
async function normalizeToPng1024(buf: Buffer): Promise<Buffer> {
  // fit: "cover" کمک می‌کند همیشه هم‌سایز شوند
  return sharp(buf).resize(SIZE, SIZE, { fit: "cover" }).png().toBuffer();
}

export async function POST(req: Request) {
  try {
    // --- 1) خواندن فرم دیتا
    const form = await req.formData();

    const prompt = (form.get("prompt") as string) ?? "";
    const size = ((form.get("size") as string) || "1024x1024").toLowerCase();
    // انتظار: "1024x1024"  (با sharp نیز 1024 می‌کنیم تا هم‌سایز باشند)

    // image (ضروری) و mask (توصیه‌شده)
    const imageFile = form.get("image") as unknown as File | null;
    const maskFile = form.get("mask") as unknown as File | null;

    if (!imageFile) {
      return NextResponse.json(
        { error: "Missing image file (field name: image)" },
        { status: 400 }
      );
    }

    // --- 2) تبدیل به Buffer
    const imageBuf = await fileToBuffer(imageFile);
    if (!imageBuf) {
      return NextResponse.json({ error: "Invalid image buffer" }, { status: 400 });
    }

    // mask اختیاری است؛ اگر ارسال شده، تبدیلش می‌کنیم
    const maskBuf = maskFile ? await fileToBuffer(maskFile) : null;

    // --- 3) نرمال‌سازی به PNG 1024×1024 (برای جلوگیری از خطاهای رایج)
    const imagePng = await normalizeToPng1024(imageBuf);
    const maskPng = maskBuf ? await normalizeToPng1024(maskBuf) : null;

    // ⚠️ نکته مهم در مورد ماسک OpenAI:
    // در inpainting، ناحیه‌ی "شفاف (transparent)" ویرایش می‌شود و نواحی رنگی/مات دست‌نخورده می‌مانند.
    // اگر در UI شما "در" باید محافظت شود، باید آن قسمت در ماسک مات/رنگی باشد و پس‌زمینه شفاف بماند.
    // این فایل ماسک را دستکاری نمی‌کند و همان ورودی را (پس از نرمال‌سازی) می‌فرستد.

    // --- 4) ساخت ورودی‌ها برای SDK
    const imageForApi = await toFile(imagePng, "image.png");
    const opts: any = {
      model: "gpt-image-1",
      image: imageForApi,
      prompt,
      size, // "1024x1024"
      response_format: "b64_json",
    };

    if (maskPng) {
      const maskForApi = await toFile(maskPng, "mask.png");
      opts.mask = maskForApi;
    }

    // --- 5) فراخوانی OpenAI
    const result = await openai.images.edits(opts);

    if (!result?.data?.[0]?.b64_json) {
      return NextResponse.json(
        { error: "No image returned from OpenAI" },
        { status: 502 }
      );
    }

    // --- 6) پاسخ موفق
    return NextResponse.json({
      image: result.data[0].b64_json,
      size,
    });
  } catch (err: any) {
    // گزارش خطای واضح روی سرور + بازگرداندن به فرانت
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
