// Print per-frame eye positions (pixels, top-left origin) using Vision. usage: swift track.swift in.mp4
import AVFoundation
import Vision
let a = AVURLAsset(url: URL(fileURLWithPath: CommandLine.arguments[1]))
let tr = a.tracks(withMediaType: .video)[0]
let r = try! AVAssetReader(asset: a)
let out = AVAssetReaderTrackOutput(track: tr, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
r.add(out); r.startReading()
print("size", tr.naturalSize, "fps", tr.nominalFrameRate, "dur", CMTimeGetSeconds(a.duration))
var i = 0
while let sb = out.copyNextSampleBuffer() {
  let pb = CMSampleBufferGetImageBuffer(sb)!
  let W = Double(CVPixelBufferGetWidth(pb)), H = Double(CVPixelBufferGetHeight(pb))
  let t = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sb))
  let req = VNDetectFaceLandmarksRequest()
  try! VNImageRequestHandler(cvPixelBuffer: pb, options: [:]).perform([req])
  var line = String(format: "%d %.3f", i, t)
  if let f = req.results?.first, let lm = f.landmarks, let le = lm.leftEye, let re = lm.rightEye {
    func centre(_ r: VNFaceLandmarkRegion2D) -> (Double, Double) {
      let p = r.pointsInImage(imageSize: CGSize(width: W, height: H))
      let x = p.map { Double($0.x) }.reduce(0, +) / Double(p.count)
      let y = p.map { Double($0.y) }.reduce(0, +) / Double(p.count)
      return (x, H - y)
    }
    let l = centre(le), rr = centre(re)
    // Vision's "left" is the subject's left = viewer's right
    line += String(format: " viewerL %.2f %.2f viewerR %.2f %.2f conf %.2f", rr.0, rr.1, l.0, l.1, f.confidence)
  } else { line += " none" }
  print(line); i += 1
}
