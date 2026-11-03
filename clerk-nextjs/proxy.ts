import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    // Ignora internos do Next e arquivos estáticos, exceto se houver query string.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Inclui APIs e o caminho de proxy do Clerk.
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
