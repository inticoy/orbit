// Named avatar silhouettes (a satellite's "shape" in the config). Paths fill a 100×100 box and are
// drawn with a round stroke of the same color `round` units wide, which softens and plumps the corners.
// `eyes` is where the two eyes center. Any other "shape" value is used as a CSS border-radius.
export const SHAPES = {
  rect: { d: "M10.3 10.3 H89.7 V89.7 H10.3 Z", eyes: [50.0, 50.0], round: 17.6 }, // 각진 사각형
  circle: { d: "M50 2 A48 48 0 1 1 49.9 2 Z", eyes: [50, 50], round: 0 }, // 원
  pin: { d: "M50.0 88.0 C50.0 88.0 17.7 63.3 17.7 42.4 C17.7 23.4 31.9 12.0 50.0 12.0 C68.1 12.0 82.3 23.4 82.3 42.4 C82.3 63.3 50.0 88.0 50.0 88.0 Z", eyes: [50.0, 42.4], round: 20.9 }, // 지도 핀
  drop: { d: "M50.0 12.0 C50.0 12.0 82.3 46.2 82.3 62.4 C82.3 78.5 68.1 88.0 50.0 88.0 C31.9 88.0 17.7 78.5 17.7 62.4 C17.7 46.2 50.0 12.0 50.0 12.0 Z", eyes: [50.0, 61.4], round: 20.9 }, // 물방울
  heart: { d: "M50.0 87.3 C24.8 69.9 10.2 56.3 10.2 36.9 C10.2 22.4 20.9 12.7 33.5 12.7 C41.3 12.7 47.1 16.5 50.0 23.3 C52.9 16.5 58.7 12.7 66.5 12.7 C79.1 12.7 89.8 22.4 89.8 36.9 C89.8 56.3 75.2 69.9 50.0 87.3 Z", eyes: [50.0, 44.7], round: 17.5 }, // 하트
  burst: { d: "M50.0 11.2 L61.6 19.6 L75.8 20.6 L79.1 34.4 L89.4 44.3 L83.1 57.1 L84.7 71.2 L71.7 77.0 L63.6 88.8 L50.0 84.9 L36.4 88.8 L28.3 77.0 L15.3 71.2 L16.9 57.1 L10.6 44.3 L20.9 34.4 L24.2 20.6 L38.4 19.6 Z", eyes: [50.0, 51.2], round: 18.2 }, // 톱니 배지
  sparkle: { d: "M50.0 13.4 Q59.2 40.8 86.6 50.0 Q59.2 59.2 50.0 86.6 Q40.8 59.2 13.4 50.0 Q40.8 40.8 50.0 13.4 Z", eyes: [50.0, 50.0], round: 23.8 }, // 네 꼭지 별
  hexagon: { d: "M50.0 13.9 L82.3 31.9 L82.3 68.1 L50.0 86.1 L17.7 68.1 L17.7 31.9 Z", eyes: [50.0, 50.0], round: 24.7 }, // 육각형
  octagon: { d: "M36.7 13.9 L63.3 13.9 L86.1 36.7 L86.1 63.3 L63.3 86.1 L36.7 86.1 L13.9 63.3 L13.9 36.7 Z", eyes: [50.0, 50.0], round: 24.7 }, // 팔각형
  star: { d: "M50.0 13.1L63.6 35.3L88.7 41.3L71.9 61.0L73.9 86.9L50.0 77.0L26.1 86.9L28.1 61.0L11.3 41.3L36.4 35.3Z", eyes: [50.0, 57.4], round: 19.5 }, // 별
  magnifier: { d: "M5.7 45.3A39.6 39.6 0 1 0 84.9 45.3A39.6 39.6 0 1 0 5.7 45.3Z M71.4 81.8L81.8 94.3L94.3 81.8L81.8 71.4Z", eyes: [45.3, 45.3], round: 8.3 }, // 돋보기
  chamfer: { d: "M6.9 22.0L22.0 6.9L93.1 6.9L93.1 78.0L78.0 93.1L6.9 93.1Z", eyes: [50.0, 50.0], round: 10.8 }, // 모서리 두 개를 깎은 사각형
} as const;

export type ShapeName = keyof typeof SHAPES;
export const isShapeName = (value: string): value is ShapeName => Object.hasOwn(SHAPES, value);
