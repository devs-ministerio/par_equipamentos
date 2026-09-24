export interface ImagemCapturada {
  dataUrl: string;
  aspectRatio: number; // largura / altura
}

/**
 * Serializa o <svg> dentro do container pra um PNG (via canvas offscreen).
 * O mapa do Brasil e desenhado pelo D3 direto no DOM (BrazilMap.tsx) -- jsPDF
 * so aceita imagem raster (PNG/JPEG) em addImage, entao precisa rasterizar
 * antes de embutir no PDF.
 */
export function svgParaPng(
  container: HTMLElement,
  escala = 2,
): Promise<ImagemCapturada | null> {
  const svgOriginal = container.querySelector("svg");
  if (!svgOriginal) return Promise.resolve(null);

  const svg = svgOriginal.cloneNode(true) as SVGSVGElement;
  const viewBox = svg.getAttribute("viewBox");
  const partes = viewBox ? viewBox.split(" ").map(Number) : [0, 0, 700, 520];
  const vbW = partes[2] || 700;
  const vbH = partes[3] || 520;
  // o svg original tem width="100%" (se adapta ao card na tela) -- pra
  // rasterizar isolado precisa de um tamanho absoluto em pixels.
  svg.setAttribute("width", String(vbW));
  svg.setAttribute("height", String(vbH));

  const svgString = new XMLSerializer().serializeToString(svg);
  const svgDataUrl =
    "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = vbW * escala;
      canvas.height = vbH * escala;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D indisponível"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve({
        dataUrl: canvas.toDataURL("image/png"),
        aspectRatio: vbW / vbH,
      });
    };
    img.onerror = () => reject(new Error("Falha ao rasterizar o mapa"));
    img.src = svgDataUrl;
  });
}
