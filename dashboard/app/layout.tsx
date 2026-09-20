import './globals.css'; import './v2.css'; import type { Metadata } from 'next';
export const metadata:Metadata={title:'CarbonScope Intelligence',description:'Climate and energy decision intelligence from CodeFest Datathon 2026 datasets'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
