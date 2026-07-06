const clamp = (value: number): number => Math.max(0, Math.min(255, value))

const writePixel = (
  target: Uint8ClampedArray,
  index: number,
  y: number,
  u: number,
  v: number
): void => {
  const c = y - 16
  target[index] = clamp((298 * c + 409 * v + 128) >> 8)
  target[index + 1] = clamp((298 * c - 100 * u - 208 * v + 128) >> 8)
  target[index + 2] = clamp((298 * c + 516 * u + 128) >> 8)
  target[index + 3] = 255
}

export const convertUyvyToRgba = (
  source: Uint8Array,
  width: number,
  height: number,
  stride: number,
  target: Uint8ClampedArray
): void => {
  const rowStride = stride > 0 ? stride : width * 2
  let targetIndex = 0
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowStride
    for (let x = 0; x < width; x += 2) {
      const dataIndex = rowStart + x * 2
      if (dataIndex + 3 >= source.length) return
      const u = source[dataIndex] - 128
      const y0 = source[dataIndex + 1]
      const v = source[dataIndex + 2] - 128
      const y1 = source[dataIndex + 3]
      writePixel(target, targetIndex, y0, u, v)
      targetIndex += 4
      writePixel(target, targetIndex, y1, u, v)
      targetIndex += 4
    }
  }
}
