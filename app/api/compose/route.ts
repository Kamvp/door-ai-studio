const result = await openai.images.edit({
  image: imageForApi,
  mask: maskForApi,
  prompt: prompt,
  n: 1,                    // تعداد خروجی
  size: size,              // مثلا "1024x1024"
  model: "dall-e-2",       // مدل مناسب برای inpainting
  // response_format را حذف کنید؛ مقدار پیش‌فرض URL است
});
