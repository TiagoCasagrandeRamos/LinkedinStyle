import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LinkedinStyle", short_name: "LinkedinStyle", start_url: "/", display: "standalone",
    background_color: "#1f2328", theme_color: "#1f2328", lang: "pt-BR",
  };
}
