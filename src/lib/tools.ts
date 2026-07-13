import type { LucideIcon } from "lucide-react";
import {
  FileText, Image as ImageIcon, Music, Share2, GraduationCap, Type, Wrench,
  Merge, Scissors, FileArchive, FileImage, ListOrdered, Trash2, Files as FilesIcon, Lock, PenLine, GitCompare,
  FileDown, FileUp, Presentation,
  Crop, RotateCw, Repeat, Eraser, Focus, Sparkles, TextCursorInput, QrCode,
  Volume2, 
  Waves,
  Instagram, Youtube, Facebook, Twitter, Linkedin, Pin as PinIcon, ImagePlay, User,
  Type as TypeIcon, Hash, KeyRound,
  Ruler, Coins, Cake, Percent, Activity, Calculator, Globe, Link2, CalendarClock, Timer, TimerReset,
  Award, CalendarCheck, PiggyBank,
  Wallet, Banknote,
} from "lucide-react";

export type CategoryId =
  | "pdf" | "image" | "audio" | "social" | "student" | "text" | "utility" | "finance";

export interface Category {
  id: CategoryId;
  slug: string;
  name: string;
  tagline: string;
  icon: LucideIcon;
  color: string; // css var token name (cat-*)
  gradient: string; // tailwind gradient stops
}

export interface Tool {
  slug: string;
  name: string;
  description: string;
  category: CategoryId;
  icon: LucideIcon;
  status: "live" | "soon";
  keywords?: string[];
  popular?: boolean;
  featured?: boolean;
}

export const CATEGORIES: Category[] = [
  { id: "pdf", slug: "pdf", name: "PDF Utilities", tagline: "Merge, split, sign & secure documents", icon: FileText, color: "cat-pdf", gradient: "from-rose-500/15 to-orange-500/10" },
  { id: "image", slug: "images", name: "Image Utilities", tagline: "Compress, crop, convert & enhance", icon: ImageIcon, color: "cat-image", gradient: "from-sky-500/15 to-cyan-500/10" },
  { id: "audio", slug: "audio", name: "Audio Utilities", tagline: "Trim, merge, fade & adjust", icon: Music, color: "cat-audio", gradient: "from-amber-500/15 to-yellow-500/10" },
  { id: "social", slug: "social", name: "Social Media", tagline: "Downloaders & platform utilities", icon: Share2, color: "cat-social", gradient: "from-pink-500/15 to-fuchsia-500/10" },
  { id: "student", slug: "students", name: "Student Tools", tagline: "CGPA, attendance & marks", icon: GraduationCap, color: "cat-student", gradient: "from-emerald-500/15 to-teal-500/10" },
  { id: "text", slug: "text", name: "Text Tools", tagline: "Counters, generators & formatters", icon: Type, color: "cat-text", gradient: "from-slate-500/15 to-zinc-500/10" },
  { id: "utility", slug: "utilities", name: "Daily Utilities", tagline: "Calculators, converters & timers", icon: Wrench, color: "cat-utility", gradient: "from-violet-500/15 to-indigo-500/10" },
  { id: "finance", slug: "finance", name: "Finance Tools", tagline: "Calculators, trackers & savings vaults", icon: Banknote, color: "cat-finance", gradient: "from-emerald-500/15 to-amber-500/10" },
];

export const TOOLS: Tool[] = [
  // PDF
  { slug: "merge-pdf", name: "Merge PDFs", description: "Combine multiple PDFs into a single file.", category: "pdf", icon: Merge, status: "live", popular: true, featured: true, keywords: ["combine", "join"] },
  { slug: "split-pdf", name: "Split PDF", description: "Split a PDF into individual pages or ranges.", category: "pdf", icon: Scissors, status: "live", popular: true },
  { slug: "jpg-to-pdf", name: "JPG to PDF", description: "Convert images into a single PDF document.", category: "pdf", icon: FileImage, status: "live", keywords: ["image", "png"] },
  { slug: "reorder-pdf", name: "Reorder PDF Pages", description: "Rearrange pages inside a PDF.", category: "pdf", icon: ListOrdered, status: "live" },
  { slug: "delete-pdf-pages", name: "Delete PDF Pages", description: "Remove selected pages from a PDF.", category: "pdf", icon: Trash2, status: "live" },
  { slug: "extract-pdf-pages", name: "Extract PDF Pages", description: "Export specific pages as a new PDF.", category: "pdf", icon: FilesIcon, status: "live" },
  { slug: "page-numbers", name: "Add Page Numbers", description: "Stamp page numbers onto every page.", category: "pdf", icon: Hash, status: "live" },
  { slug: "protect-pdf", name: "Password Protect PDF", description: "Encrypt a PDF with a password.", category: "pdf", icon: Lock, status: "live" },
  { slug: "sign-pdf", name: "Digital Signature", description: "Draw a signature and stamp it on a PDF.", category: "pdf", icon: PenLine, status: "live" },
  { slug: "pdf-to-word", name: "PDF to Word", description: "Convert PDF documents into editable DOCX.", category: "pdf", icon: FileDown, status: "soon" },
  { slug: "word-to-pdf", name: "Word to PDF", description: "Convert DOCX documents into PDF.", category: "pdf", icon: FileUp, status: "soon" },
  { slug: "pdf-to-ppt", name: "PDF to PowerPoint", description: "Convert PDF slides into editable PPTX.", category: "pdf", icon: Presentation, status: "soon" },
  { slug: "ppt-to-pdf", name: "PowerPoint to PDF", description: "Convert PPTX presentations to PDF.", category: "pdf", icon: Presentation, status: "soon" },
  { slug: "compare-pdfs", name: "Compare Two PDFs", description: "Visual side-by-side PDF comparison.", category: "pdf", icon: GitCompare, status: "live" },

  // Image
  { slug: "compress-image", name: "Compress Image", description: "Reduce image size without visible loss.", category: "image", icon: FileArchive, status: "live", popular: true, featured: true },
  { slug: "crop-image", name: "Crop Image", description: "Crop an image to any aspect ratio.", category: "image", icon: Crop, status: "live", popular: true },
  { slug: "rotate-image", name: "Rotate Image", description: "Rotate and flip images.", category: "image", icon: RotateCw, status: "live" },
  { slug: "convert-image", name: "Image Converter", description: "Convert PNG, JPG, WEBP formats.", category: "image", icon: Repeat, status: "live", popular: true, keywords: ["png", "jpg", "webp"] },
  { slug: "add-text-image", name: "Add Text to Image", description: "Overlay custom text on any image.", category: "image", icon: TextCursorInput, status: "live" },
  { slug: "sharpen-image", name: "Sharpen Image", description: "Enhance image sharpness.", category: "image", icon: Focus, status: "live" },
  { slug: "blur-region", name: "Blur Region / Face", description: "Blur a rectangular region of an image.", category: "image", icon: Sparkles, status: "live" },
  { slug: "image-to-pdf", name: "Image to PDF", description: "Convert one or many images into a PDF.", category: "image", icon: FileImage, status: "live" },
  { slug: "qr-code", name: "QR Code Generator", description: "Generate high-quality QR codes.", category: "image", icon: QrCode, status: "live", featured: true },
  { slug: "background-remover", name: "Background Remover", description: "Remove image backgrounds automatically.", category: "image", icon: Eraser, status: "soon" },

  // Audio
  { slug: "trim-audio", name: "Trim Audio", description: "Cut a specific range from an audio file.", category: "audio", icon: Scissors, status: "live" },
  { slug: "merge-audio", name: "Merge Audio", description: "Combine multiple audio files.", category: "audio", icon: Merge, status: "live" },
  { slug: "volume-changer", name: "Volume Changer", description: "Increase or decrease audio volume.", category: "audio", icon: Volume2, status: "live" },
  { slug: "fade-audio", name: "Fade In / Fade Out", description: "Add a fade-in or fade-out effect to audio.", category: "audio", icon: Waves, status: "live" },
  
  // Social
  { slug: "youtube-thumbnail", name: "YouTube Thumbnail Downloader", description: "Download any YouTube video thumbnail in HD.", category: "social", icon: Youtube, status: "live" },
  { slug: "instagram-reel", name: "Instagram Reel Downloader", description: "Download public Instagram reels.", category: "social", icon: ImagePlay, status: "soon" },
  { slug: "instagram-photo", name: "Instagram Photo Downloader", description: "Save public Instagram photos.", category: "social", icon: Instagram, status: "soon" },
  { slug: "instagram-story", name: "Instagram Story Downloader", description: "Save public Instagram stories.", category: "social", icon: Instagram, status: "soon" },
  { slug: "instagram-dp", name: "Instagram Profile Picture", description: "Download an Instagram profile picture in full size.", category: "social", icon: User, status: "soon" },
  { slug: "instagram-thumb", name: "Reel Thumbnail Downloader", description: "Grab the cover image of any public reel.", category: "social", icon: ImageIcon, status: "soon" },
  { slug: "youtube-video", name: "YouTube Video Downloader", description: "Download YouTube videos as MP4.", category: "social", icon: Youtube, status: "soon" },
  { slug: "youtube-mp3", name: "YouTube MP3 Downloader", description: "Extract YouTube audio as MP3.", category: "social", icon: Music, status: "soon" },
  { slug: "youtube-transcript", name: "YouTube Transcript", description: "Extract the transcript from a YouTube video.", category: "social", icon: FileText, status: "soon" },
  { slug: "facebook-video", name: "Facebook Video Downloader", description: "Download public Facebook videos.", category: "social", icon: Facebook, status: "soon" },
  { slug: "twitter-video", name: "X (Twitter) Video Downloader", description: "Save public X video posts.", category: "social", icon: Twitter, status: "soon" },
  { slug: "pinterest-image", name: "Pinterest Image Downloader", description: "Download images from Pinterest pins.", category: "social", icon: PinIcon, status: "soon" },
  { slug: "linkedin-video", name: "LinkedIn Video Downloader", description: "Download public LinkedIn videos.", category: "social", icon: Linkedin, status: "soon" },
  
  // Text
  { slug: "word-counter", name: "Word Counter", description: "Count words, sentences and paragraphs.", category: "text", icon: TypeIcon, status: "live", popular: true },
  { slug: "password-generator", name: "Password Generator", description: "Generate strong, secure passwords.", category: "text", icon: KeyRound, status: "live", popular: true, featured: true },
  { slug: "text-comparison", name: "Text Comparison", description: "Compare two texts intelligently — detect additions, deletions, modifications, contradictions and numeric changes.", category: "text", icon: GitCompare, status: "live", popular: true },

  // Student
  { slug: "cgpa-calculator", name: "CGPA Calculator", description: "Compute CGPA & convert to percentage.", category: "student", icon: Award, status: "live", featured: true },
  { slug: "percentage-calculator-student", name: "Marks Percentage", description: "Calculate percentage across multiple subjects.", category: "student", icon: Percent, status: "live" },
  { slug: "attendance-calculator", name: "Attendance Calculator", description: "Track attendance and see bunkable classes.", category: "student", icon: CalendarCheck, status: "live", popular: true, featured: true },

  // Utility
  { slug: "unit-converter", name: "Unit Converter", description: "Convert length, weight, temperature and more.", category: "utility", icon: Ruler, status: "live", popular: true },
  { slug: "age-calculator", name: "Age Calculator", description: "Exact age in years, months, days.", category: "utility", icon: Cake, status: "live", popular: true },
  { slug: "percentage-calculator", name: "Percentage Calculator", description: "All common percentage calculations.", category: "utility", icon: Percent, status: "live" },
  { slug: "bmi-calculator", name: "BMI Calculator", description: "Body Mass Index with health category.", category: "utility", icon: Activity, status: "live" },
  { slug: "timezone-converter", name: "Time Zone Converter", description: "Convert any time across time zones.", category: "utility", icon: Globe, status: "live" },
  { slug: "url-shortener", name: "URL Shortener", description: "Create a short link instantly.", category: "utility", icon: Link2, status: "live" },
  { slug: "date-difference", name: "Date Difference", description: "Days, weeks, months between two dates.", category: "utility", icon: CalendarClock, status: "live" },
  { slug: "countdown-timer", name: "Countdown Timer", description: "Count down to any moment.", category: "utility", icon: Timer, status: "live" },
  { slug: "stopwatch", name: "Stopwatch", description: "Precise stopwatch with laps.", category: "utility", icon: TimerReset, status: "live" },

  // Finance
  { slug: "currency-converter", name: "Currency Converter", description: "Live currency conversion with INR support.", category: "finance", icon: Coins, status: "live" },
  { slug: "emi-calculator", name: "EMI Calculator", description: "Indian-standard EMI with amortization.", category: "finance", icon: Calculator, status: "live" },
  { slug: "loan-calculator", name: "Loan Calculator", description: "Estimate loan cost, interest and tenure.", category: "finance", icon: Calculator, status: "live" },
  { slug: "savings-goal-calculator", name: "Savings Goal Calculator", description: "See exactly when you'll hit your savings goal or what it takes to get there.", category: "finance", icon: PiggyBank, status: "live", popular: true, featured: true },
  { slug: "expense-tracker", name: "Expense Tracker", description: "Track your expenses and manage your budget.", category: "finance", icon: Wallet, status: "live", popular: true, featured: true },
];

export function getCategory(id: CategoryId): Category {
  return CATEGORIES.find((c) => c.id === id)!;
}

export function getCategoryBySlug(slug: string): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}

export function getToolBySlug(slug: string): Tool | undefined {
  return TOOLS.find((t) => t.slug === slug);
}

export function toolsByCategory(id: CategoryId): Tool[] {
  return TOOLS.filter((t) => t.category === id);
}

export function liveTools(): Tool[] {
  return TOOLS.filter((t) => t.status === "live");
}

export function popularTools(): Tool[] {
  return TOOLS.filter((t) => t.popular);
}

export function featuredTools(): Tool[] {
  return TOOLS.filter((t) => t.featured);
}