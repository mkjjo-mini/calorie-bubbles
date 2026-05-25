/**
 * dom-to-image-more 타입 stub.
 * 공식 d.ts 없음 — share-story에서 쓰는 API만 정의.
 */
declare module "dom-to-image-more" {
  interface DomToImageOptions {
    width?: number;
    height?: number;
    style?: Partial<CSSStyleDeclaration> | Record<string, string>;
    quality?: number;
    bgcolor?: string;
    cacheBust?: boolean;
    imagePlaceholder?: string;
    filter?: (node: Node) => boolean;
  }

  interface DomToImage {
    toPng(node: Node, options?: DomToImageOptions): Promise<string>;
    toJpeg(node: Node, options?: DomToImageOptions): Promise<string>;
    toBlob(node: Node, options?: DomToImageOptions): Promise<Blob>;
    toSvg(node: Node, options?: DomToImageOptions): Promise<string>;
    toCanvas(node: Node, options?: DomToImageOptions): Promise<HTMLCanvasElement>;
    toPixelData(node: Node, options?: DomToImageOptions): Promise<Uint8ClampedArray>;
  }

  const domtoimage: DomToImage;
  export default domtoimage;
  export = domtoimage;
}
