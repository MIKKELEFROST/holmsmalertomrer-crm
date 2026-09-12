/**
 * Klientside billedkomprimering.
 *
 * Et kamerabillede fra en nyere telefon fylder 3-6 MB. Meick står typisk i en
 * indkørsel på mobildata, så billedet skrumpes til max 1600px på længste side
 * og JPEG-kvalitet 0.8 inden det uploades. Det tager en upload fra ~20
 * sekunder til under to.
 *
 * Skrevet uden bibliotek: createImageBitmap og canvas findes i alle browsere
 * appen understøtter, og det sparer en afhængighed på et par hundrede KB.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.8;

export async function compressImage(file: File): Promise<Blob> {
  // Er filen allerede lille, er der ikke noget at vinde ved at kode den om.
  if (file.size < 300_000 && file.type === "image/jpeg") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Formater browseren ikke kan afkode (fx HEIC på visse Android-enheder)
    // uploades som de er, frem for at fejle.
    return file;
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );

  // Hvis komprimeringen mod forventning gjorde filen større, behold originalen.
  if (!blob || blob.size >= file.size) return file;
  return blob;
}
