import { ImageResponse } from "next/og";
import { sectorConfig } from "@/config/sector.config";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** Favicon : monogramme de la fiche secteur dans un carré arrondi. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: sectorConfig.company.accentColor,
          color: "white",
          borderRadius: 16,
          fontSize: 30,
          fontWeight: 700,
          letterSpacing: -1,
        }}
      >
        {sectorConfig.company.logo.value}
      </div>
    ),
    size,
  );
}
