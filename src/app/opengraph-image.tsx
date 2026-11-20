import { ImageResponse } from "next/og";

export const alt = "Ramakrishna | Full-stack and AI automation developer";
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
          backgroundColor: "#0b0d10",
          color: "#ece8df",
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
              color: "#f2b705",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              marginBottom: "32px",
            }}
          >
            Mumbai, India
          </div>
          <div
            style={{
              fontSize: "76px",
              fontWeight: 700,
              color: "#ece8df",
              lineHeight: 1.1,
              marginBottom: "28px",
            }}
          >
            Ramakrishna
          </div>
          {/* Satori ignores CSS word-spacing on plain text runs; explicit flex items with columnGap ensure uniform word gaps */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              flexWrap: "nowrap",
              columnGap: "11px",
              alignItems: "baseline",
              fontSize: "32px",
              color: "#ece8df",
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
            borderTop: "1px solid #262c35",
            width: "100%",
            height: "1px",
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}
