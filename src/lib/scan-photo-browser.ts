// A phone camera file can exceed the host's request-body limit. Send a bounded JPEG to the authenticated route.
// The server still validates actual bytes, decoded pixels, QR ownership and all family limits.
export async function prepareScanPhoto(file: File): Promise<Blob> {
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("size");
  const image = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    if (image.width * image.height > 48_000_000) throw new Error("image");
    const scale = Math.min(1, 2800 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("image");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.9, 0.8, 0.7]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= 3_500_000) return blob;
    }
    throw new Error("size");
  } finally { image.close(); }
}
