import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JARVIS NEXUS — Embodied Spatial Sanctuary",
  description:
    "A persistent, owner-controlled intelligence embodied as a living adult female NPC inside a real-time 3D operational sanctuary: natural locomotion, room-scale volumetric scenario reconstruction, typed epistemic memory, and hardware-grade owner switches.",
  keywords: ["JARVIS", "NEXUS", "FRIDAY", "Iron Man", "3D assistant", "embodied AI", "Three.js", "scenario reconstruction"],
  authors: [{ name: "JARVIS NEXUS" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // pinch-zoom would stretch the WebGL bitmap — the 3D camera IS the zoom
  viewportFit: "cover",
  themeColor: "#02070b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
