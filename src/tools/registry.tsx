import { lazy, type ComponentType } from "react";

type ToolComponent = ComponentType<Record<string, never>>;

// PDF
const MergePdf = lazy(() => import("./pdf/MergePdf"));
const SplitPdf = lazy(() => import("./pdf/SplitPdf"));
const JpgToPdf = lazy(() => import("./pdf/JpgToPdf"));
const ReorderPdf = lazy(() => import("./pdf/ReorderPdf"));
const DeletePdfPages = lazy(() => import("./pdf/DeletePdfPages"));
const ExtractPdfPages = lazy(() => import("./pdf/ExtractPdfPages"));
const PageNumbers = lazy(() => import("./pdf/PageNumbers"));
const ProtectPdf = lazy(() => import("./pdf/ProtectPdf"));
const SignPdf = lazy(() => import("./pdf/SignPdf"));
const ComparePdfs = lazy(() => import("./pdf/ComparePdfs"));

// Image
const CompressImage = lazy(() => import("./image/CompressImage"));
const CropImage = lazy(() => import("./image/CropImage"));
const RotateImage = lazy(() => import("./image/RotateImage"));
const ConvertImage = lazy(() => import("./image/ConvertImage"));
const AddTextImage = lazy(() => import("./image/AddTextImage"));
const SharpenImage = lazy(() => import("./image/SharpenImage"));
const BlurRegion = lazy(() => import("./image/BlurRegion"));
const ImageToPdf = lazy(() => import("./image/ImageToPdf"));
const QrCodeGen = lazy(() => import("./image/QrCode"));

// Audio
const TrimAudio = lazy(() => import("./audio/TrimAudio"));
const MergeAudio = lazy(() => import("./audio/MergeAudio"));
const VolumeChanger = lazy(() => import("./audio/VolumeChanger"));
const FadeAudio = lazy(() => import("./audio/FadeAudio"));

// Video
const CompressVideo = lazy(() => import("./video/CompressVideo"));
const RotateVideo = lazy(() => import("./video/RotateVideo"));
const RemoveAudio = lazy(() => import("./video/RemoveAudio"));
const ExtractAudio = lazy(() => import("./video/ExtractAudio"));
const PlaybackSpeed = lazy(() => import("./video/PlaybackSpeed"));
const ReverseVideo = lazy(() => import("./video/ReverseVideo"));
const LoopVideo = lazy(() => import("./video/LoopVideo"));
const TrimVideo = lazy(() => import("./video/TrimVideo"));
const CropVideo = lazy(() => import("./video/CropVideo"));
const MergeVideos = lazy(() => import("./video/MergeVideos"));


// Social
const YouTubeThumb = lazy(() => import("./social/YouTubeThumb"));

// Text
const WordCounter = lazy(() => import("./text/WordCounter"));
const PasswordGenerator = lazy(() => import("./text/PasswordGenerator"));

// Student
const CGPA = lazy(() => import("./student/CGPA"));
const MarksPercentage = lazy(() => import("./student/MarksPercentage"));
const Attendance = lazy(() => import("./student/Attendance"));

// Utility
const UnitConverter = lazy(() => import("./utility/UnitConverter"));
const CurrencyConverter = lazy(() => import("./utility/CurrencyConverter"));
const AgeCalculator = lazy(() => import("./utility/AgeCalculator"));
const EmiCalculator = lazy(() => import("./utility/EmiCalculator"));
const LoanCalculator = lazy(() => import("./utility/LoanCalculator"));
const PercentageCalculator = lazy(() => import("./utility/PercentageCalculator"));
const BmiCalculator = lazy(() => import("./utility/BmiCalculator"));
const TimezoneConverter = lazy(() => import("./utility/TimezoneConverter"));
const UrlShortener = lazy(() => import("./utility/UrlShortener"));
const DateDifference = lazy(() => import("./utility/DateDifference"));
const CountdownTimer = lazy(() => import("./utility/CountdownTimer"));
const Stopwatch = lazy(() => import("./utility/Stopwatch"));

export const TOOL_COMPONENTS: Record<string, ToolComponent> = {
  "merge-pdf": MergePdf,
  "split-pdf": SplitPdf,
  "jpg-to-pdf": JpgToPdf,
  "reorder-pdf": ReorderPdf,
  "delete-pdf-pages": DeletePdfPages,
  "extract-pdf-pages": ExtractPdfPages,
  "page-numbers": PageNumbers,
  "protect-pdf": ProtectPdf,
  "sign-pdf": SignPdf,
  "compare-pdfs": ComparePdfs,


  "compress-image": CompressImage,
  "crop-image": CropImage,
  "rotate-image": RotateImage,
  "convert-image": ConvertImage,
  "add-text-image": AddTextImage,
  "sharpen-image": SharpenImage,
  "blur-region": BlurRegion,
  "image-to-pdf": ImageToPdf,
  "qr-code": QrCodeGen,

  "compress-video": CompressVideo,
  "rotate-video": RotateVideo,
  "remove-audio": RemoveAudio,
  "extract-audio": ExtractAudio,
  "playback-speed": PlaybackSpeed,
  "reverse-video": ReverseVideo,
  "loop-video": LoopVideo,
  "trim-video": TrimVideo,
  "crop-video": CropVideo,
  "merge-video": MergeVideos,

  "trim-audio": TrimAudio,
  "merge-audio": MergeAudio,
  "volume-changer": VolumeChanger,
  "fade-audio": FadeAudio,

  "youtube-thumbnail": YouTubeThumb,

  "word-counter": WordCounter,
  "password-generator": PasswordGenerator,

  "cgpa-calculator": CGPA,
  "percentage-calculator-student": MarksPercentage,
  "attendance-calculator": Attendance,

  "unit-converter": UnitConverter,
  "currency-converter": CurrencyConverter,
  "age-calculator": AgeCalculator,
  "emi-calculator": EmiCalculator,
  "loan-calculator": LoanCalculator,
  "percentage-calculator": PercentageCalculator,
  "bmi-calculator": BmiCalculator,
  "timezone-converter": TimezoneConverter,
  "url-shortener": UrlShortener,
  "date-difference": DateDifference,
  "countdown-timer": CountdownTimer,
  "stopwatch": Stopwatch,
};