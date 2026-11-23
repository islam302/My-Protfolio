// Composite per-frame PNG overlays (ovNNN.png) onto a video. usage: swift composite-video.swift in.mp4 overlayDir out.mp4
import AVFoundation
import CoreImage
let args = CommandLine.arguments
let src = URL(fileURLWithPath: args[1]), dir = args[2], dst = URL(fileURLWithPath: args[3])
try? FileManager.default.removeItem(at: dst)
let asset = AVURLAsset(url: src)
let track = asset.tracks(withMediaType: .video)[0]
let size = track.naturalSize
let reader = try! AVAssetReader(asset: asset)
let out = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
reader.add(out)
let writer = try! AVAssetWriter(outputURL: dst, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: Int(size.width), AVVideoHeightKey: Int(size.height),
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 1_400_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel, AVVideoMaxKeyFrameIntervalKey: 12]])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: Int(size.width), kCVPixelBufferHeightKey as String: Int(size.height)])
writer.add(input); writer.shouldOptimizeForNetworkUse = true
reader.startReading(); writer.startWriting(); writer.startSession(atSourceTime: .zero)
let ctx = CIContext(options: [.workingColorSpace: NSNull(), .outputColorSpace: NSNull()])  // pass pixel values through untouched
var i = 0, used = 0
while let sb = out.copyNextSampleBuffer() {
  let pts = CMSampleBufferGetPresentationTimeStamp(sb)
  var img = CIImage(cvPixelBuffer: CMSampleBufferGetImageBuffer(sb)!, options: [.colorSpace: NSNull()])
  let path = String(format: "%@/ov%03d.png", dir, i)
  if FileManager.default.fileExists(atPath: path), let ov = CIImage(contentsOf: URL(fileURLWithPath: path), options: [.colorSpace: NSNull()]) {
    img = ov.composited(over: img); used += 1
  }
  while !input.isReadyForMoreMediaData { usleep(2000) }
  var pb: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
  ctx.render(img, to: pb!, bounds: CGRect(origin: .zero, size: size), colorSpace: nil)
  adaptor.append(pb!, withPresentationTime: pts)
  i += 1
}
input.markAsFinished()
let sem = DispatchSemaphore(value: 0)
writer.finishWriting { sem.signal() }; sem.wait()
print("frames", i, "overlaid", used, "status", writer.status.rawValue, writer.error as Any)
