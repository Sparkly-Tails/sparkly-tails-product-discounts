import type { Metadata } from "next";
import { headers } from "next/headers";
import AuthTokenInit from "@/components/AuthTokenInit";
import packageJson from "../../package.json";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sparkly Tails — Product Discounts",
  description: "Per-product volume pricing admin",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const authToken = (await headers()).get("x-auth-token") ?? "";

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
        <AuthTokenInit initialToken={authToken} />
        <div className="text-xs text-subtle text-right px-4 pt-1">
          v{packageJson.version}
        </div>
        {children}
      </body>
    </html>
  );
}
