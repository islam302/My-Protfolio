// Re-encode a video with the same green→ETQAN-blue hue shift as recolor.py.
// usage: swift recolor-video.swift in.mp4 out.mp4
import AVFoundation
import CoreImage

let args = CommandLine.arguments
let src = URL(fileURLWithPath: args[1]), dst = URL(fileURLWithPath: args[2])
try? FileManager.default.removeItem(at: dst)

let LO = 55.0/255, HI = 135.0/255, FADE = 12.0/255, TARGET = 151.0/255, CENTER = 100.0/255
func weight(_ h: Double) -> Double {
  if h < LO - FADE || h > HI + FADE { return 0 }
  if h < LO { return (h - (LO - FADE)) / FADE }
  if h > HI { return ((HI + FADE) - h) / FADE }
  return 1
}
func rgb2hsv(_ r: Double, _ g: Double, _ b: Double) -> (Double, Double, Double) {
  let mx = max(r, g, b), mn = min(r, g, b), d = mx - mn
  var h = 0.0
  if d > 0 {
    if mx == r { h = ((g - b) / d).truncatingRemainder(dividingBy: 6) }
    else if mx == g { h = (b - r) / d + 2 } else { h = (r - g) / d + 4 }
    h /= 6; if h < 0 { h += 1 }
  }
  return (h, mx == 0 ? 0 : d / mx, mx)
}
func hsv2rgb(_ h: Double, _ s: Double, _ v: Double) -> (Double, Double, Double) {
  let i = floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s)
  switch Int(i) % 6 { case 0: return (v,t,p); case 1: return (q,v,p); case 2: return (p,v,t)
    case 3: return (p,q,v); case 4: return (t,p,v); default: return (v,p,q) }
}
let N = 64
var cube = [Float](repeating: 0, count: N*N*N*4)
for b in 0..<N { for g in 0..<N { for r in 0..<N {
  let (h, s, v) = rgb2hsv(Double(r)/Double(N-1), Double(g)/Double(N-1), Double(b)/Double(N-1))
  let w = weight(h)
  var h2 = h + w * (TARGET - CENTER); h2 = h2 - floor(h2)
  let (R, G, B) = hsv2rgb(h2, s * (1 - 0.08 * w), v)
  let o = ((b*N + g)*N + r) * 4
  cube[o] = Float(R); cube[o+1] = Float(G); cube[o+2] = Float(B); cube[o+3] = 1
}}}
let data = cube.withUnsafeBufferPointer { Data(buffer: $0) }

let asset = AVURLAsset(url: src)
let filter = CIFilter(name: "CIColorCubeWithColorSpace")!
filter.setValue(N, forKey: "inputCubeDimension")
filter.setValue(data, forKey: "inputCubeData")
filter.setValue(CGColorSpace(name: CGColorSpace.sRGB)!, forKey: "inputColorSpace")

let sem = DispatchSemaphore(value: 0)
AVVideoComposition.videoComposition(with: asset, applyingCIFiltersWithHandler: { req in
  let f = filter.copy() as! CIFilter
  f.setValue(req.sourceImage.clampedToExtent(), forKey: kCIInputImageKey)
  req.finish(with: f.outputImage!.cropped(to: req.sourceImage.extent), context: nil)
}) { comp, err in
  guard let comp = comp else { print("composition error", err as Any); exit(1) }
  let ex = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetHighestQuality)!
  ex.videoComposition = comp
  ex.outputURL = dst; ex.outputFileType = .mp4; ex.shouldOptimizeForNetworkUse = true
  ex.exportAsynchronously { print("status", ex.status.rawValue, ex.error as Any); sem.signal() }
}
sem.wait()
