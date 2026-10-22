import type { Metadata, Viewport } from 'next';
import './globals.css';
import './v3.css';

export const metadata: Metadata = {
  title: 'HYBRYD Workout Timer',
  description: 'HYROX workout timer for Hybryd Mallorca',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'HYBRYD',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#199DA9',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-hclub-black text-hclub-white min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
