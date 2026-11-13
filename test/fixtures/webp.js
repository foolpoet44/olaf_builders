// 테스트용 최소 webp (1x1 무손실) — 실제 이미지 바이트
export const WEBP_1PX = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');
export const fakeWebp = (size = 0) => Buffer.concat([WEBP_1PX, Buffer.alloc(size)]);
