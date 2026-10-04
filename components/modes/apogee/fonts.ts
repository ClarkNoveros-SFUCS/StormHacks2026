// Apogee's type, from the inspo (inspo/krillion-space-variant/apogee.html): a stencil display face
// for big numbers and tier names, a mono for telemetry. Body text stays the site's Mulish.
import { Big_Shoulders_Stencil, IBM_Plex_Mono } from "next/font/google";

export const apogeeDisplay = Big_Shoulders_Stencil({ subsets: ["latin"], weight: ["700", "800", "900"], variable: "--font-apogee-display" });
export const apogeeData = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-apogee-data" });

/** Put on the screen's root next to data-theme="apogee". */
export const apogeeFontVars = `${apogeeDisplay.variable} ${apogeeData.variable}`;
