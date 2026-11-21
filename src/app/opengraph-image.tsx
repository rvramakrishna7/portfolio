import { ImageResponse } from "next/og";

export const alt = "Ramakrishna | Software Engineer (Full-Stack, Backend, AI)";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          backgroundColor: "#0B0B0D",
          color: "#F5F5F7",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              fontSize: "24px",
              color: "#2997FF",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              marginBottom: "32px",
            }}
          >
            India
          </div>
          <div
            style={{
              fontSize: "76px",
              fontWeight: 700,
              color: "#F5F5F7",
              lineHeight: 1.1,
              marginBottom: "28px",
            }}
          >
            Ramakrishna
          </div>
          {/* Per DEC-013: explicit flex row with columnGap 11px ensures uniform word gaps in Satori */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              flexWrap: "nowrap",
              columnGap: "11px",
              alignItems: "baseline",
              fontSize: "32px",
              color: "#A1A1A6",
              lineHeight: 1.3,
            }}
          >
            <span>Full-stack</span>
            <span>and</span>
            <span>AI</span>
            <span>automation</span>
            <span>developer</span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              borderTop: "1px solid #303034",
              width: "100%",
              height: "1px",
            }}
          />
          <div
            style={{
              display: "flex",
              fontSize: "20px",
              color: "#86868B",
            }}
          >
            Software Engineer · Full-stack, backend and AI systems
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
