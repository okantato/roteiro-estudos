import type { Metadata } from "next";
import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Roteiro de estudos",
  description: "Organize seus estudos com autenticação segura.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClerkProvider>
          <header className="flex h-16 items-center justify-end gap-4 border-b border-black/10 px-6 dark:border-white/10">
            <Suspense
              fallback={
                <div className="h-9 w-24 animate-pulse rounded-full bg-black/10 dark:bg-white/10" />
              }
            >
              <Show when="signed-out">
                <SignInButton />
                <SignUpButton>
                  <button className="h-10 cursor-pointer rounded-full bg-violet-700 px-5 text-sm font-medium text-white hover:bg-violet-800">
                    Criar conta
                  </button>
                </SignUpButton>
              </Show>
              <Show when="signed-in">
                <UserButton />
              </Show>
            </Suspense>
          </header>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
