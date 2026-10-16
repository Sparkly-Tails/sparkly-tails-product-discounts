import type { Metadata } from "next";
import { SavedToastProvider } from "@/components/SavedToast";
import packageJson from "../../package.json";
import "./globals.css";

// Every page shows live shop data behind the ID-token login: render per request, never at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sparkly Tails — Product Discounts",
  description: "Per-product volume pricing admin",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <meta name="shopify-api-key" content={process.env.NEXT_PUBLIC_SHOPIFY_API_KEY} />
        {/* Plain <script>, not next/script — Shopify requires App Bridge to be
            the literal first <script> tag with no async/defer/type=module.
            next/script's beforeInteractive strategy doesn't guarantee that. */}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
      </head>
      <body>
        <div className="text-xs text-subtle text-right px-4 pt-1">
          v{packageJson.version}
        </div>
        <SavedToastProvider>{children}</SavedToastProvider>
      </body>
    </html>
  );
}
