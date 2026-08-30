/** VideoSDK 返回的流可能是 MediaStream 或带 track 的包装对象，统一归一化 */
export function toMediaStream(stream: unknown): MediaStream | null {
  if (!stream) return null;
  if (typeof MediaStream !== "undefined" && stream instanceof MediaStream) {
    return stream;
  }
  const track = (stream as { track?: MediaStreamTrack } | null)?.track;
  return track ? new MediaStream([track]) : null;
}
