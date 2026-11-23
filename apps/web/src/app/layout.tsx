import type { Metadata } from 'next';
import './globals.css';
import ThemeToggle from '../components/theme-toggle';

export const metadata: Metadata = {
  title: 'Clinic Management System',
  description: 'Clinic patient and visit management',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<ThemeToggle /></body>
    </html>
  );
}
