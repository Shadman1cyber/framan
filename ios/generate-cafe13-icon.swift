import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let size = 1024
let output = URL(fileURLWithPath: CommandLine.arguments[1])
let colorSpace = CGColorSpaceCreateDeviceRGB()
guard let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
                              bytesPerRow: 0, space: colorSpace,
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { fatalError("Canvas") }
context.setAllowsAntialiasing(true)
context.setShouldAntialias(true)

let cream = CGColor(colorSpace: colorSpace, components: [0.968, 0.925, 0.851, 1])!
let coffee = CGColor(colorSpace: colorSpace, components: [0.267, 0.133, 0.090, 1])!
context.setFillColor(cream)
context.fill(CGRect(x: 0, y: 0, width: size, height: size))

// Handle is drawn behind the cup so the two shapes read as one silhouette.
let handle = CGMutablePath()
handle.move(to: CGPoint(x: 633, y: 565))
handle.addCurve(to: CGPoint(x: 630, y: 420), control1: CGPoint(x: 793, y: 633), control2: CGPoint(x: 803, y: 398))
context.addPath(handle)
context.setStrokeColor(coffee)
context.setLineWidth(58)
context.setLineCap(.round)
context.strokePath()

let cup = CGMutablePath()
cup.move(to: CGPoint(x: 280, y: 615))
cup.addLine(to: CGPoint(x: 675, y: 615))
cup.addCurve(to: CGPoint(x: 624, y: 402), control1: CGPoint(x: 660, y: 465), control2: CGPoint(x: 648, y: 402))
cup.addQuadCurve(to: CGPoint(x: 348, y: 402), control: CGPoint(x: 485, y: 370))
cup.addCurve(to: CGPoint(x: 280, y: 615), control1: CGPoint(x: 315, y: 402), control2: CGPoint(x: 292, y: 530))
cup.closeSubpath()
context.addPath(cup)
context.setFillColor(coffee)
context.fillPath()

// Cream ellipse gives the cup a clean open rim at small icon sizes.
context.setFillColor(cream)
context.fillEllipse(in: CGRect(x: 316, y: 567, width: 324, height: 35))

let saucer = CGMutablePath()
saucer.move(to: CGPoint(x: 282, y: 324))
saucer.addQuadCurve(to: CGPoint(x: 690, y: 324), control: CGPoint(x: 486, y: 303))
context.addPath(saucer)
context.setStrokeColor(coffee)
context.setLineWidth(38)
context.setLineCap(.round)
context.strokePath()

for (x, drift) in [(410.0, -16.0), (528.0, 17.0)] {
    let steam = CGMutablePath()
    steam.move(to: CGPoint(x: x, y: 687))
    steam.addCurve(to: CGPoint(x: x + drift, y: 817),
                   control1: CGPoint(x: x + 39, y: 735), control2: CGPoint(x: x - 40, y: 771))
    context.addPath(steam)
    context.setStrokeColor(coffee)
    context.setLineWidth(27)
    context.setLineCap(.round)
    context.strokePath()
}

guard let image = context.makeImage(),
      let destination = CGImageDestinationCreateWithURL(output as CFURL, UTType.png.identifier as CFString, 1, nil) else { fatalError("PNG output") }
CGImageDestinationAddImage(destination, image, nil)
guard CGImageDestinationFinalize(destination) else { fatalError("PNG write") }

for path in CommandLine.arguments.dropFirst(2) {
    let splashSize = 2732
    guard let splash = CGContext(data: nil, width: splashSize, height: splashSize, bitsPerComponent: 8,
                                 bytesPerRow: 0, space: colorSpace,
                                 bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { fatalError("Splash canvas") }
    splash.setFillColor(cream)
    splash.fill(CGRect(x: 0, y: 0, width: splashSize, height: splashSize))
    splash.interpolationQuality = .high
    splash.draw(image, in: CGRect(x: 916, y: 916, width: 900, height: 900))
    guard let splashImage = splash.makeImage(),
          let splashDestination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil) else { fatalError("Splash PNG output") }
    CGImageDestinationAddImage(splashDestination, splashImage, nil)
    guard CGImageDestinationFinalize(splashDestination) else { fatalError("Splash PNG write") }
}
