import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const image = formData.get("image") as File | null;
    const mask = formData.get("mask") as File | null;
    const prompt =
      (formData.get("prompt") as string) ||
      "Regenerate the room background to look realistic and premium, but keep the door (leaf, frame, casing, glass, hardware) 100% untouched.";

    if (!image || !mask) {
      return NextResponse.json(
        { error: "image and mask are required" },
        { status: 400 }
      );
    }

    const resp = await openai.images.edit({
      model: "gpt-image-1",
      image,
      mask,
      prompt,
      size: "1024x1024",
      response_format: "b64_json",
    });

    const b64 = resp.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image returned");

    const bin = Buffer.from(b64, "base64");
    return new NextResponse(bin, { headers: { "Content-Type": "image/png" } });
  } catch (err: any) {
    console.error("compose error:", err?.message || err);
    return NextResponse.json(
      { error: "Failed to compose image" },
      { status: 500 }
    );
  }
}
