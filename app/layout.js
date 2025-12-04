import "./globals.css";

export const metadata = {
  title: "Client Portfolio Generator",
  description: "Generate comprehensive search portfolios powered by Perplexity AI",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
