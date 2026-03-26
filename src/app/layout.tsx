import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'H-CLUB Workout Timer',
  description: 'HYROX Workout Timer für H-Club',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="bg-hclub-black text-hclub-white min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
