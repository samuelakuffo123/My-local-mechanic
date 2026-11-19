const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const OUTPUT_SIZE = 320;
const MAX_DATA_URL_CHARS = 180_000;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("We couldn't read that photo. Try another one."));
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("We couldn't read that photo. Try another one."));
    };
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error("That image couldn't be opened. Choose a JPG, PNG, or WebP file."));
    image.onload = () => resolve(image);
    image.src = src;
  });
}

/** Crops and compresses a picked photo into a small, square profile avatar. */
export async function prepareProfileImage(file: File): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP photo.");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("Choose a photo smaller than 8 MB.");
  }

  const source = await readAsDataUrl(file);
  const image = await loadImage(source);
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  if (!side) throw new Error("That image appears to be empty. Choose another photo.");

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't resize photos right now.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  context.drawImage(
    image,
    (image.naturalWidth - side) / 2,
    (image.naturalHeight - side) / 2,
    side,
    side,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );

  for (const quality of [0.82, 0.68, 0.55]) {
    const output = canvas.toDataURL("image/jpeg", quality);
    if (output.length <= MAX_DATA_URL_CHARS) return output;
  }
  throw new Error("That photo is too detailed to store. Choose a simpler image.");
}
