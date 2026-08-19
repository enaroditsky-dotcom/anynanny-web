import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AnyNanny",
    short_name: "AnyNanny",
    start_url: "/",
    display: "standalone",
    background_color: "#FDFBF6",
    theme_color: "#001F3F",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png"
      }
    ]
  };
}
